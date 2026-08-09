import type { Pool } from 'pg'
import { assertPlatformPostId, type Channel } from '@sahoda/shared'

/**
 * The database side of the platform-id backfill: one narrow read, one write-once update.
 *
 * ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
 * A publish can succeed and still not learn the platform's post id: the settle loop
 * terminates on `platformPostUrl`, and `platformPostId` is a sibling field that may
 * not have arrived yet. `waitForUrl` now buys one extra read for exactly that reason,
 * but rows written before that fix — and any row where the id genuinely arrives late —
 * are left with a live post and a null analytics key. The Performance panel then reads
 * "didn't return a post id", permanently, because nothing downstream repairs it.
 *
 * ── WHY NOT JUST WIDEN THE RECONCILE SWEEP ───────────────────────────────────
 * `listUnresolvedPublishes` requires `v.permalink is null` and
 * `v.publish_status <> 'published'`. Those predicates are load-bearing, not
 * incidental: they scope that sweep to publishes which did NOT succeed. Dropping
 * either makes it re-examine every successful publish on every tick, and its
 * `applyResolution` writes the analytics key — a recurring pass that re-reads
 * published posts and rewrites their ids is the machinery SL-069 warns about. This is
 * therefore a SEPARATE statement, and it may not grow into a publisher: see
 * `import-graph.guard.test.ts`, which proves this directory cannot reach the publish
 * path at all.
 */

/**
 * How many rows one pass takes on.
 *
 * Each row costs at least one platform lookup by the caller, so this is a request
 * budget as much as a row budget. Oldest-first, so a backlog drains across passes
 * instead of the same head being retried.
 */
export const DEFAULT_BACKFILL_LIMIT = 25

export interface VariantMissingPlatformId {
  variantId: string
  workspaceId: string
  postId: string
  channel: Channel
  /** Never a `fixture://` URL — those are excluded by the query. */
  permalink: string
}

export interface BackfillStoreOptions {
  pool: Pool
  limit?: number
}

export function createBackfillStore(opts: BackfillStoreOptions) {
  const { pool } = opts
  const limit = opts.limit ?? DEFAULT_BACKFILL_LIMIT

  /**
   * Published, has a real permalink, has no analytics key.
   *
   * `permalink not like 'fixture://%'` is defence in depth, and it is worth being
   * precise about what it does and does not do today. Every published variant in
   * production IS a fixture (`mode: 'fixture'`, verified 2026-08-09) — but the fixture
   * adapter always mints an id (`fixture.test.ts`), so `platform_post_id is null`
   * already excludes every one of them. Verified: both this query and the same query
   * without this term return 0 rows against production.
   *
   * It is kept because that is a property of the fixture adapter, not of this table. A
   * fixture path that ever returned a null id — or a row written by an older one —
   * would otherwise be eligible, and minting an analytics key for a post that never
   * existed points a real metrics endpoint at nothing. `variant-status.ts` refuses to
   * carry a fixture id forward at read time; this refuses to create one at write time.
   *
   * ── WHAT THIS STORE DOES NOT CHECK ───────────────────────────────────────────
   * PROVENANCE. `applyPlatformId` validates SHAPE (not a 24-hex provider id) and
   * ATOMICITY (write-once). It cannot tell a resolved id from an invented one. A media
   * id derived from a permalink shortcode is 17 decimal digits and passes every guard
   * here — and a wrong-but-well-shaped id makes Zernio answer 202 with every metric 0,
   * permanently and indistinguishably from a real zero-engagement post. Any caller must
   * therefore VERIFY an id resolves before passing it here; this store is not that
   * check and must not be read as one.
   */
  async function listVariantsMissingPlatformId(): Promise<VariantMissingPlatformId[]> {
    const r = await pool.query<{
      id: string
      workspace_id: string
      post_id: string
      channel: string
      permalink: string
    }>(
      `select id, workspace_id, post_id, channel, permalink
         from post_variants
        where publish_status = 'published'
          and permalink is not null
          and permalink not like 'fixture://%'
          and platform_post_id is null
        order by updated_at asc
        limit $1`,
      [limit],
    )
    return r.rows.map((row) => ({
      variantId: row.id,
      workspaceId: row.workspace_id,
      postId: row.post_id,
      channel: row.channel as Channel,
      permalink: row.permalink,
    }))
  }

  /**
   * Write the analytics key, once.
   *
   * `and platform_post_id is null` is the whole write-once guarantee, and it is in the
   * statement rather than in a read-then-write because only the database can make it
   * atomic. A caller that has just resolved an id cannot know whether a concurrent
   * pass resolved a different one first; this makes the first writer win and tells the
   * loser it lost, instead of silently clobbering a correct value on a second run.
   *
   * Returns whether this call was the one that wrote.
   */
  async function applyPlatformId(variantId: string, platformPostId: string): Promise<boolean> {
    // Throws on a 24-hex provider object id rather than coercing it to null — the same
    // chokepoint every other write to this column goes through. A provider id reaching
    // here means the caller's resolver is wrong, and hiding that is how the column got
    // poisoned in the first place.
    const safe = assertPlatformPostId(platformPostId)
    if (safe === null) return false

    const r = await pool.query(
      `update post_variants
          set platform_post_id = $2, updated_at = now()
        where id = $1
          and platform_post_id is null`,
      [variantId, safe],
    )
    return (r.rowCount ?? 0) === 1
  }

  return { listVariantsMissingPlatformId, applyPlatformId }
}
