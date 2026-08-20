import type { Channel } from '@sahoda/shared'

import type { AudienceSnapshot, AudienceStorage, AudienceTarget } from './capture'

/**
 * The database side of the audience pass — two statements, and nothing that talks
 * to Zernio.
 *
 * Split out so it can be EXECUTED in a test rather than read. The read below decides
 * which accounts get asked about at all, so a mis-joined condition does not error —
 * it silently collects a smaller history than the customer thinks they have, and
 * this table's whole point is that the gap can never be filled in later.
 */

/** The slice of `pg.Pool` this store uses. Narrow, so tests inject through a seam. */
export interface PgQueryable {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>
}

/**
 * How many accounts one pass asks about.
 *
 * A request budget as much as a row budget: THREE Zernio calls per account (follower
 * history, follower demographics, engaged demographics) against a 60/min limit. Far
 * below the metric pass's 200 because the unit here is an ACCOUNT, and there are two
 * orders of magnitude fewer of those than there are published channels.
 */
export const DEFAULT_LIMIT = 50

/** Postgres says this when a table does not exist. Observable, not guessed at. */
const UNDEFINED_TABLE = '42P01'

/**
 * The only platform in this integration that reports audience demographics.
 *
 * Named here rather than left implicit in the query: `audience_snapshots.channel`
 * accepts all four channels so it cannot drift from its sibling table's spelling,
 * and this constant is what states that only one of them is actually collected.
 */
export const DEMOGRAPHIC_CHANNELS: readonly Channel[] = ['instagram']

export interface AudienceStoreOptions {
  pool: PgQueryable
  limit?: number
}

interface TargetRow extends Record<string, unknown> {
  workspace_id: string
  account_id: string
  channel: string
}

function isMissingTable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === UNDEFINED_TABLE
  )
}

export function createAudienceStore(opts: AudienceStoreOptions) {
  const { pool, limit = DEFAULT_LIMIT } = opts

  /**
   * Every connected account that can actually be asked about.
   *
   * Four conditions, and each excludes an account that would waste a request or —
   * worse — be answered about somebody else's:
   *
   *   · `status = 'active'`, because an expired connection is answered HTTP 404
   *     `account_not_found` (measured 2026-08-20 against both expired rows in
   *     production). Asking spends a call to be told nothing;
   *   · the platform is one that reports demographics at all;
   *   · a 24-hex account id, because that id IS the analytics key and Zernio's own
   *     404 is what a uuid would earn;
   *   · a matching `zernio_profiles` row, checked in SQL rather than trusted. Zernio
   *     validates an account id against the whole TEAM, so an id from another
   *     workspace does not error — it answers 200 with someone else's audience
   *     (doc 13 section 3). The join is what makes that unexpressible.
   *
   * Oldest connection first, so a backlog drains across nights rather than starving
   * the same accounts forever.
   */
  async function listTargets(): Promise<AudienceTarget[]> {
    const r = await pool.query<TargetRow>(
      `select c.workspace_id,
              c.external_account->>'id' as account_id,
              c.platform               as channel
         from connections c
         join zernio_profiles z
           on z.workspace_id = c.workspace_id
          and z.profile_id   = c.external_account->>'profileId'
        where c.status = 'active'
          and c.platform = any($1)
          and c.external_account->>'id' ~ '^[0-9a-f]{24}$'
        order by c.created_at asc
        limit $2`,
      [DEMOGRAPHIC_CHANNELS, limit],
    )

    return r.rows.map((row) => ({
      workspaceId: row.workspace_id,
      accountId: row.account_id,
      channel: row.channel as Channel,
    }))
  }

  /**
   * Store the pass's numbers, skipping any day already recorded.
   *
   * `do nothing`, never `do update`, and that is forced rather than chosen: the table
   * carries an append-only guard that blocks updates for EVERYONE, including the
   * service account this job connects as. A job written the other way would work on
   * its first night and fail every night after.
   *
   * The consequence is worth stating plainly: the FIRST measurement of a day is the
   * one kept. A later run the same day finds the row already there and leaves it
   * alone, which is exactly what makes this pass safe to retry — and it is what makes
   * the follower endpoint's thirty-day overlap harmless rather than thirty duplicates.
   *
   * Returns `not-ready` rather than throwing when the table does not exist yet. A
   * nightly job that raised an alarm until a migration was applied is a job people
   * learn to ignore.
   */
  async function writeSnapshots(rows: readonly AudienceSnapshot[]): Promise<{
    inserted: number
    storage: AudienceStorage
  }> {
    // Even with nothing to write, ask whether the table is there. The report has to
    // distinguish "there was nothing to measure" from "there is nowhere to put it".
    if (rows.length === 0) {
      try {
        await pool.query(`select 1 from audience_snapshots limit 0`)
        return { inserted: 0, storage: 'ready' }
      } catch (error) {
        if (isMissingTable(error)) return { inserted: 0, storage: 'not-ready' }
        throw error
      }
    }

    const COLUMNS = 10
    const values: unknown[] = []
    const tuples = rows.map((row, i) => {
      const at = i * COLUMNS
      values.push(
        row.workspaceId,
        row.accountId,
        row.channel,
        row.audience,
        row.dimension,
        row.bucket,
        row.value,
        row.measuredOn,
        row.timeframe,
        row.source,
      )
      return `($${at + 1}, $${at + 2}, $${at + 3}, $${at + 4}, $${at + 5}, $${at + 6}, $${at + 7}, $${at + 8}::date, $${at + 9}, $${at + 10})`
    })

    try {
      const r = await pool.query(
        `insert into audience_snapshots
           (workspace_id, account_id, channel, audience, dimension, bucket, value,
            measured_on, timeframe, source)
         values ${tuples.join(', ')}
         on conflict (workspace_id, account_id, channel, audience, dimension, bucket, measured_on)
           do nothing`,
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
