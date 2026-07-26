/**
 * The last recorded Alpha readiness verdict (docs/05 §1 + §5).
 *
 * WHY THIS IS A HAND-RECORDED CONSTANT AND NOT A QUERY. There is no gate-result
 * table. `ops_qa_runs` records test suites, not a judgement about whether the
 * product is shippable, and nothing in the schema can hold "six of the fourteen
 * Alpha items do not work". Until that record exists (carded), the honest
 * options are to show nothing or to show a dated, sourced, explicitly stale
 * transcription. Showing nothing is how 6/14 ended up discoverable only in a
 * subclause of a seed comment.
 *
 * SO: EVERY FIELD BELOW IS A TRANSCRIPTION, NOT A COMPUTATION. The card renders
 * it with its date and its age, and says out loud that it has not been re-run.
 * When the next gate runs, edit this and nothing else.
 *
 * A NOTE ON WHICH FOURTEEN. docs/05 §5 "Alpha Gate" is eleven checkboxes about
 * behaviour ("scheduled post fires within ±60s"). The fourteen counted here are
 * the Alpha ITEMS of docs/05 §1 — the build list this roadmap seeds as A1…A14.
 * They are different lists and only one of them has fourteen entries, so the
 * copy says "Alpha items" and never "the Alpha Gate", which would attach a real
 * number to the wrong thing.
 */

export interface AlphaGateRecord {
  /** ISO date the assessment was made. */
  recordedOn: string
  verdict: 'no-ship' | 'ship'
  /** Roadmap item codes assessed as not working. */
  failingCodes: readonly string[]
  /** Where the judgement came from, in words a person can check. */
  source: string
}

export const ALPHA_GATE: AlphaGateRecord = {
  recordedOn: '2026-07-25',
  verdict: 'no-ship',
  // A3 workspace switcher · A5 themes · A9 scheduled publish · A12 sites
  // · A13 dashboard · A14 guide.
  failingCodes: ['A3', 'A5', 'A9', 'A12', 'A13', 'A14'],
  source: 'wt-web audit, 25 Jul 2026',
}

/** Whole days since the assessment. Negative is impossible and clamps to 0. */
export function gateAgeDays(record: AlphaGateRecord, today: Date): number {
  const recorded = Date.parse(`${record.recordedOn}T00:00:00Z`)
  if (Number.isNaN(recorded)) return 0
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.max(0, Math.round((midnight - recorded) / 86_400_000))
}

/**
 * A verdict older than this is reported as possibly out of date.
 *
 * Two days, not two weeks: the sprint is measured in hours, and a three-day-old
 * "NO-SHIP" is as capable of misleading as a three-day-old "ready" — work lands
 * fast enough here that both go stale on the same clock.
 */
export const GATE_STALE_AFTER_DAYS = 2

export function ageLabel(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}
