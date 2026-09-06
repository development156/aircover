import type { Pool } from 'pg'

import type {
  BeginFetchRequest,
  BeginFetchResult,
  ChangeWrite,
  DueSource,
  FinishFetchRequest,
  RadarDb,
  SnapshotWrite,
} from './db'

/**
 * The Postgres binding for Radar's port.
 *
 * Everything that writes goes through a SECURITY DEFINER function or an
 * `on conflict do nothing` insert. There is no UPDATE and no DELETE against a
 * customer-facing table here, and there could not be: `competitor_snapshots` and
 * `competitor_changes` both carry `app.block_mutations()`, so an attempt fails
 * loudly rather than quietly rewriting history.
 */
export function createRadarPgDb(pool: Pool): RadarDb {
  return {
    /**
     * What is due tonight.
     *
     * "Due" is cadence-relative, and a source nothing has been tried on sorts
     * first — one Radar has never managed to see is the most urgent thing on
     * the list, not the least. The interval is shaved by an hour so a job that
     * starts a few minutes late two nights running does not drift a daily
     * source into every-other-day.
     *
     * ⚠ THE STARVATION THIS ORDER EXISTS TO PREVENT ⚠
     * The order was `last_seen_at asc nulls first`, and `last_seen_at` moves
     * ONLY on a successful read (see `rememberCheck`). So a source that never
     * succeeds — a hostname that does not resolve, a 404, an Instagram account
     * with no provider key — stayed NULL and sorted ahead of every source ever
     * seen, for ever. One careless watch list of 100 dead hostnames filled the
     * whole weekly batch of 100 every Monday and no other customer's competitor
     * was read again, while the pass reported `ok: true`.
     *
     * Three parts, and each is load-bearing:
     *
     *   1. ORDER BY THE LAST ATTEMPT. `radar_fetch_log` records every attempt,
     *      including the zero-cost gaps, so `greatest(last_seen_at, max
     *      (fetched_at))` is "when did we last bother this source". Postgres's
     *      GREATEST ignores NULLs and is NULL only when both are, which is
     *      exactly "never tried" — and that still sorts first.
     *   2. `cs.id` AS A TIEBREAKER, so a pass with no attempts on record is
     *      deterministic rather than whatever order the heap came back in.
     *   3. ONLY SOURCES SOMEBODY WATCHES. Unsubscribing deletes the
     *      subscription and leaves the source in the shared registry;
     *      `app.radar_begin_fetch` then refuses it NO_SUBSCRIBERS every pass,
     *      and with no stamp it occupied a slot for ever too.
     */
    async dueSources(limit) {
      const { rows } = await pool.query<{
        source_id: string
        competitor_id: string
        kind: DueSource['kind']
        locator: string
        cadence: DueSource['cadence']
        etag: string | null
        last_modified: string | null
        content_hash: string | null
        last_seen_at: string | null
      }>(
        `select cs.id as source_id, cs.competitor_id, cs.kind, cs.locator, cs.cadence,
                cs.etag, cs.last_modified, cs.content_hash,
                cs.last_seen_at::text as last_seen_at
           from competitor_sources cs
          where exists (select 1
                          from competitor_subscriptions sub
                         where sub.competitor_id = cs.competitor_id)
            and (cs.last_seen_at is null
             or cs.last_seen_at < now() - (case cs.cadence
                  when 'daily'  then interval '23 hours'
                  when 'weekly' then interval '6 days 23 hours'
                end))
          order by greatest(
                     cs.last_seen_at,
                     (select max(l.fetched_at) from radar_fetch_log l where l.source_id = cs.id)
                   ) asc nulls first,
                   cs.id asc
          limit $1`,
        [limit],
      )
      return rows.map((r) => ({
        sourceId: r.source_id,
        competitorId: r.competitor_id,
        kind: r.kind,
        locator: r.locator,
        cadence: r.cadence,
        etag: r.etag,
        lastModified: r.last_modified,
        contentHash: r.content_hash,
        lastSeenAt: r.last_seen_at,
      }))
    },

    /**
     * ONE COMPETITOR'S SOURCES, FOR A WORKSPACE THAT WATCHES THEM.
     *
     * The join through `competitor_subscriptions` is the tenancy boundary, not
     * a convenience: this pool is service-role, so a query keyed on the
     * competitor alone would happily return a competitor the caller does not
     * watch. `app.radar_workspace_spend_today` reads `radar_fetch_log` through
     * the same join for the same reason.
     *
     * No cadence clause. A person pressing "Read now" is asking to bypass the
     * schedule; the SPENDING gate is still `app.radar_begin_fetch` and the
     * ledger, neither of which this path skips.
     *
     * The limit is a wall on a manual action, and a small one: a competitor is
     * a website and a social account, not a hundred addresses.
     */
    async sourcesForCompetitor(competitorId: string, workspaceId: string) {
      const { rows } = await pool.query<{
        source_id: string
        competitor_id: string
        kind: DueSource['kind']
        locator: string
        cadence: DueSource['cadence']
        etag: string | null
        last_modified: string | null
        content_hash: string | null
        last_seen_at: string | null
      }>(
        `select cs.id as source_id, cs.competitor_id, cs.kind, cs.locator, cs.cadence,
                cs.etag, cs.last_modified, cs.content_hash,
                cs.last_seen_at::text as last_seen_at
           from competitor_sources cs
           join competitor_subscriptions sub
             on sub.competitor_id = cs.competitor_id
            and sub.workspace_id = $2::uuid
          where cs.competitor_id = $1::uuid
          order by cs.id asc
          limit 10`,
        [competitorId, workspaceId],
      )
      return rows.map((r) => ({
        sourceId: r.source_id,
        competitorId: r.competitor_id,
        kind: r.kind,
        locator: r.locator,
        cadence: r.cadence,
        etag: r.etag,
        lastModified: r.last_modified,
        contentHash: r.content_hash,
        lastSeenAt: r.last_seen_at,
      }))
    },

    /**
     * WHO PAYS FOR THIS SOURCE.
     *
     * A source belongs to a competitor and a competitor is watched by any
     * number of workspaces, so the join goes through the competitor rather than
     * the source: both of a rival's sources answer the same list. `distinct`
     * because the unique constraint is on (workspace, competitor) and a
     * competitor with two sources would otherwise repeat a payer per source
     * were the join ever widened. Ordered so a pass charges the same wallets in
     * the same order twice running.
     */
    async subscribers(sourceId: string): Promise<string[]> {
      const { rows } = await pool.query<{ workspace_id: string }>(
        `select distinct sub.workspace_id
           from competitor_subscriptions sub
           join competitor_sources cs on cs.competitor_id = sub.competitor_id
          where cs.id = $1::uuid
          order by sub.workspace_id`,
        [sourceId],
      )
      return rows.map((r) => r.workspace_id)
    },

    async beginFetch(request: BeginFetchRequest): Promise<BeginFetchResult> {
      const { rows } = await pool.query<{ out: Record<string, unknown> }>(
        `select app.radar_begin_fetch($1::uuid, $2, $3, $4::bigint, $5) as out`,
        [
          request.sourceId,
          request.mode,
          request.provider,
          request.estimateMicros,
          request.costBasis,
        ],
      )
      const out = rows[0]!.out
      if (out.allowed === true) {
        return {
          allowed: true,
          reservationId: String(out.reservation_id),
          subscriberCount: Number(out.subscriber_count),
        }
      }
      return {
        allowed: false,
        reason: out.reason as BeginFetchResult extends { allowed: false }
          ? never
          : 'DAILY_CAP' | 'WORKSPACE_CAP' | 'NO_SUBSCRIBERS',
        ...(out.spent_micros === undefined ? {} : { spentMicros: Number(out.spent_micros) }),
        ...(out.cap_micros === undefined ? {} : { capMicros: Number(out.cap_micros) }),
        ...(out.workspace_id === undefined ? {} : { workspaceId: String(out.workspace_id) }),
      } as BeginFetchResult
    },

    async finishFetch(request: FinishFetchRequest) {
      await pool.query(`select app.radar_finish_fetch($1::uuid, $2, $3::bigint, $4::jsonb, $5)`, [
        request.reservationId,
        request.outcome,
        request.costMicros,
        JSON.stringify(request.detail),
        request.costBasis,
      ])
    },

    /**
     * CREATE IT, OR DO NOTHING — never "create or update".
     *
     * The append-only trigger blocks UPDATE outright, so an upsert would fail
     * every day after the first. `do nothing` returns no row, which is how the
     * caller learns today was already covered.
     */
    async insertSnapshot(write: SnapshotWrite) {
      const { rows } = await pool.query<{ id: string; captured_on: string }>(
        `insert into competitor_snapshots (source_id, payload, content_hash, captured_at)
         values ($1::uuid, $2::jsonb, $3, $4::timestamptz)
         on conflict (source_id, captured_on) do nothing
         returning id, captured_on::text as captured_on`,
        [write.sourceId, JSON.stringify(write.payload), write.contentHash, write.capturedAt],
      )
      return rows[0] ? { id: rows[0].id, capturedOn: rows[0].captured_on } : null
    },

    async previousSnapshot(sourceId, beforeCapturedOn) {
      const { rows } = await pool.query<{ id: string; captured_on: string; payload: unknown }>(
        `select id, captured_on::text as captured_on, payload
           from competitor_snapshots
          where source_id = $1::uuid and captured_on < $2::date
          order by captured_on desc
          limit 1`,
        [sourceId, beforeCapturedOn],
      )
      const row = rows[0]
      return row ? { id: row.id, capturedOn: row.captured_on, payload: row.payload } : null
    },

    /**
     * `source_id` and `day_span` are supplied and then OVERWRITTEN by
     * `app.radar_seal_change()`, which recomputes both from the two snapshots.
     * They are passed anyway because the columns are NOT NULL; the trigger is
     * what makes them true.
     */
    async insertChange(write: ChangeWrite) {
      await pool.query(
        `insert into competitor_changes
           (source_id, from_snapshot_id, to_snapshot_id, change_kind, day_span, summary, detail)
         select cs.source_id, $1::uuid, $2::uuid, $3, 1, $4, $5::jsonb
           from competitor_snapshots cs where cs.id = $1::uuid
         on conflict (from_snapshot_id, to_snapshot_id, change_kind) do nothing`,
        [
          write.fromSnapshotId,
          write.toSnapshotId,
          write.changeKind,
          write.summary,
          JSON.stringify(write.detail),
        ],
      )
    },

    /**
     * `last_seen_at` moves ONLY when `seen` is true.
     *
     * A source that failed for three nights must not look fresh, and this is the
     * line that keeps "we tried" and "we saw" apart in the schema — the fetch log
     * records the attempt, this column records the sighting.
     */
    async rememberCheck(sourceId, memory, seen) {
      await pool.query(
        `update competitor_sources
            set etag = $2,
                last_modified = $3,
                content_hash = coalesce($4, content_hash),
                last_seen_at = case when $5 then now() else last_seen_at end
          where id = $1::uuid`,
        [sourceId, memory.etag, memory.lastModified, memory.contentHash, seen],
      )
    },
  }
}
