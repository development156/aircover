import 'server-only'

/**
 * THE SEPARATE, EXPLICIT PERMISSION FOR AUTOPILOT TO ARM POSTS.
 *
 * ── WHY IT IS ITS OWN FLAG AND NOT ONE OF THE THREE THAT EXIST ───────────────
 * `SAHODA_LOOP_CRON_MODE` means "the Loop may plan a week".
 * `SAHODA_PUBLISH_DISPATCH_MODE` means "the sweep may classify due posts".
 * `SAHODA_PUBLISH_ENABLED` means "the sweep may publish for real".
 *
 * Autopilot is a fourth thing: Sahoda deciding, unattended, that a post SHOULD
 * go out. Reusing any of the three would widen what somebody already consented
 * to — the exact defect `publish-enabled.ts` was created to avoid, in its own
 * words: "a flag whose meaning is widened by a deploy is a flag nobody
 * re-consented to".
 *
 * This one is brand new, therefore absent everywhere, therefore the deploy that
 * introduces the autopilot route changes production behaviour by exactly
 * nothing.
 *
 * ── EXACT-MATCH, AND UNRECOGNISED MEANS OFF ──────────────────────────────────
 * Only the literal string `true` enables it. `1`, `on`, `yes`, `TRUE` and an
 * empty value all leave it off. The sweep-mode flags take the opposite line and
 * REFUSE to start on an unrecognised value, which is right for a mode with
 * three meanings and wrong here: refusing to start would take the route down
 * over a typo, and the safe direction for "may Sahoda post for a customer with
 * nobody watching" is no.
 */
export function autopilotEnabled(): boolean {
  return process.env.SAHODA_AUTOPILOT_ENABLED === 'true'
}
