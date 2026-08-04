import { clerkSetup } from '@clerk/testing/playwright'

/**
 * Fetches the Clerk testing token once per run.
 *
 * Without it, Clerk's bot protection (a Turnstile managed challenge) blocks a
 * headless sign-up outright — the flow simply never completes and the failure
 * reads like a broken selector rather than a blocked challenge.
 *
 * This requires a Clerk DEVELOPMENT instance (`pk_test_…`). A production key is
 * origin-locked to the real domain and rejects `127.0.0.1`, so we fail loudly
 * here rather than let every spec fail one-by-one with an opaque redirect.
 */
export default async function globalSetup(): Promise<void> {
  const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''
  const secret = process.env.CLERK_SECRET_KEY ?? ''

  if (!publishable || !secret) {
    throw new Error(
      'E2E needs NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in apps/web/.env.local',
    )
  }
  if (!publishable.startsWith('pk_test_')) {
    throw new Error(
      'E2E needs a Clerk DEVELOPMENT instance (pk_test_…). A pk_live key is origin-locked to the ' +
        'production domain and will reject 127.0.0.1, so sign-in can never complete locally.',
    )
  }

  await clerkSetup()
}
