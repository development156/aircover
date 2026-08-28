import 'server-only'

import {
  PostMediaSchema,
  PostSchema,
  PostStatusSchema,
  PostVariantSchema,
  type Post,
  type PostMedia,
  type PostStatus,
  type PostVariant,
} from '@sahoda/shared'

import { cache } from 'react'

import { createServerSupabase } from '@/lib/supabase/server'
import { variantStatusRow, type VariantStatusRow } from '@/lib/posts/variant-status'
import { formatsFromRows, type VariantFormats } from '@/lib/posts/variant-format'
import {
  inconclusive,
  versionsFromRows,
  VERSIONS_UNSUPPORTED,
  type VariantVersions,
} from '@/lib/posts/variant-version'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * Post reads, RLS-scoped via the Clerk session JWT. `posts` / `post_variants` /
 * `post_media` all carry full member CRUD policies, so these are plain PostgREST
 * selects — no RPC needed.
 *
 * Every read degrades to empty/null rather than throwing: the app shell must
 * survive a read hiccup, exactly as `listWorkspaces` does. Rows are parsed
 * per-row so one malformed row cannot take down a list.
 *
 * Every read is also filtered to the ACTIVE workspace. RLS remains the security
 * boundary and this filter is NOT an authorization check — the cookie behind the
 * active workspace is not a grant (see `lib/workspaces.ts`). It is a CORRECTNESS
 * filter: the member policy is
 * `workspace_id in (select app.member_workspace_ids())`, which admits EVERY
 * workspace the user belongs to. Unscoped, `listPosts` would blend two tenants
 * into one list while `createPost` / `generateVariants` charge the active one —
 * so opening another workspace's post from that list and generating would debit
 * the wrong wallet and then fail the `(post_id, workspace_id)` composite FK on
 * save, billing the user for variants they cannot keep.
 */

/**
 * Memoised per request so a post page's three reads share one workspace lookup.
 * `null` here folds "no workspace" into "could not tell" ON PURPOSE, and only the
 * reads whose caller cannot render the difference use it — `readPosts` below
 * takes the three-way read directly.
 */
const activeWorkspaceId = cache(async (): Promise<string | null> => {
  const read = await activeWorkspaceRead()
  return read.status === 'ok' ? read.workspace.id : null
})

/**
 * Hard cap on `listPosts`. Exported because the list screen must be able to SAY
 * it is capped — a truncated list rendered as if it were the whole set is a lie
 * about the workspace's contents.
 */
export const LIST_LIMIT = 100

/**
 * The three answers a post list can give, and why `Post[]` could not carry them.
 *
 * `listPosts` returned `[]` for a genuinely empty workspace, for an account with
 * no workspace at all, AND for a read that failed — so /posts and /planner said
 * "Nothing drafted yet" to a workspace holding forty posts whose query hiccuped,
 * and offered "Create post" as the remedy. An empty list is the one shape that
 * makes a false claim look like a designed screen.
 */
export type PostsRead =
  { status: 'ok'; posts: Post[] } | { status: 'no-workspace' } | { status: 'unreadable' }

export async function readPosts(): Promise<PostsRead> {
  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'unreadable') return { status: 'unreadable' }
    if (workspace.status === 'none') return { status: 'no-workspace' }
    const workspaceId = workspace.workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(LIST_LIMIT)

    if (error || !data) {
      if (error) console.error('[posts] list failed', error.code, error.message)
      return { status: 'unreadable' }
    }
    return {
      status: 'ok',
      posts: data.flatMap((row) => {
        const parsed = PostSchema.safeParse(row)
        return parsed.success ? [parsed.data] : []
      }),
    }
  } catch (error) {
    console.error('[posts] list threw', error instanceof Error ? error.message : 'unknown')
    return { status: 'unreadable' }
  }
}

/**
 * The lossy view. Correct only where the caller has ALREADY decided which of the
 * three it is in — /home short-circuits on the wallet's `no-workspace` before it
 * reaches a post — and never where an empty list is about to be rendered as a
 * sentence.
 */
export async function listPosts(): Promise<Post[]> {
  const read = await readPosts()
  return read.status === 'ok' ? read.posts : []
}

export async function getPost(postId: string): Promise<Post | null> {
  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return null

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (error || !data) return null
    const parsed = PostSchema.safeParse(data)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * The raw `post_variants` rows for one post, before anything parses them.
 *
 * Memoised per request so `listVariants` and `readVariantVersions` — which the
 * post editor calls together — share ONE query rather than two. The two need
 * different things from the same rows: the parse produces the typed variant, and
 * the version read salvages the one column the frozen contract discards.
 *
 * Returns `[]` on any failure, exactly as the read it replaced did.
 */
const variantRows = cache(async (postId: string): Promise<Record<string, unknown>[] | null> => {
  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return null

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_variants')
      .select('*')
      .eq('post_id', postId)
      .eq('workspace_id', workspaceId)
      .order('channel', { ascending: true })

    // `null` for "we could not look", `[]` for "this post has no channel copy
    // yet". They used to be the same value, and `attachAssetToPost` turns that
    // value into a decision about what may be written — see the strict readers
    // below.
    if (error || !data) return null
    return data as Record<string, unknown>[]
  } catch {
    return null
  }
})

