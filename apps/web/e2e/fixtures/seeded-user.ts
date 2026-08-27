import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { test as base, type Browser, type Page } from '@playwright/test'
import { installNodeTransport } from '../helpers/node-transport'

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
 * Refuse to CREATE what this process could not delete.
 *
 * ── THE DEFECT THIS CLOSES ───────────────────────────────────────────────────
 * `cleanupSupabase` used to begin `if (!url || !key) return`. The Playwright
 * runner is a separate process from the app: the APP reads `apps/web/.env` and
 * has every credential, while the RUNNER only ever had what
 * `playwright.config.ts` loaded. MEASURED 2026-08-22 across all 19 `.env.local`
 * files in this repository's worktrees: every one of them holds exactly one
 * variable, `VERCEL_OIDC_TOKEN`. Not one carries `SUPABASE_SERVICE_ROLE_KEY`.
 *
 * So the app created a workspace and the runner's teardown returned, silently,
 * having done nothing. Production holds five workspaces from this fixture
 * (19-21 August) with 18 rows between them, including five `credit_ledger`
 * entries that can never be reconciled to a person because the Clerk user was
 * deleted afterwards — teardown deletes the user whether or not the rows went.
 *
 * Checking at teardown is too late; by then the row exists. This runs BEFORE the
 * first user is minted, so an under-credentialled run fails having created
 * nothing at all.
 */
function assertCleanupCapable(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && key) return { url, key }

  const missing = [!url && 'NEXT_PUBLIC_SUPABASE_URL', !key && 'SUPABASE_SERVICE_ROLE_KEY'].filter(
    Boolean,
  )

  throw new Error(
    [
      `REFUSED: this run cannot clean up after itself (${missing.join(' and ')} absent).`,
      '',
      '  The app has these and would create a workspace; this process does not and could',
      '  not delete it. That is how five workspaces came to be stranded in production.',
      '',
      '  Put them in apps/web/.env.local, which playwright.config.ts loads.',
    ].join('\n'),
  )
}

/**
 * Remove the rows the run created, and PROVE they are gone.
 *
 * Deleting the workspace cascades to members, posts, variants, media and the
 * credit ledger — MEASURED against production 2026-08-22, inside a rolled-back
 * transaction: the cascade succeeds, because `app.block_mutations` exempts
 * `pg_trigger_depth() > 1` and an FK cascade runs at depth 2. So the append-only
 * ledger is not what stops this; nothing was stopping it, because nothing was
 * running it.
 *
 * ── WHY IT COUNTS AFTERWARDS ─────────────────────────────────────────────────
 * supabase-js RETURNS `{ error }`; it does not throw. The old `try/catch` around
 * these two statements could therefore never fire, and a refused delete was
 * indistinguishable from a successful one. Even a checked `error` is only what
 * the client was told — so the rows are counted again, through the same
 * service-role client, and the count is the verdict.
 *
 * ── AND WHY IT DISTINGUISHES TWO FAILURES ────────────────────────────────────
 * A transport error is `unknown`: we do not know whether the rows went, and
 * saying "leak" would fabricate a failure. Rows still present on a re-count is a
 * confirmed leak and is thrown, because debris in a customer database is not
 * teardown noise. Same discipline as `lib/cron/heartbeat.ts`: unknown is not
 * healthy, and it is not failure either.
 *
 * Service-role is legitimate HERE — this is test scaffolding, not app code.
 * `apps/web` itself must never gain a service-role client.
 */
