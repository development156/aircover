import type { Competitor, CompetitorKind, RadarSnapshot } from './types'

/**
 * THE SEAM BETWEEN THIS SCREEN AND THE COLLECTOR THAT FILLS IT.
 *
 * ── WHY A PORT AND NOT A QUERY ───────────────────────────────────────────────
 * Radar's ingestion — the scrapers, the `competitors` and `competitor_snapshots`
 * tables, the weekly scan — is being built RIGHT NOW in a parallel lane
 * (wt-radar), unmerged. This screen must not depend on that branch and must not
 * duplicate its migrations, so it depends on this interface instead and the
 * binding arrives when the tables do.
 *
 * That is not a workaround. It is the arrangement that lets the honesty rules be
 * tested at all: `figure-provenance.test.tsx` drives a store it controls, which
 * is how a fabricated figure can be pushed through the real render path on
 * purpose and watched to fail. Against a live query the guard could only ever
 * assert on whatever production happened to contain.
 *
 * ── WHAT WT-RADAR OWES THIS INTERFACE ────────────────────────────────────────
 * Stated here so the reconcile is a lookup rather than an archaeology:
 *
 *   competitors          id, workspace_id, name, url, kind, added_on,
 *                        last_observed_at
 *   competitor_snapshots id, workspace_id, competitor_id, observed_at, source
 *   + the change records, however that lane models them, carrying for each
 *     change: kind, observed_on, the snapshot ids it rests on, a figure list
 *     where EVERY figure names one of those ids, and a nullable reading.
 *   + the scan attempts, INCLUDING FAILURES. A scan row written only on success
 *     makes "we could not check" unrenderable, and that state is P1 of this
 *     screen's brief.
 *
 * If that lane's shape differs, this interface is the one file that changes.
 */
export interface RadarStore {
  /** Everything the change feed and the watch list need, in one read. */
  read(workspaceId: string): Promise<RadarSnapshot>
  /** Add a business to watch. Returns the row as stored. */
  add(
    workspaceId: string,
    input: { name: string; url: string; kind: CompetitorKind },
  ): Promise<Competitor>
  /** Stop watching. Snapshots already taken are the collector's business, not this screen's. */
  remove(workspaceId: string, competitorId: string): Promise<void>
}

/**
 * What a workspace sees before the collector exists.
 *
 * NOT AN ERROR AND NOT AN EMPTY LIST PRETENDING TO BE ONE. `collector: 'absent'`
 * is a distinct state the screen draws differently from "you are watching
 * nobody": one says the feature is not collecting yet, the other says you have
 * not told it what to collect. Collapsing them would tell a customer who added
 * four competitors that they had added none.
 */
export const UNWIRED: RadarSnapshot = {
  collector: 'absent',
  competitors: [],
  days: [],
}
