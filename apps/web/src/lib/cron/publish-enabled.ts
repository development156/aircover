import 'server-only'

/**
 * The separate, explicit permission for the cron sweep to publish for real.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM SAHODA_PUBLISH_DISPATCH_MODE ─────────────
 * That flag already means something, and this release CHANGES what it means.
 * Before, `on` meant "classify due posts and write their statuses" — the sweep
 * could not publish at all, because `enqueuePublish` threw in the open. After,
 * the same `on` would mean "publish to real customer accounts". A flag whose
 * meaning is widened by a deploy is a flag nobody re-consented to.
 *
 * It is not hypothetical here. At release time production carried 10 posts
 * already past due, with `scheduled` and `pending` variants on x, gbp and
 * instagram — and x and gbp have no vault opener, so every attempt ends at
 * CONNECTION_UNAVAILABLE and marks a real customer's variant FAILED. One cron
 * tick would have done that to live data five minutes after deploy.
 *
 * So publishing needs its own switch, and its absence must mean no. This one is
 * brand new, therefore absent everywhere, therefore the deploy that introduces
 * inline publishing changes production behaviour by exactly nothing.
 *
 * ── WHY EXACT-MATCH AND NOT TRUTHY ───────────────────────────────────────────
 * Only the literal string `true` enables it. `1`, `on`, `yes`, `TRUE` and an
 * empty value all leave it off. The sweep-mode flags take the opposite line —
 * they REFUSE to start on an unrecognised value, so a typo cannot be silently
 * read as the safe default. That is right for a mode with three meanings, and
 * wrong here: refusing to start would take down the hold sweep, which moves
 * customers' credits, over a typo in a publishing flag. Unrecognised means off,
 * and off is the safe direction for this one.
 */
export function publishFromCronEnabled(): boolean {
  return process.env.SAHODA_PUBLISH_ENABLED === 'true'
}
