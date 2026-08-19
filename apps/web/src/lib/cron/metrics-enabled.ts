import 'server-only'

/**
 * The switch for the nightly metric-history pass.
 *
 * ── WHY THIS ONE DEFAULTS TO ON, WHEN EVERY OTHER SWEEP DEFAULTS TO OFF ──────
 * The house rule in apps/jobs/CLAUDE.md exists for a stated reason: deploying a
 * sweep that was already switched on "would have started moving credits on the
 * first tick". That reason does not reach this pass. It cannot publish, cannot
 * reply, cannot touch the ledger and cannot change a post. Everything it does is
 * append one row per post, per channel, per number, per day, into a table that
 * refuses updates from everyone including this job.
 *
 * And the cost of the two mistakes is wildly asymmetric. Running when it should
 * not have spends some bounded, rate-limited reads. NOT running loses a day of
 * measurements that no platform will ever tell us again — which is the entire
 * reason the table exists, and exactly the trap docs/24 already warned about:
 * a migration applied, a job written, and nothing collecting.
 *
 * A default of `off` here would recreate that silence behind a flag nobody knew
 * to flip. So the deploy that adds the schedule is the consent, and this exists
 * to STOP it without a redeploy — which is the thing worth being able to do in a
 * hurry if the read budget ever bites.
 *
 * ── EXACT-MATCH, AND ONLY FOR THE OFF DIRECTION ──────────────────────────────
 * Only the literal string `off` disables it. A typo therefore leaves collection
 * running, which is the safe direction for this job and the opposite of the right
 * answer for a publishing flag.
 */
export function metricCaptureEnabled(): boolean {
  return process.env.SAHODA_METRIC_CAPTURE_MODE !== 'off'
}
