import { createClient } from '@supabase/supabase-js'
import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { test as base, type Page } from '@playwright/test'

/**
 * A signed-in user that seeds ITSELF.
 *
 * Nothing here reads a pre-existing row. Every run mints a fresh Clerk user with
 * a unique `+clerk_test` address, signs in through the real UI, and deletes both
 * the Clerk user and its Supabase rows afterwards. That is deliberate: the dev
 * database is wiped periodically, and a suite that depends on a hand-made
 * account is a suite that passes until someone cleans up.
 *
 * `+clerk_test` addresses are Clerk's own test-mode convention on a development
 * instance — no real mailbox, no email deliverability in the loop.
 */

const CLERK_API = 'https://api.clerk.com/v1'

export interface SeededUser {
  clerkUserId: string
  email: string
  password: string
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`E2E requires ${name}`)
  return value
}

async function clerkFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${CLERK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireEnv('CLERK_SECRET_KEY')}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

/** Unique per run so parallel or repeated runs never collide on an address. */
function uniqueEmail(): string {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return `sahoda.e2e.${stamp}+clerk_test@example.com`
}

async function createClerkUser(): Promise<SeededUser> {
  const email = uniqueEmail()
  // Long and random: Clerk rejects weak or breached passwords even on a dev
  // instance, and a hardcoded one would eventually trip that.
  const password = `E2e!${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}Aa1`

  const res = await clerkFetch('/users', {
    method: 'POST',
    body: JSON.stringify({
      email_address: [email],
      password,
      skip_password_checks: true,
    }),
  })

  if (!res.ok) {
    throw new Error(`Could not create the Clerk test user (${res.status}). ${await res.text()}`)
  }
  const body = (await res.json()) as { id?: string }
  if (!body.id) throw new Error('Clerk created a user but returned no id')
  return { clerkUserId: body.id, email, password }
}

async function deleteClerkUser(clerkUserId: string): Promise<void> {
  const res = await clerkFetch(`/users/${clerkUserId}`, { method: 'DELETE' })
  if (!res.ok) {
    // Teardown noise must never fail a green run, but a leak should be visible.
    console.warn(`[e2e] could not delete Clerk user ${clerkUserId}: ${res.status}`)
  }
}

/**
 * Remove the rows the run created. Deleting the workspace cascades to members,
 * posts, variants, media and the credit ledger, so this is the single root.
 *
 * Service-role is legitimate HERE — this is test scaffolding, not app code.
 * `apps/web` itself must never gain a service-role client.
 */
async function cleanupSupabase(clerkUserId: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return

  try {
    const admin = createClient(new URL(url).origin, key, { auth: { persistSession: false } })
    await admin.from('workspaces').delete().eq('created_by', clerkUserId)
    await admin.from('users_profile').delete().eq('user_id', clerkUserId)
  } catch (error) {
    console.warn(`[e2e] Supabase cleanup failed: ${error instanceof Error ? error.message : '?'}`)
  }
}

/**
 * Establish the session through Clerk's own testing helper.
 *
 * This does NOT drive the sign-in form, and that is a deliberate trade rather
 * than a shortcut taken for convenience. Submitting the real form lands on
 * Clerk's `/sign-in/client-trust` device-trust interstitial, which the testing
 * token does not clear — the flow simply stops there. Fighting an auth
 * provider's anti-automation screen in every spec makes the whole suite flaky
 * for no gain in coverage of OUR code.
 *
 * What we give up is covered elsewhere: `unauthenticated.spec.ts` asserts the
 * sign-in page renders and that protected routes redirect into it. What this
 * buys is every assertion AFTER auth — which is where this app's behaviour, and
 * its bugs, actually live.
 */
async function signIn(page: Page, user: SeededUser): Promise<void> {
  await setupClerkTestingToken({ page })

  // A sign-in TICKET, minted server-side for this user and redeemed by the
  // <SignIn/> component on our own /sign-in route.
  //
  // Two other approaches were tried and rejected on evidence:
  //  · driving the real form stops at Clerk's /sign-in/client-trust device
  //    interstitial, which the testing token does not clear;
  //  · `clerk.signIn()` cannot run on a page that renders a Clerk component,
  //    and /sign-in is the ONLY route a signed-out visitor can load (everything
  //    else is protected), so there is nowhere valid to call it. It returns
  //    without error and leaves you signed out — a silent no-op.
  const res = await clerkFetch('/sign_in_tokens', {
    method: 'POST',
    body: JSON.stringify({ user_id: user.clerkUserId, expires_in_seconds: 600 }),
  })
  if (!res.ok) {
    throw new Error(`Could not mint a Clerk sign-in ticket (${res.status}). ${await res.text()}`)
  }
  const { token } = (await res.json()) as { token?: string }
  if (!token) throw new Error('Clerk returned no sign-in ticket')

  await page.goto(`/sign-in?__clerk_ticket=${token}`)
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 30_000 })
}

export const test = base.extend<{ signedIn: SeededUser }>({
  signedIn: async ({ page }, use) => {
    const user = await createClerkUser()
    try {
      await signIn(page, user)
      await use(user)
    } finally {
      await cleanupSupabase(user.clerkUserId)
      await deleteClerkUser(user.clerkUserId)
    }
  },
})

export { expect } from '@playwright/test'
