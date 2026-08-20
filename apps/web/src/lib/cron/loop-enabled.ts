import 'server-only'

/**
 * Whether the Sunday cron may start Loop cycles.
 *
 * ── THIS ONE DEFAULTS OFF, AND THE METRICS FLAG NEXT DOOR DEFAULTS ON ────────
 * The difference is not inconsistency, it is the asymmetry of the two mistakes.
 *
 * `metricCaptureEnabled` defaults ON because a missed run loses a day of
 * measurements no platform will ever tell us again, and the job cannot publish,
 * cannot reply and cannot touch the ledger. Running when it should not have
 * costs some bounded reads.
 *
 * THIS JOB SPENDS CREDITS. Twenty per workspace per week for the orchestration,
 * before a person has seen anything. A default of `on` would mean the deploy
 * that adds the schedule silently starts charging every workspace in the
 * database on the next Sunday — including workspaces whose owners have never
 * opened the Loop screen and know nothing about it.
 *
 * So the flag must be set deliberately, and setting it is the consent. Nothing
 * about the deploy alone starts a charge.
 *
 * ── EXACT-MATCH, AND ONLY FOR THE ON DIRECTION ───────────────────────────────
 * Only the literal string `on` enables it. A typo therefore leaves it OFF, which
 * is the safe direction for anything that spends money — the exact opposite of
 * the rule the metrics flag uses, for the exact reason above.
 */
export function loopCronEnabled(): boolean {
  return process.env.SAHODA_LOOP_CRON_MODE === 'on'
}
