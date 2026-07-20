import {
  CONSTRAINTS,
  PostInsertSchema,
  PostMediaInsertSchema,
  PostPublishLogSchema,
  PostVariantInsertSchema,
  charCountFor,
  validateVariant,
  type Channel,
} from '@sahoda/shared'
import type { SeedCtx, SeedModule, SeedTableResult } from './context'
import {
  DEMO_MEDIA,
  DEMO_POSTS,
  DEMO_VARIANTS,
  MEDIA_MIME,
  RETRY_CHANNEL,
  RETRY_ERROR,
  RETRY_POST,
  type DemoPost,
  type DemoVariant,
} from './posts.content'
import {
  assertPlatformIdsDistinct,
  permalinkFor,
  platformIdFor,
  publishStatusFor,
  publishedAtFor,
  scheduledAtFor,
} from './posts.publish'
import { minutesFrom } from './time'

// ledger.ts, planner.ts and ops.ts read the catalog through this module, so splitting the
// copy into posts.content.ts stays an internal detail and no importer has to change.
export { DEMO_POSTS, type DemoPost }

/** Dependents build post ids through this, so the label string exists in exactly one place. */
export function postId(ctx: Pick<SeedCtx, 'id'>, labelTail: string): string {
  return ctx.id(`post.${labelTail}`)
}

/**
 * The same rule for variant ids. `post_publish_logs.variant_id` is a bare uuid with no FK
 * (migration 04), so a label built by hand in two places could drift and every publish log
 * would silently point at a variant that does not exist. One builder, no drift.
 */
export function variantId(ctx: Pick<SeedCtx, 'id'>, labelTail: string, channel: Channel): string {
  return ctx.id(`variant.${labelTail}.${channel}`)
}

const byTail = new Map(DEMO_POSTS.map((post) => [post.labelTail, post]))

function postFor(labelTail: string): DemoPost {
  const post = byTail.get(labelTail)
  if (!post) throw new Error(`variant references unknown post ${labelTail}`)
  return post
}

const hashtagsOf = (variant: DemoVariant): string[] => (variant.tags ? variant.tags.split(' ') : [])

/** Instagram parks its hashtags in a closing block; X trails them on the same line. */
function composeBody(variant: DemoVariant): string {
  if (!variant.tags) return variant.body
  return variant.channel === 'instagram'
    ? `${variant.body}\n\n${variant.tags}`
    : `${variant.body} ${variant.tags}`
}

function extrasFor(variant: DemoVariant): Record<string, unknown> | null {
  if (variant.channel === 'gbp') {
    // A GBP business update carries no hashtags. Without this, tags added here later would
    // reach the body through composeBody but never appear in extras.
    if (variant.tags) throw new Error(`${variant.post}/gbp: GBP variants take no hashtags`)
    if (!variant.ctaType) return null
    const allowed = CONSTRAINTS.gbp.gbp?.ctaTypes ?? []
    if (!allowed.includes(variant.ctaType)) {
      throw new Error(`${variant.post}/gbp: ctaType ${variant.ctaType} is not in CONSTRAINTS.gbp`)
    }
    const cta = { ctaType: variant.ctaType }
    return variant.offer ? { ...cta, offer: variant.offer } : cta
  }
  return variant.tags ? { hashtags: hashtagsOf(variant) } : null
}

/** A seeded variant that breaks its own platform spec is a bug, so refuse to write it. */
function checkedCharCount(variant: DemoVariant, body: string): number {
  const spec = CONSTRAINTS[variant.channel]
  const draft = { body, hashtags: hashtagsOf(variant) }
  const { violations } = validateVariant(spec, draft)
  if (violations.length > 0) {
    const detail = violations.map((v) => `${v.code}: ${v.message}`).join('; ')
    throw new Error(`${variant.post}/${variant.channel} breaks its platform spec, ${detail}`)
  }
  return charCountFor(spec, draft)
}

