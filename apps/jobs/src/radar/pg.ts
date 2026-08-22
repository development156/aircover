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
     * "Due" is cadence-relative, and NULL sorts first — a source Radar has never
     * managed to see is the most urgent thing on the list, not the least. The
     * interval is shaved by an hour so a job that starts a few minutes late two
     * nights running does not drift a daily source into every-other-day.
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
          where cs.last_seen_at is null
             or cs.last_seen_at < now() - (case cs.cadence
                  when 'daily'  then interval '23 hours'
                  when 'weekly' then interval '6 days 23 hours'
                end)
          order by cs.last_seen_at asc nulls first
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