async function cleanupSupabase(clerkUserId: string): Promise<void> {
  const { url, key } = assertCleanupCapable()
  const admin = createClient(new URL(url).origin, key, { auth: { persistSession: false } })

  const workspaces = await admin.from('workspaces').delete().eq('created_by', clerkUserId)
  const profiles = await admin.from('users_profile').delete().eq('user_id', clerkUserId)

  const remaining = await admin.from('workspaces').select('id').eq('created_by', clerkUserId)

  if (remaining.error) {
    // Could not measure. Loud, but not a claim we cannot support.
    console.warn(
      `[e2e] cleanup UNVERIFIED for ${clerkUserId}: ${remaining.error.message}. ` +
        `delete errors: workspaces=${workspaces.error?.message ?? 'none'} ` +
        `users_profile=${profiles.error?.message ?? 'none'}`,
    )
    return
  }

  if (remaining.data.length > 0) {
    throw new Error(
      [
        `[e2e] LEAKED ${remaining.data.length} workspace(s) into the target database.`,
        `  created_by : ${clerkUserId}`,
        `  workspace  : ${remaining.data.map((r) => r.id).join(', ')}`,
        `  delete said: ${workspaces.error?.message ?? 'no error'}`,
        '',
        '  The Clerk user is NOT being deleted, so created_by still resolves to a person.',
        '  Remove the workspace before deleting the user, or the row is orphaned forever.',
      ].join('\n'),
    )
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

/**
 * A SECOND browser context, signed in as the same person.
 *
 * ── WHY A CONTEXT AND NOT A SECOND TAB ───────────────────────────────────────
 * docs/23's test plan is explicit about this: two tabs in one context share a
 * cookie jar and a storage state, so a defect that only appears when two
 * SESSIONS hold different beliefs about the same row would be masked. A concurrent
 * edit is a race between two independent clients; the test has to be two
 * independent clients.
 *
 * A fresh sign-in ticket is minted rather than the first one reused: Clerk tickets
 * are single-use, and reusing one fails in a way that looks like an auth outage
 * rather than a spent token.
 *
 * Exported as a plain function rather than a fixture because only the specs that
 * genuinely need two clients should pay for a second sign-in.
 */
export async function signInSecondContext(browser: Browser, user: SeededUser): Promise<Page> {
  const context = await browser.newContext()
  // The fixture above covers the default context; a hand-made one needs it too.
  await installNodeTransport(context)
  const page = await context.newPage()
  await signIn(page, user)
  return page
}

/**
 * Service-role client, for READING BACK what the app wrote.
 *
 * Test scaffolding only — `apps/web` itself must never gain one of these. It is
 * here because the strongest available proof that the compare-and-set is live is
 * the `version` column moving, and nothing on any screen renders that number.
 *
 * Returns null when the environment has no service key, so a spec can skip its
 * database assertions rather than fail on a missing credential.
 */
export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(new URL(url).origin, key, { auth: { persistSession: false } })
}

export const test = base.extend<{ signedIn: SeededUser }>({
  /**
   * Route every request through NODE rather than Chromium's own socket, when
   * this environment needs it.
   *
   * A claude.ai/code sandbox resets outbound 443 for the Chromium process, so
   * every https request from the page fails while Node's fetch of the same URL
   * succeeds in the same process (REQUESTS §25). Every @smoke spec signs in
   * through Clerk, which is https, so the whole leg was UNRUN there.
   *
   * `installNodeTransport` is a no-op unless SAHODA_BROWSER_VIA_NODE=1, which
   * `scripts/cloud-setup.sh` sets only when `scripts/sandbox-probe.mjs` measures
   * the block. On a laptop nothing changes and no request is intercepted.
   */
  context: async ({ context }, use) => {
    await installNodeTransport(context)
    await use(context)
  },

  signedIn: async ({ page }, use) => {
    // Before anything is minted. A run that cannot tear down must not set up.
    assertCleanupCapable()

    const user = await createClerkUser()
    try {
      await signIn(page, user)
      await use(user)
    } finally {
      // ORDER IS LOAD-BEARING. `cleanupSupabase` throws on a CONFIRMED leak, which
      // skips the line below — so a workspace that survived keeps a `created_by`
      // that still resolves to a Clerk user someone can look up. The old order
      // deleted the user unconditionally, which is why the five stranded
      // workspaces in production name people who no longer exist.
      await cleanupSupabase(user.clerkUserId)
      await deleteClerkUser(user.clerkUserId)
    }
  },
})

export { expect } from '@playwright/test'
