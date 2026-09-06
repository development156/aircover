import 'server-only'

/**
 * The switch for the weekly Radar pass.
 *
 * ── THIS ONE SPENDS MONEY, AND IT STILL DEFAULTS TO ON ──────────────────────
 * Founder's ruling, 2026-08-25, taken with the cost stated: "wire it and arm it
 * now." Recorded here rather than absorbed, because it departs from the house
 * rule in apps/jobs/CLAUDE.md — every publishing sweep defaults to `off` so that
 * deploying one cannot, by itself, start moving credits.
 *
 * The reason that rule does not simply carry over: a sweep switched on by
 * deployment can post to a stranger's Instagram account or move a customer's
 * credits, and both are irreversible in public. This pass writes rows into three
 * append-only tables and buys, at worst, a page fetch. The exposure is a bill,
 * not a published mistake.
 *
 * That is a real bill and worth being precise about:
 *
 *   · A WEBSITE source normally costs NOTHING — the first rung is a conditional
 *     GET from our own server, and a 304 or an unchanged content hash ends the
 *     night for that source. Zyte is bought only for a page we could not see at
 *     all: a bot wall, a 403, a JavaScript shell.
 *   · AN INSTAGRAM source always costs. No platform shows a stranger's account
 *     to a plain HTTP request, so for social the check IS the purchase. Social
 *     is substantially the whole bill.
 *   · With neither provider key set, every source that needs one is recorded as
 *     a GAP and nothing is bought at all.
 *
 * So the deploy that adds the schedule is the consent, and this exists to STOP
 * it without a redeploy — which is the thing worth being able to do in a hurry
 * when the spend is the risk rather than the writes.
 *
 * ── REVERSED 2026-09-06: FAIL-CLOSED, LIKE EVERY OTHER SWEEP ─────────────────
 * The ruling above stood while the pass was cheap and empty. The audit of
 * 2026-09-06 (IL-06) found the opposite: a weekly pass that ran on every
 * environment, bought Instagram reads for every workspace on every preview
 * that had the keys, and had produced zero changes in production because
 * APIFY_TOKEN was never set there. A pass nobody armed was spending and
 * nobody was reading. Only the literal string `on` now runs it, matching
 * apps/jobs/CLAUDE.md, and "Read now" on /radar is the door for a workspace
 * that wants a reading before Monday.
 */
export function radarScanEnabled(): boolean {
  return process.env.SAHODA_RADAR_SCAN_MODE === 'on'
}
