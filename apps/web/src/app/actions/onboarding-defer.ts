'use server'

import { cookies } from 'next/headers'

import { ONBOARDING_DEFER_COOKIE } from '@/lib/onboarding/defer'

/**
 * Record that this visit chose to look around instead of finishing onboarding.
 *
 * Called by the flow's own `Save & exit`. The reasoning for the cookie's shape —
 * session-scoped, httpOnly, and not a security boundary — is on the constant in
 * `lib/onboarding/defer.ts`, which is also why the constant is not exported from
 * here: a `'use server'` module may export async functions and nothing else.
 *
 * Returns nothing. The caller navigates; a failure to remember the deferral
 * costs the user one extra bounce into a flow they can leave again, which is not
 * worth an error screen.
 */
export async function deferOnboarding(): Promise<void> {
  const store = await cookies()
  store.set(ONBOARDING_DEFER_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })
}
