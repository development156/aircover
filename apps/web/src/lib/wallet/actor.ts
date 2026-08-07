/**
 * Did Sahoda cause this ledger entry on its own?
 *
 * `.blade` marks agency — Sahoda acted rather than the user (UI_RULES_v3). In
 * the ledger the only entries that qualify are the ones a background job wrote
 * with nobody watching: today that is `job:hold_sweep`, the reaper returning
 * credits stranded by a hold that outlived its action.
 *
 * The prefix is matched exactly and case-sensitively. `actor` is a free-text
 * column, so a loose match ("contains job") would blade a workspace whose name
 * or action label happened to contain the word.
 *
 * DELIBERATELY NOT BLADED:
 *   · `provider:cashfree` — a processor confirming a purchase the USER made.
 *     Third-party settlement of a user's action is still the user's action.
 *   · `null` — every HOLD/DEBIT/RELEASE from a paid AI action, because
 *     `withCredits` does not forward an actor. This is why autopilot spend
 *     cannot be marked yet: a plan-week charge under autopilot and a rewrite the
 *     user clicked are both null and indistinguishable here. Inferring agency
 *     from `action_type` would blade every manual plan-week run too, which is
 *     precisely the false claim the blade exists to avoid. Tracked in
 *     apps/web/REQUESTS.md for packages/billing.
 */
const SAHODA_ACTOR_PREFIX = 'job:'

export function isSahodaActor(actor: string | null): boolean {
  return actor !== null && actor.startsWith(SAHODA_ACTOR_PREFIX)
}