function parseVariants(rows: Record<string, unknown>[]): PostVariant[] {
  return rows.flatMap((row) => {
    const parsed = PostVariantSchema.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
}

/**
 * The channel versions, or `null` when the read did not get an answer.
 *
 * Use this anywhere the answer DECIDES something — the attach gate, a cap, a
 * refusal. `listVariants` below is the lossy view for display.
 */
export async function readVariants(postId: string): Promise<PostVariant[] | null> {
  const rows = await variantRows(postId)
  return rows === null ? null : parseVariants(rows)
}

/**
 * The lossy view, kept because a LIST that renders empty is a smaller wrong than
 * a screen that will not render at all — and every display caller already treats
 * `[]` as "nothing to show".
 *
 * It is NOT safe for a decision. `readVariants` is.
 */
export async function listVariants(postId: string): Promise<PostVariant[]> {
  return (await readVariants(postId)) ?? []
}

/**
 * What kind of post each channel's version was written as.
 *
 * Free alongside `listVariants`: both read the same memoised rows, and this one
 * salvages the second column the frozen contract strips. See `variant-format.ts`.
 */
export async function readVariantFormats(postId: string): Promise<VariantFormats> {
  return (await readVariantFormatsStrict(postId)) ?? {}
}

/**
 * The formats, or `null` when the read failed.
 *
 * `{}` is the documented value for "no version states an intent", and
 * `decideAttach` reads it as exactly that — so handing it `{}` for a failed read
 * makes the per-format rule vanish and a Story accept a landscape photo. The
 * comment at the attach site already warned that "`{}` would have compiled and
 * looked identical while accepting both"; it was about a missing ARGUMENT, and
 * the reader could produce the same value on its own.
 */
export async function readVariantFormatsStrict(postId: string): Promise<VariantFormats | null> {
  try {
    const rows = await variantRows(postId)
    return rows === null ? null : formatsFromRows(rows)
  } catch {
    return null
  }
}

/**
 * What each channel's copy is at, for the compare-and-set save.
 *
 * ── THE ONLY EXTRA QUERY, AND WHEN IT RUNS ───────────────────────────────────
 * Normally none: the rows already fetched either carry a `version` field or they
 * do not, and looking is free. The exception is a post with NO channel copy yet,
 * where there are no rows to look at — see `inconclusive`. Only then does this
 * ask the database a direct question, and it asks the cheapest one there is:
 * select the column and see whether the request is refused.
 *
 * That probe reads WHETHER it failed, never WHY. Branching on an error code would
 * mean matching strings nobody here has observed — Postgres and the API layer in
 * front of it report a missing column differently — and a mismatched code sends
 * the save down the wrong path silently. "It was refused" is a fact this code can
 * actually establish.
 *
 * A refusal for some other reason — a dropped connection mid-probe — is therefore
 * read as "not supported", and the save falls back to the path the app uses today.
 * That is the safe direction: it is never worse than the current behaviour.
 */
export async function readVariantVersions(postId: string): Promise<VariantVersions> {
  try {
    const rows = await variantRows(postId)
    // A read that did not get an answer cannot say whether versions are
    // supported. Falling through to the capability probe is the same route a
    // post with no rows takes, and it asks the database directly — which is a
    // better answer than inferring one from rows we never saw.
    if (rows === null) return await readVariantVersionSupport()
    const fromRows = versionsFromRows(rows)
    if (fromRows.supported || !inconclusive(rows)) return fromRows

    return await readVariantVersionSupport()
  } catch {
    return VERSIONS_UNSUPPORTED
  }
}

/**
 * Does this database track versions at all? Asked without naming a post.
 *
 * The create flow needs exactly this and cannot use the read above: it renders
 * before any post exists, so there are no rows to look at and no id to look them
 * up by. Without it, the FIRST save of a brand-new post would silently fall back
 * to last-write-wins — which is the save two tabs are most likely to make at the
 * same moment.
 *
 * Reads WHETHER the request was refused, never why. See `readVariantVersions`.
 */
/**
 * How long a capability answer is trusted before it is asked again.
 *
 * ── WHY THIS IS MEMOISED ACROSS REQUESTS AND NOT JUST WITHIN ONE ─────────────
 * Before the migration is applied the probe below is REFUSED, every time, and a
 * post with no channel copy yet is an ordinary state — so per-render probing
 * would mean a rejected request on every fresh post someone opens, for however
 * many weeks the migration sits unapplied. That is real log noise for a question
 * whose answer changes at most once, ever.
 *
 * The cost of caching it is staleness in one direction: for up to this long after
 * the founder applies the migration, a running instance still believes the column
 * is absent and saves the way it always has. That is the safe direction — it is
 * exactly today's behaviour — and it clears itself without a deployment.
 */
const CAPABILITY_TTL_MS = 5 * 60 * 1000

let capability: { at: number; value: VariantVersions } | null = null

export const readVariantVersionSupport = cache(async (): Promise<VariantVersions> => {
  const now = Date.now()
  if (capability !== null && now - capability.at < CAPABILITY_TTL_MS) return capability.value

  try {
    const workspaceId = await activeWorkspaceId()
    // NOT cached: without a workspace this read learned nothing about the column,
    // and storing "unsupported" here would answer for every later request too.
    if (workspaceId === null) return VERSIONS_UNSUPPORTED

    const supabase = createServerSupabase()
    const { error } = await supabase
      .from('post_variants')
      .select('version')
      .eq('workspace_id', workspaceId)
      .limit(1)

    // No rows is a fine answer here. The question was whether the column can be
    // named at all, and it was answered by the request not being refused.
    const value: VariantVersions = error ? VERSIONS_UNSUPPORTED : { supported: true, byChannel: {} }
    capability = { at: now, value }
    return value
  } catch {
    // A throw says nothing about the column either — it is not remembered.
    return VERSIONS_UNSUPPORTED
  }
})

/**
 * The lifecycle columns of a page of posts, and NOTHING ELSE.
 *
 * ── WHY THE COLUMN LIST IS THE POINT ─────────────────────────────────────────
 * This read exists to be polled while the writer has the screen open, so what it
 * CANNOT return matters more than what it can. `select` names four columns:
 * `id, status, scheduled_at, updated_at`. It does not name `title`, `body` or
 * `channels`, so a live update is structurally incapable of carrying the
 * writer's own draft back at them mid-sentence — `use-autosave.ts` owns that
 * text and this read cannot reach it even by mistake.
 *
 * `updated_at` is returned for ordering and diagnosis only. It is deliberately
 * NOT fed to `detectConflict`: a publisher bumping the row is not another person
 * editing it, and reporting it as divergence would fire that notice on a loop
 * for the whole duration of a publish.
 *
 * Bounded by the same `LIST_LIMIT` the list itself uses, and degrades to an
 * empty array on any failure — a poll that cannot read must leave the last
 * server-rendered state standing, never blank it.
 */
export interface PostLifecycleRow {
  id: string
  status: PostStatus
  scheduledAt: string | null
  updatedAt: string
}

export async function listPostLifecycles(postIds: string[]): Promise<PostLifecycleRow[]> {
  if (postIds.length === 0) return []

  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return []

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('posts')
      .select('id, status, scheduled_at, updated_at')
      .eq('workspace_id', workspaceId)
      .in('id', postIds)
      .limit(LIST_LIMIT)

    if (error || !data) {
      if (error) console.error('[posts] lifecycle read failed', error.code, error.message)
      return []
    }

    return data.flatMap((row) => {
      const record = row as Record<string, unknown>
      const status = PostStatusSchema.safeParse(record.status)
      // A status outside the enum is not one this app has a chip, a certainty
      // level or a word for. Dropping the row leaves the server-rendered state
      // in place, which is the honest fallback; inventing a status is not.
      if (!status.success) return []
      if (typeof record.id !== 'string') return []
      return [
        {
          id: record.id,
          status: status.data,
          scheduledAt: typeof record.scheduled_at === 'string' ? record.scheduled_at : null,
          updatedAt: typeof record.updated_at === 'string' ? record.updated_at : '',
        },
      ]
    })
  } catch (error) {
    console.error(
      '[posts] lifecycle read threw',
      error instanceof Error ? error.message : 'unknown',
    )
    return []
  }
}

/**
 * Media attached to THIS post.
 *
 * A row may have come from the workspace library (`asset_id` set, pointing at
 * the library's own stored object) or straight from this post's uploader
 * (`asset_id` null). Both are attachments and both publish identically — the
 * publisher reads `storage_path` and does not look at `asset_id` at all.
 *
 * Ordered by `created_at` because the table has no position column (see
 * REQUESTS.md); `asset_usages.position` records the order for library files but
 * is not the publisher's source.
 */
/**
 * The attachments, or `null` when the read did not get an answer.
 *
 * The distinction is load-bearing on the WRITE path. `attachAssetToPost` uses
 * this list for two decisions — the duplicate check and `existing.length`, which
 * is what every channel's media cap is measured against. An unreadable read
 * arriving as `[]` switched BOTH off: the same photo could be attached twice,
 * and an eleventh file admitted to a channel that allows ten.
 */
export async function readMedia(postId: string): Promise<PostMedia[] | null> {
  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return null

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_media')
      .select('*')
      .eq('post_id', postId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true })

    if (error || !data) return null
    return data.flatMap((row) => {
      const parsed = PostMediaSchema.safeParse(row)
      return parsed.success ? [parsed.data] : []
    })
  } catch {
    return null
  }
}

