import type { Channel } from '@sahoda/shared'

import type { MetricSnapshot, MetricTarget, SnapshotStorage } from './capture'

/**
 * The database side of the metric-history pass — two statements, and nothing that
 * talks to Zernio.
 *
 * Split out so it can be EXECUTED in a test rather than read. The publish lease
 * spent weeks with a predicate that looked right and could never match, and the
 * read below carries the same kind of load: it decides which channels get asked
 * about at all, so a mis-joined condition does not error, it silently collects a
 * smaller history than the customer thinks they have.
 */

/** The slice of `pg.Pool` this store uses. Narrow, so tests inject through a seam. */
export interface PgQueryable {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>
}

/**
 * How many channels one pass asks about.
 *
 * A request budget as much as a row budget: one Zernio call per target, and their
 * rate limit is 60/min. Oldest-published first, so a backlog drains across nights
 * rather than starving the same posts forever.
 */
export const DEFAULT_LIMIT = 200

/** Postgres says this when a table does not exist. Observable, not guessed at. */
const UNDEFINED_TABLE = '42P01'

export interface MetricStoreOptions {
  pool: PgQueryable
  limit?: number
}

interface TargetRow extends Record<string, unknown> {
  workspace_id: string
  profile_id: string
  post_id: string
  channel: string
  platform_post_id: string
  published_at: string | Date | null
}

function isMissingTable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === UNDEFINED_TABLE
  )
}

export function createMetricStore(opts: MetricStoreOptions) {
  const { pool, limit = DEFAULT_LIMIT } = opts

  /**
   * Every published channel that can actually be asked about.
   *
   * Four conditions, and each one excludes a channel that would waste a request or
   * — worse — be answered about somebody else's post:
   *
   *   · `publish_status = 'published'`, because nothing else has numbers;
   *   · `platform_post_id is not null`, because that id IS the analytics key and
   *     without it there is no question to ask;
   *   · `permalink not like 'fixture://%'`, because a simulated publish never
   *     reached a platform. Asking about it spends a call to be told nothing, or
   *     is answered about a real post if the id ever collided;
   *   · a `zernio_profiles` row, because the profile scopes the read. Zernio's
   *     analytics filter DEFAULTS TO EVERY PROFILE ON THE KEY, so an unscoped
   *     call reads across tenants — see `zernio/scope.ts`.
   *
   * `published_at` comes from the succeeded publish log, which is the only place
   * it is recorded, and the LATEST one wins: that is the attempt the platform is
   * reporting on.
   */
  async function listTargets(): Promise<MetricTarget[]> {
    const r = await pool.query<TargetRow>(
      `select v.workspace_id,
              z.profile_id,
              v.post_id,
              v.channel,
              v.platform_post_id,
              (select max(l.published_at)
                 from post_publish_logs l
                where l.post_id = v.post_id
                  and l.workspace_id = v.workspace_id
                  and l.channel = v.channel
                  and l.status = 'succeeded') as published_at
         from post_variants v
         join zernio_profiles z on z.workspace_id = v.workspace_id
        where v.publish_status = 'published'
          and v.platform_post_id is not null
          and (v.permalink is null or v.permalink not like 'fixture://%')
        order by published_at asc nulls last
        limit $1`,
      [limit],
    )

    return r.rows.map((row) => ({
      workspaceId: row.workspace_id,
      profileId: row.profile_id,
      postId: row.post_id,
      channel: row.channel as Channel,
      platformPostId: row.platform_post_id,
      publishedAt:
        row.published_at instanceof Date
          ? row.published_at.toISOString()
          : (row.published_at ?? null),
    }))
  }

  /**
   * Store the pass's numbers, skipping any day already recorded.
   *
   * `do nothing`, never `do update`, and that is forced rather than chosen: the
   * table carries an append-only guard that blocks updates for EVERYONE, including
   * the service account this job connects as. A job written the other way would
   * work on its first night and fail every night after.
   *
   * The consequence is worth stating plainly: the FIRST measurement of a day is the
   * one that is kept. A later run the same day finds the row already there and
   * leaves it alone, which is exactly what makes this pass safe to retry.
   *
   * Returns `not-ready` rather than throwing when the table does not exist yet.
   * Migration 20260819000100 is the founder's to apply, and a nightly job that
   * raised an alarm until then would be a job people learn to ignore.
   */
  async function writeSnapshots(rows: readonly MetricSnapshot[]): Promise<{
    inserted: number
    storage: SnapshotStorage
  }> {
    // Even with nothing to write, ask whether the table is there. The report has to
    // distinguish "there was nothing to measure" from "there is nowhere to put it".
    if (rows.length === 0) {
      try {
        await pool.query(`select 1 from post_metric_snapshots limit 0`)
        return { inserted: 0, storage: 'ready' }
      } catch (error) {
        if (isMissingTable(error)) return { inserted: 0, storage: 'not-ready' }
        throw error
      }
    }

    const values: unknown[] = []
    const tuples = rows.map((row, i) => {
      const at = i * 6
      values.push(row.workspaceId, row.postId, row.channel, row.metric, row.value, row.measuredAt)
      return `($${at + 1}, $${at + 2}, $${at + 3}, $${at + 4}, $${at + 5}, $${at + 6})`
    })

    try {
      const r = await pool.query(
        `insert into post_metric_snapshots
           (workspace_id, post_id, channel, metric, value, measured_at)
         values ${tuples.join(', ')}
         on conflict (workspace_id, post_id, channel, metric, measured_on) do nothing`,
        values,
      )
      return { inserted: r.rowCount ?? 0, storage: 'ready' }
    } catch (error) {
      if (isMissingTable(error)) return { inserted: 0, storage: 'not-ready' }
      throw error
    }
  }

  return { listTargets, writeSnapshots }
}
