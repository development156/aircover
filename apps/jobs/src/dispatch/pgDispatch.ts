import { DISPATCHABLE_STATUSES, type Channel, type VariantPublishStatus } from '@sahoda/shared'
import type { PostStatus } from '@sahoda/shared'
import type { PublishMode } from '../publish/mode'
import type { CandidateVariant, DispatchCandidate } from './classify'

/** Never sweep an unbounded set — a backlog drains across runs, not in one statement. */
const DEFAULT_LIMIT = 200

/**
 * The slice of `pg.Pool` this store uses. Narrow on purpose: it is the seam the tests
 * inject through, and it keeps a store that only ever runs three statements from taking a
 * dependency on the whole pool surface.
 */
export interface PgQueryable {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>
}

export interface DispatchStoreOptions {
  pool: PgQueryable
  limit?: number
}

interface CandidateRow extends Record<string, unknown> {
  post_id: string
  workspace_id: string
  status: string
  scheduled_at: string | Date
  variant_id: string | null
  channel: string | null
  publish_status: string | null
  published_mode: string | null
}

/**
 * The database side of the scheduled-publish dispatcher, over the same direct `pg` pool the
 * rest of apps/jobs uses. Server-only: it bypasses RLS and must never be reachable from
 * client code.
 *
 * Three statements: one read, two guarded writes. Both writes carry their guard IN the
 * statement rather than relying on the classifier having checked, because the sweep reads
 * and writes at different instants and a variant can publish in between.
 */
export function createDispatchStore(opts: DispatchStoreOptions) {
  const { pool, limit = DEFAULT_LIMIT } = opts
  const gate = [...DISPATCHABLE_STATUSES]

  /**
   * Posts inside the gate whose time has come, each with its variants and the publish mode
   * proven by that variant's most recent succeeded log.
   *
   * The post set is bounded in a CTE before joining variants: a LIMIT applied after the
   * join would cut a post's variants in half and hand the classifier a post that looks
   * like it has fewer channels than it does — which is how a partial gets misread as a
   * full publish.
   */
  async function listCandidates(): Promise<DispatchCandidate[]> {
    const r = await pool.query<CandidateRow>(
      `with due as (
         select p.id, p.workspace_id, p.status, p.scheduled_at
           from posts p
          where p.status = any($1::text[])
            and p.scheduled_at is not null
            and p.scheduled_at <= now()
          order by p.scheduled_at, p.id
          limit $2
       )
       select d.id            as post_id,
              d.workspace_id  as workspace_id,
              d.status        as status,
              d.scheduled_at  as scheduled_at,
              v.id            as variant_id,
              v.channel       as channel,
              v.publish_status as publish_status,
              l.mode          as published_mode
         from due d
         left join post_variants v
                on v.post_id = d.id
               and v.workspace_id = d.workspace_id
         left join lateral (
              select pl.mode
                from post_publish_logs pl
               where pl.variant_id = v.id
                 and pl.status = 'succeeded'
               order by pl.created_at desc
               limit 1
            ) l on true
        order by d.scheduled_at, d.id, v.created_at, v.id`,
      [gate, limit],
    )

    const byPost = new Map<string, DispatchCandidate>()
    for (const row of r.rows) {
      let candidate = byPost.get(row.post_id)
      if (!candidate) {
        candidate = {
          postId: row.post_id,
          workspaceId: row.workspace_id,
          status: row.status as PostStatus,
          // pg returns timestamptz as a Date. The idempotency key is built from this value
          // as a string, so it is normalised to one shape here rather than at three call
          // sites — two shapes would mean two keys for one scheduled post.
          scheduledAt:
            row.scheduled_at instanceof Date
              ? row.scheduled_at.toISOString()
              : String(row.scheduled_at),
          variants: [],
        }
        byPost.set(row.post_id, candidate)
      }

      // The LEFT JOIN yields one all-null variant row for a post with no variants. That
      // post still needs classifying, so it becomes a candidate with an empty list.
      if (row.variant_id === null || row.channel === null || row.publish_status === null) continue

      candidate.variants.push(toVariant(row))
    }

    return [...byPost.values()]
  }

  /**
   * Mark a post expired — it is past its grace and nothing went out.
   *
   * The NOT EXISTS clause is the owner's standing predicate (ruling 1) and is permanent.
   * It is NOT a duplicate of the classifier's check: the sweep classifies against rows it
   * read earlier, and a variant that publishes in between would otherwise have its post
   * stamped `expired` while its content is live on a platform. Ordering fan-in first
   * narrows that window; only this clause closes it.
   *
   * Resolves false when the guard declines, which the sweep reports as blockedByGuard
   * rather than as an expiry.
   */
  async function expirePost(postId: string, workspaceId: string): Promise<boolean> {
    const r = await pool.query(
      `update posts
          set status = 'expired'
        where id = $1
          and workspace_id = $2
          and status = any($3::text[])
          and not exists (
                select 1
                  from post_variants pv
                 where pv.post_id = posts.id
                   and pv.workspace_id = posts.workspace_id
                   and pv.publish_status = 'published'
              )`,
      [postId, workspaceId, gate],
    )
    return (r.rowCount ?? 0) > 0
  }

  /**
   * Write the status fanned in from the variants. Guarded on the post still sitting in the
   * gate so a concurrent change is not overwritten by a decision made before it.
   */
  async function settlePost(
    postId: string,
    workspaceId: string,
    status: 'published' | 'partial' | 'failed',
  ): Promise<boolean> {
    const r = await pool.query(
      `update posts
          set status = $3
        where id = $1
          and workspace_id = $2
          and status = any($4::text[])`,
      [postId, workspaceId, status, gate],
    )
    return (r.rowCount ?? 0) > 0
  }

  return { listCandidates, expirePost, settlePost }
}

function toVariant(row: CandidateRow): CandidateVariant {
  return {
    variantId: row.variant_id as string,
    channel: row.channel as Channel,
    publishStatus: row.publish_status as VariantPublishStatus,
    // Anything other than the two known modes is treated as unproven. The classifier
    // refuses to promote a post on a null mode, which is the safe reading.
    publishedMode:
      row.published_mode === 'live' || row.published_mode === 'fixture'
        ? (row.published_mode as PublishMode)
        : null,
  }
}
