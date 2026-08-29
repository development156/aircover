/**
 * The ledger idempotency namespace for a paid resolve. **Server-derived only.**
 *
 * `withCredits` keys exactly-once on `(action, objectRef)`, and billing's
 * `nextAttempt()` deliberately REUSES the attempt when the previous one settled
 * by DEBIT (its lost-ack protection). A client-supplied value here would
 * therefore let any signed-in caller replay a spent key: the HOLD and DEBIT both
 * replay while the wrapped fn still runs — an unlimited number of paid
 * `brand_guidelines` calls for a single 50-credit charge. So this takes ONLY
 * values the database gives us; there is deliberately no parameter a request
 * body can reach.
 *
 * ── WHY IT IS BOUND TO THE BRAIN VERSION, AND NOT RANDOM ────────────────────
 * It used to be `${workspaceId}:${randomUUID()}` — a fresh key per invocation,
 * with a TODO saying to bind it to the active `brand_memory` version once a
 * resolve was persisted. This is that change, and it was made because the gap
 * the TODO describes is a real customer losing real money:
 *
 * A customer who already has a brain and re-runs onboarding is charged 50
 * credits the moment the build STARTS (`onboarding-resolve.ts#resolveCharged`),
 * and the brain is written only when they press the last button
 * (`use-build.ts#finish` → `saveBrandMemory`). Close the tab on the result
 * screen and the credits are gone and the brain is unchanged. With a fresh key
 * every time, the next attempt was a second, full charge for the same thing.
 *
 * Bound to the version, the retry carries the SAME key: the ledger sees an
 * attempt already settled by DEBIT and replays it, so the customer pays once and
 * gets what they paid for. Saving bumps the version, which opens the next
 * charge — because that IS a new, intended purchase.
 *
 * The FIRST resolve is free and never reaches this
 * (`onboarding-resolve.ts` routes on `activeBrandMemory(...) === null`), so an
 * abandoned first build has never cost anything.
 *
 * ── THE TRADE, STATED RATHER THAN HIDDEN ────────────────────────────────────
 * A customer can now re-resolve repeatedly without saving and be charged only
 * once per brain version, and each of those runs is a real model call we pay a
 * provider for. That is deliberate and it is the smaller harm: the exposure
 * needs somebody to deliberately loop while never keeping a result, and today's
 * behaviour takes 50 credits from an honest customer who simply closed a tab.
 * It is also exactly the trade `withCredits` already makes for every lost ack.
 * If that loop is ever seen in the wild, bound it here rather than by going back
 * to a random key.
 */
export function resolveObjectRef(workspaceId: string, activeVersion: number | null): string {
  return `${workspaceId}:brain-v${activeVersion ?? 0}`
}
