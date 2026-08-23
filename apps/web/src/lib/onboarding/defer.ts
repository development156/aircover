import 'server-only'

import { cookies } from 'next/headers'

/**
 * "Not now" — the half of the landing rule that keeps it from being a wall.
 *
 * ── WHY A COOKIE AND NOT A COLUMN ────────────────────────────────────────────
 * The founder's ruling is that a new user LANDS in onboarding. It is not that
 * they are imprisoned there: onboarding's own header carries `Save & exit`,
 * built by wt-onboard2, and a gate that bounced that button straight back would
 * delete a feature while appearing to add one. So the gate needs to know one
 * more thing than the database can tell it — "this person has already been
 * offered onboarding and asked to look around instead".
 *
 * That is a fact about the CURRENT VISIT, not about the account, and it is
 * deliberately stored as one. No `Max-Age` and no `Expires` makes it a session
 * cookie: it dies with the browser session, so the next sign-in lands them back
 * in the flow, resuming at the step they left. That is the ruling's "mid-way →
 * resumes at the step they left", carried across a sign-out rather than only
 * across a click.
 *
 * ── AND IT IS NOT A SECURITY BOUNDARY ────────────────────────────────────────
 * Nothing is gated on this. Forging it buys a user exactly one thing: the
 * dashboard they were already allowed to open by typing its URL twice. RLS
 * decides what is ON that dashboard, as it does everywhere else. `httpOnly` is
 * set anyway because no script has a reason to read it, and `sameSite: 'lax'`
 * because a cross-site POST has no business deciding where somebody lands.
 *
 * ── THE CONSTANT LIVES HERE AND NOT IN THE ACTION ────────────────────────────
 * `app/actions/onboarding-defer.ts` is a `'use server'` module, and one of those
 * may export NOTHING but async functions — a exported `const` is a build error,
 * not a lint note. Same family as the warning in `actions/workspace.ts` about
 * re-exported types.
 */
export const ONBOARDING_DEFER_COOKIE = 'sahoda_onb_defer'

/** Has this visit already been offered onboarding and asked to look around? */
export async function hasDeferredOnboarding(): Promise<boolean> {
  const store = await cookies()
  return store.get(ONBOARDING_DEFER_COOKIE)?.value === '1'
}
