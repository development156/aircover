'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * SIGN OUT, ON THE SERVER, WITH NO CLIENT BUNDLE.
 *
 * ── WHY NOT `<SignOutButton>` ────────────────────────────────────────────────
 * MEASURED: importing Clerk's client component into the /onboarding tree took
 * that route's first-load JavaScript from 779.8 kB to 925.1 kB — **+145.3 kB**,
 * and `scripts/perf/js-budget.mjs` failed the build over it. Onboarding is the
 * first screen of the product and the one a brand new customer waits on, so
 * paying a sixth of a megabyte for one escape link is the wrong trade twice
 * over.
 *
 * The button that calls this is a plain `<form action={...}>` submit, so the
 * whole feature costs zero kilobytes and works with JavaScript disabled.
 *
 * ── AND IT REVOKES RATHER THAN FORGETS ───────────────────────────────────────
 * Deleting `__session` alone would sign this BROWSER out while leaving the
 * session live at Clerk — which is what `middleware.ts` does in its crash-rescue
 * path, correctly, because there the goal is to unwedge a request rather than to
 * end a session. Here somebody is deliberately leaving, so the session is
 * revoked first and the cookie cleared second.
 *
 * A revoke that FAILS still clears the cookie. The alternative is a person stuck
 * on the one screen they can reach because a third-party API was slow, which is
 * the dead end this whole affordance exists to remove — so the local sign-out
 * happens either way and the failure is logged rather than shown.
 */
export async function signOutAction(): Promise<void> {
  try {
    const { sessionId } = await auth()
    if (sessionId) {
      const client = await clerkClient()
      await client.sessions.revokeSession(sessionId)
    }
  } catch (error) {
    console.error(
      '[sign-out] revoke failed, clearing locally anyway',
      error instanceof Error ? error.message : 'unknown',
    )
  }

  // `__session` is Clerk's session cookie and the only token carrier a browser
  // sends automatically. Clearing it is what makes the next request anonymous.
  const store = await cookies()
  store.delete('__session')

  /**
   * `/`, NOT `/sign-in`, and that is not a compromise.
   *
   * `typedRoutes` rejects the literal `/sign-in` because the page is an optional
   * catch-all (`[[...sign-in]]`), and `not-found.tsx` already records the same
   * finding and the same answer. The root is protected, so a request arriving
   * without the cookie we just cleared is bounced to /sign-in by
   * `auth.protect()` — one hop, and it uses the middleware's own configured
   * sign-in URL rather than a second copy of it here.
   *
   * Outside the try: `redirect` throws NEXT_REDIRECT by design, and a catch
   * above it would swallow the navigation and leave the person where they were.
   */
  redirect('/')
}
