import 'server-only'

/**
 * Whether the daily cron may open Playbook runs.
 *
 * ── IT DEFAULTS OFF, AND THE METRICS FLAG NEXT DOOR DEFAULTS ON ─────────────
 * The difference is the asymmetry of the two mistakes, and it is the same
 * reasoning `loopCronEnabled` sets out. A missed metrics run loses a day of
 * measurements no platform will ever tell us again, and that job cannot publish,
 * cannot reply and cannot touch the ledger.
 *
 * THIS ONE OPENS RUNS. It stops at the cost preview and charges nothing — see
 * the route — but it still writes rows into every eligible workspace and puts a
 * decision in front of people who have never opened this screen. A default of
 * `on` would mean the deploy that adds the schedule starts doing that by itself.
 *
 * ── EXACT-MATCH, AND ONLY FOR THE ON DIRECTION ───────────────────────────────
 * Only the literal string `on` enables it, so a typo leaves it OFF — the safe
 * direction for anything that touches a customer's workspace unattended.
 */
export function playbooksCronEnabled(): boolean {
  return process.env.SAHODA_PLAYBOOKS_CRON_MODE === 'on'
}
