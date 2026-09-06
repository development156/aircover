/**
 * A STORED METRIC KEY, IN WORDS A SHOP OWNER READS.
 *
 * ── WHY THIS FILE SURVIVES THE DELETION AROUND IT ────────────────────────────
 * `lib/report/` was deleted on 2026-09-04 as a closed cluster: a rival CMO
 * Report whose every consumer was inside itself. One day earlier, `bbe1f0ef`
 * had put `metricInWords` into that cluster's `strings.ts`, and the report page
 * that SHIPS imported it. Two lanes, two truths, and the merge on 2026-09-05
 * found the page importing a module that no longer existed.
 *
 * So the one function the live page needs moved here, alone, with the ban list
 * it is checked against. Nothing else from the deleted cluster came with it.
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────────
 * `readRanking` returns `metric` as the raw column vocabulary and the report
 * page interpolated it: "610 impressions on gbp." Both halves of that sentence
 * were storage words. `impressions` is on BANNED_WORDS precisely because it is a
 * real value in the metric store and must never reach a reader.
 *
 * ── AND WHY IT DOES NOT INVENT A WORD IT DOES NOT HAVE ───────────────────────
 * "Impressions" and "reach" are different measurements, so rendering the first
 * as "people reached" would be a smaller claim than the truth in one direction
 * and a larger one in the other. Each key gets the phrase that is actually true
 * of it. An unrecognised key falls through unchanged rather than being given a
 * confident label nobody measured, and the guard on the page catches the leak
 * itself, so a new metric shows up as a missing entry here rather than silently
 * becoming a wrong sentence.
 */
export const BANNED_WORDS = [
  'impressions',
  'ctr',
  'engagement rate',
  'funnel',
  'kpi',
  'leverage',
  'optimise',
  'optimize',
] as const

const METRIC_WORDS: Readonly<Record<string, string>> = {
  impressions: 'times it was seen',
  reach: 'people reached',
  engagement: 'reactions',
  clicks: 'clicks',
}

export function metricInWords(metric: string): string {
  return METRIC_WORDS[metric] ?? metric
}