interface UpsertOptions {
  /** Columns JSON-encoded on the way in and cast to jsonb in SQL. */
  readonly json?: readonly string[]
  /** Extra per-column casts, e.g. `{ channels: '::text[]' }`. */
  readonly casts?: Readonly<Record<string, string>>
  /** Append-only tables take 'nothing': block_mutations rejects DO UPDATE outright. */
  readonly onConflict?: 'update' | 'nothing'
}

/**
 * One upsert for all four tables. The column list, the placeholder list and the DO UPDATE
 * set are all derived from the row object's own keys, so they cannot drift apart: writing
 * these three lists by hand per table is how a column ends up inserted on first run but
 * never refreshed on the second, which would break idempotency silently.
 *
 * Only identifiers (table and column names) reach the SQL text, and they come from frozen
 * local literals in this file. Every VALUE is still passed as a $n parameter.
 */
async function upsert(
  ctx: SeedCtx,
  table: string,
  row: Readonly<Record<string, unknown>>,
  options: UpsertOptions = {},
): Promise<void> {
  const cols = Object.keys(row)
  const json = new Set(options.json ?? [])
  const placeholders = cols.map(
    (col, i) => `$${i + 1}${json.has(col) ? '::jsonb' : (options.casts?.[col] ?? '')}`,
  )
  const sets = cols
    .filter((col) => col !== 'id' && col !== 'workspace_id')
    .map((col) => `${col} = excluded.${col}`)
  const action =
    options.onConflict === 'nothing' ? 'do nothing' : `do update set ${sets.join(', ')}`
  const values = cols.map((col) => {
    const value = row[col]
    return json.has(col) && value !== null ? JSON.stringify(value) : value
  })
  await ctx.sql(
    `insert into ${table} (${cols.join(', ')})
     values (${placeholders.join(', ')})
     on conflict (id) ${action}`,
    values,
  )
}

async function insertPosts(ctx: SeedCtx): Promise<number> {
  for (const post of DEMO_POSTS) {
    const row = {
      id: postId(ctx, post.labelTail),
      workspace_id: ctx.workspaceId,
      title: post.title,
      body: post.body,
      status: post.status,
      channels: [...post.channels],
      scheduled_at: scheduledAtFor(post, ctx.now),
      origin: post.origin,
      created_by: ctx.ownerId,
    }
    // Parse the row we are about to write, not a copy of it: drift between this seed and the
    // shared schema has to fail here rather than land as a bad demo row.
    PostInsertSchema.parse({ ...row, scheduled_at: row.scheduled_at?.toISOString() ?? null })
    await upsert(ctx, 'posts', row, { casts: { channels: '::text[]' } })
  }
  return DEMO_POSTS.length
}

async function insertVariants(ctx: SeedCtx): Promise<number> {
  for (const variant of DEMO_VARIANTS) {
    const post = postFor(variant.post)
    const body = composeBody(variant)
    const publishStatus = publishStatusFor(post.status, variant.channel)
    // A permalink on anything but a published variant would claim a post that never went out.
    const platformPostId =
      publishStatus === 'published' ? platformIdFor(variant.post, variant.channel) : null
    const row = {
      id: variantId(ctx, variant.post, variant.channel),
      workspace_id: ctx.workspaceId,
      post_id: postId(ctx, variant.post),
      channel: variant.channel,
      body,
      extras: extrasFor(variant),
      is_linked: variant.isLinked ?? true,
      char_count: checkedCharCount(variant, body),
      publish_status: publishStatus,
      platform_post_id: platformPostId,
      permalink: platformPostId ? permalinkFor(variant.channel, platformPostId) : null,
    }
    PostVariantInsertSchema.parse(row)
    await upsert(ctx, 'post_variants', row, { json: ['extras'] })
  }
  return DEMO_VARIANTS.length
}