/** The lossy view, for display only. A decision must use `readMedia`. */
export async function listMedia(postId: string): Promise<PostMedia[]> {
  return (await readMedia(postId)) ?? []
}

/**
 * Per-channel publish state for a page of posts, in one query.
 *
 * ── WHY THE LIST NEEDS THIS ──────────────────────────────────────────────────
 * The posts list showed which channels a post TARGETS and one badge for the post
 * as a whole. Neither answers the question a shop owner actually has, which is
 * "did it go out?" — and for a `partial` post the single badge cannot answer it
 * even in principle, because the honest answer is different per channel.
 *
 * One query for the whole page rather than one per card: a 50-post list would
 * otherwise be 50 round-trips, and the list is the screen people leave open.
 */
export async function listVariantStates(
  postIds: string[],
): Promise<Map<string, VariantStatusRow[]>> {
  const byPost = new Map<string, VariantStatusRow[]>()
  if (postIds.length === 0) return byPost

  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return byPost

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_variants')
      .select('*')
      .eq('workspace_id', workspaceId)
      .in('post_id', postIds)
      .order('channel', { ascending: true })

    if (error || !data) return byPost

    for (const row of data) {
      const parsed = PostVariantSchema.safeParse(row)
      if (!parsed.success) continue
      const list = byPost.get(parsed.data.post_id) ?? []
      list.push(variantStatusRow(parsed.data))
      byPost.set(parsed.data.post_id, list)
    }
    return byPost
  } catch {
    return byPost
  }
}

