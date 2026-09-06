import { readRadarAttempts, type RadarAttemptQuery, type RadarAttemptRow } from './radar/fetch-log'
import { getRuntime } from './runtime'

/**
 * WHAT RADAR TRIED — an entry point of its own, and that is the point.
 *
 * `@sahoda/jobs/radar` reaches `run.ts`, which imports `@sahoda/research`,
 * `guardedFetch` and both providers. /radar's page render needs none of that;
 * it needs one SELECT. A separate entry keeps the collector's graph out of a
 * screen that only reads, for the same reason `./sweeps` exists apart from
 * `./index`.
 *
 * The elevated read is argued in `./radar/fetch-log.ts`: the workspace id is
 * the JOIN, so the query cannot be aimed at another tenant, and the projection
 * names neither `subscriber_count` nor `cost_micros`.
 */

export type { RadarAttemptRow, RadarAttemptQuery }

/** Every attempt Radar made on the sources this workspace subscribes to. */
export async function radarAttemptsForWorkspace(
  workspaceId: string,
  query: RadarAttemptQuery = {},
): Promise<RadarAttemptRow[]> {
  const { pool } = getRuntime()
  return readRadarAttempts(pool, workspaceId, query)
}