async function insertMedia(ctx: SeedCtx): Promise<number> {
  for (const media of DEMO_MEDIA) {
    const row = {
      id: ctx.id(`media.${media.post}.${media.index}`),
      workspace_id: ctx.workspaceId,
      post_id: postId(ctx, media.post),
      // Namespaced so a `--namespace` test run cannot claim the real demo's storage paths.
      storage_path: `demo/${ctx.namespace}/${media.post}-${media.index}.jpg`,
      mime: MEDIA_MIME,
      bytes: media.bytes,
      width: media.width,
      height: media.height,
      alt: media.alt,
      meta: { demo: true, action: 'image_standard' },
    }
    PostMediaInsertSchema.parse(row)
    await upsert(ctx, 'post_media', row, { json: ['meta'] })
  }
  return DEMO_MEDIA.length
}

interface LogAttempt {
  variant: DemoVariant
  attempt: number
  status: 'succeeded' | 'failed'
}

/**
 * One log per variant that actually went out, plus the extra failed first attempt on the book
 * club's GBP post. Skipped variants get none: nothing was ever attempted for them.
 */
function logAttempts(): readonly LogAttempt[] {
  return DEMO_VARIANTS.flatMap((variant) => {
    const status = publishStatusFor(postFor(variant.post).status, variant.channel)
    if (status !== 'published') return []
    return variant.post === RETRY_POST && variant.channel === RETRY_CHANNEL
      ? [
          { variant, attempt: 1, status: 'failed' as const },
          { variant, attempt: 2, status: 'succeeded' as const },
        ]
      : [{ variant, attempt: 1, status: 'succeeded' as const }]
  })
}

async function insertPublishLogs(ctx: SeedCtx): Promise<number> {
  const attempts = logAttempts()
  for (const { variant, attempt, status } of attempts) {
    const channel = variant.channel
    const firedAt = minutesFrom(
      publishedAtFor(postFor(variant.post), channel, ctx.now),
      attempt * 4 - 3,
    )
    const succeeded = status === 'succeeded'
    const platformPostId = succeeded ? platformIdFor(variant.post, channel) : null
    const row = {
      id: ctx.id(`publog.${variant.post}.${channel}.${attempt}`),
      workspace_id: ctx.workspaceId,
      post_id: postId(ctx, variant.post),
      variant_id: variantId(ctx, variant.post, channel),
      // No FK on this column, so the connection module's ordering cannot break the insert.
      connection_id: ctx.id(`connection.${channel}`),
      channel,
      attempt,
      // Every log is 'fixture': the demo publishes nothing, and the honesty flag must say so.
      mode: 'fixture' as const,
      status,
      platform_post_id: platformPostId,
      permalink: platformPostId ? permalinkFor(channel, platformPostId) : null,
      error: succeeded ? null : RETRY_ERROR,
      job_run_id: `demo_fixture_${variant.post}_${channel}_${attempt}`,
      published_at: succeeded ? firedAt : null,
      created_at: firedAt,
    }
    PostPublishLogSchema.parse({
      ...row,
      published_at: row.published_at?.toISOString() ?? null,
      created_at: row.created_at.toISOString(),
    })
    // Append-only: the block_mutations trigger rejects UPDATE, so a re-run must no-op here
    // rather than upsert. Ids stay deterministic, so a second run still adds no rows.
    await upsert(ctx, 'post_publish_logs', row, { json: ['error'], onConflict: 'nothing' })
  }
  return attempts.length
}

export const seedPosts: SeedModule = async (ctx): Promise<readonly SeedTableResult[]> => {
  assertPlatformIdsDistinct()
  const posts = await insertPosts(ctx)
  const variants = await insertVariants(ctx)
  const media = await insertMedia(ctx)
  const logs = await insertPublishLogs(ctx)
  ctx.log(`posts ${posts} · variants ${variants} · media ${media} · publish logs ${logs}`)
  return [
    { table: 'posts', rows: posts },
    { table: 'post_variants', rows: variants },
    { table: 'post_media', rows: media },
    { table: 'post_publish_logs', rows: logs },
  ]
}