/**
 * Attached media for a page of posts, in one query.
 *
 * ── WHY THE LIST NEEDS THIS AT ALL ───────────────────────────────────────────
 * The posts list has never read `post_media`, so a post with a photo and a post
 * without one rendered identically. On the full-width rows that was a gap; on
 * the tile grid it is a defect, because the tile is mostly the space where the
 * photo would be and the reader is looking straight at it.
 *
 * ── ONE QUERY, LIKE `listVariantStates`, AND FOR THE SAME REASON ─────────────
 * `readMedia` is per post. A page of `LIST_LIMIT` posts through that is
 * `LIST_LIMIT` round trips on the screen people leave open. This is the same
 * shape as the variant read beside it: one `in` over the whole page, grouped in
 * memory, ordered so the FIRST row is the one the tile shows.
 *
 * A row that fails to parse is dropped rather than faked, exactly as it is in
 * `readMedia`.
 *
 * ── NULL WHEN IT COULD NOT BE READ, AND THAT IS THE WHOLE POINT ─────────────
 * The first version returned a plain `Map` and an EMPTY one on every failure —
 * no workspace, a PostgREST error, a thrown exception — which is byte-identical
 * to a page whose posts genuinely have no photos. The tiles then rendered as a
 * designed photo-less screen, and a writer whose read hiccuped would attach a
 * second copy of a photo already on the post. That is precisely the confusion
 * `MediaPeek` was written to prevent, reintroduced one level upstream of it.
 *
 * It is also the shape this file already fixed once: `listPosts` returning `[]`
 * for both empty and failed is the defect `PostsRead` exists for, and
 * `readMedia` returns `PostMedia[] | null` for the same reason. This now matches
 * them. `null` means the question was not answered; an empty map means it was,
 * and the answer is none.
 *
 * The asymmetry with `listVariantStates` beside it is deliberate rather than an
 * inconsistency: a variant read failing empty DEGRADES a chip to a weaker claim,
 * while a media read failing empty makes a POSITIVE false claim about what is on
 * the post. Failing quiet is only safe when the quiet answer is the weaker one.
 */
export async function listPostMedia(postIds: string[]): Promise<Map<string, PostMedia[]> | null> {
  const byPost = new Map<string, PostMedia[]>()
  if (postIds.length === 0) return byPost

  try {
    const workspaceId = await activeWorkspaceId()
    if (workspaceId === null) return null

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('post_media')
      .select('*')
      .eq('workspace_id', workspaceId)
      .in('post_id', postIds)
      .order('created_at', { ascending: true })

    if (error || !data) return null

    for (const row of data) {
      const parsed = PostMediaSchema.safeParse(row)
      if (!parsed.success) continue
      const list = byPost.get(parsed.data.post_id) ?? []
      list.push(parsed.data)
      byPost.set(parsed.data.post_id, list)
    }
    return byPost
  } catch {
    return null
  }
}
