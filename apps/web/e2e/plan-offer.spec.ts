import type { SupabaseClient } from '@supabase/supabase-js'

import { adminClient, expect, test } from './fixtures/seeded-user'
import { dismissPlanOffer, leaveOnboarding } from './fixtures/compose'
import type { Page } from '@playwright/test'

/**
 * THE PLANS, OFFERED ON ARRIVAL TO A WORKSPACE THAT IS NOT ON ONE.
 *
 * ── WHAT ONLY A BROWSER CAN ANSWER HERE ──────────────────────────────────────
 * `lib/billing/plan-offer.test.ts` decides the offer from a subscription read,
 * and `components/billing/plan-offer-modal.test.tsx` drives the dialog in jsdom.
 * Both mount the component by hand. Neither can say whether /home ACTUALLY
 * mounts it, whether the real subscription read reaches the real decision, or
 * whether a `<dialog>` opens over the real dashboard — jsdom has no `<dialog>`
 * implementation at all and both suites stub `showModal`.
 *
 * That is the whole gap this file exists for, and it is why the third test
 * matters most: a paying customer meeting a pricing wall is the expensive
 * failure, and it cannot be reproduced anywhere but here, because it needs a
 * real `subscriptions` row read by the real server component.
 *
 * ── THE PAID HALF NEEDS THE SERVICE KEY, AND SAYS SO WHEN IT IS ABSENT ───────
 * Nothing in production writes a `subscriptions` row — `top-up-panel.tsx`
 * records that in terms — so the only way to have an account that is on a plan
 * is to insert one. With no service key that test cannot run, and it FAILS
 * rather than skipping quietly: a suite that ran nothing reports as passing,
 * which is how twenty-six billing tests never executed for months.
 */

const OFFER_TITLE = 'Choose the right plan for you'

/**
 * Make a workspace AND get off the onboarding flow.
 *
 * ── THE `leaveOnboarding` IS NOT OPTIONAL, AND THE BROWSER SAID SO ───────────
 * The first version of this helper stopped at `waitForURL(/onboarding/)`, the
 * shape `accent-budget.spec.ts` uses. All four tests here then failed with "no
 * dialog found", and the failure context showed the page was still on the
 * onboarding intro: `home/page.tsx`'s landing rule sends an account with a
 * workspace and no Brand Brain straight back to /onboarding, so `goto('/home')`
 * never rendered the dashboard at all. `bootstrapWorkspace` in the fixtures
 * records the same trap and presses the same button.
 */
async function bootstrap(page: Page): Promise<void> {
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  try {
    await create.waitFor({ state: 'visible', timeout: 20_000 })
    await create.click()
    await page.waitForURL(/\/onboarding/, { timeout: 40_000 })
  } catch {
    /* already bootstrapped */
  }
  await leaveOnboarding(page)
}

/** The workspace this account just made, or null when there is no service key. */
async function workspaceIdFor(clerkUserId: string): Promise<string | null> {
  const admin = adminClient() as SupabaseClient | null
  if (!admin) return null
  const { data } = await admin
    .from('workspaces')
    .select('id')
    .eq('created_by', clerkUserId)
    .limit(1)
  return data?.[0]?.id ?? null
}

/**
 * Give the workspace one thing it has done, AND spend half its free credits.
 *
 * Since `7a8036ae` the offer waits for the first action (a post, a connection,
 * a brain, a spend): a plan pitched at somebody who has not yet seen the
 * product was the founder's ruling to remove. Since the 2026-09-06 /home audit
 * it also waits until half of Free's monthly credits are gone
 * (`OFFER_AT_OR_BELOW` in lib/billing/plan-offer.ts): MEASURED in a real
 * browser, one saved draft alone put the dialog over the first dashboard a
 * workspace ever saw, with 100 of 100 credits unspent.
 *
 * So the seed is two writes. One review-state post is the smallest true
 * "started" signal; one 60-credit DEBIT through `app.apply_ledger_entry` — the
 * ONLY legal writer of `credit_balances`, and reachable only over a direct
 * connection because `app.*` is not exposed through PostgREST — is the smallest
 * true "running low" signal. Both fail loudly when their credential is absent:
 * a test that cannot run must not report as one that passed.
 */
async function seedFirstAction(clerkUserId: string): Promise<void> {
  const admin = adminClient() as SupabaseClient | null
  expect(
    admin,
    'no SUPABASE_SERVICE_ROLE_KEY: the started workspace cannot be set up, and a ' +
      'test that cannot run must not report as one that passed',
  ).not.toBeNull()
  const workspaceId = await workspaceIdFor(clerkUserId)
  expect(workspaceId, 'the bootstrap did not produce a workspace').not.toBeNull()
  const { error } = await admin!.from('posts').insert({
    workspace_id: workspaceId,
    title: 'Saturday cupping, five seats',
    body: 'Saturday cupping is open again. Five seats, no charge, 9am.',
    status: 'review',
    channels: ['instagram'],
    created_by: clerkUserId,
  })
  expect(error, `could not seed the first post: ${error?.message}`).toBeNull()
  await spendHalf(workspaceId as string)
}

/** Take the free grant below the offer threshold, through the ledger function. */
async function spendHalf(workspaceId: string): Promise<void> {
  const url = process.env.SUPABASE_DB_URL
  expect(
    url,
    'no SUPABASE_DB_URL: the low-credits case cannot be set up, and a test that ' +
      'cannot run must not report as one that passed',
  ).toBeTruthy()
  const { Client } = (await import('pg')).default
  const client = new Client({ connectionString: url })
  try {
    await client.connect()
    await client.query(
      `select app.apply_ledger_entry($1::uuid, 'DEBIT', $2::int, $3::text, $4::text)`,
      [workspaceId, 60, `plan-offer-${workspaceId}`, 'draft_post'],
    )
  } finally {
    await client.end().catch(() => {})
  }
}

test.describe('the plan offer @smoke', () => {
  test.setTimeout(4 * 60_000)

  test('opens on the dashboard for a workspace on Free, and stays shut once closed', async ({
    page,
    signedIn,
  }) => {
    expect(signedIn).toBeTruthy()
    await bootstrap(page)

    // ── AN EMPTY WORKSPACE GETS NO OFFER ────────────────────────────────────
    // The ruling of 7a8036ae, asserted before the seed so a regression that
    // opens the modal on first sight fails here and not somewhere vaguer.
    await page.goto('/home')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('#main')).toBeVisible()
    await expect(page.getByRole('dialog').filter({ hasText: OFFER_TITLE })).toBeHidden()

    await seedFirstAction(signedIn.clerkUserId)
    await page.goto('/home')

    const offer = page.getByRole('dialog').filter({ hasText: OFFER_TITLE })
    await expect(offer).toBeVisible({ timeout: 30_000 })

    // The three paid plans, by the names the catalog gives them. `Studio` is the
    // customer-facing name of the plan whose id is `agency`; asserting the label
    // is asserting the half a customer reads.
    await expect(offer.getByRole('button', { name: 'Choose Starter' })).toBeVisible()
    await expect(offer.getByRole('button', { name: 'Choose Growth' })).toBeVisible()
    await expect(offer.getByRole('button', { name: 'Choose Studio' })).toBeVisible()
    // Real prices, from PLAN_CATALOG. A rendered mockup would pass everything
    // above this line and fail here.
    await expect(offer).toContainText('1,999')
    await expect(offer).toContainText('3,999')
    await expect(offer).toContainText('7,999')

    // ── THE DASHBOARD IS STILL THERE UNDERNEATH, AND STILL WORKS ────────────
    await offer.getByRole('button', { name: 'Close' }).click()
    await expect(offer).toBeHidden()
    await expect(page.locator('#main')).toBeVisible()

    // ── AND IT DOES NOT COME BACK IN THIS SIGN-IN ───────────────────────────
    // A full reload, not a client navigation: the dismissal has to survive the
    // component being mounted from scratch, which is the case a state variable
    // alone would fail.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('#main')).toBeVisible()
    await expect(page.getByRole('dialog').filter({ hasText: OFFER_TITLE })).toBeHidden()
  })

  test('closes on Escape as well as on the X', async ({ page, signedIn }) => {
    expect(signedIn).toBeTruthy()
    await bootstrap(page)
    await seedFirstAction(signedIn.clerkUserId)
    await page.goto('/home')

    const offer = page.getByRole('dialog').filter({ hasText: OFFER_TITLE })
    await expect(offer).toBeVisible({ timeout: 30_000 })

    // Escape is the platform's own behaviour on `<dialog>`, and jsdom cannot
    // exercise it: the modal tests dispatch the `close` event by hand because
    // there is no dialog implementation to press Escape against.
    await page.keyboard.press('Escape')
    await expect(offer).toBeHidden()

    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('dialog').filter({ hasText: OFFER_TITLE })).toBeHidden()
  })

  test('never opens for a workspace that is on a paid plan', async ({ page, signedIn }) => {
    expect(signedIn).toBeTruthy()
    await bootstrap(page)

    const admin = adminClient() as SupabaseClient | null
    expect(
      admin,
      'no SUPABASE_SERVICE_ROLE_KEY: the paying-customer case cannot be set up, and a ' +
        'test that cannot run must not report as one that passed',
    ).not.toBeNull()

    const workspaceId = await workspaceIdFor(signedIn.clerkUserId)
    expect(workspaceId, 'the bootstrap did not produce a workspace').not.toBeNull()

    const { error } = await admin!.from('subscriptions').insert({
      workspace_id: workspaceId,
      plan_id: 'growth',
      status: 'active',
      provider: 'stripe',
    })
    expect(error, `could not put the workspace on a plan: ${error?.message}`).toBeNull()
    // Started AND paid: the stricter case. An empty paid workspace would stay
    // silent for the wrong reason (not-started) and prove nothing about plans.
    await seedFirstAction(signedIn.clerkUserId)

    await page.goto('/home')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('#main')).toBeVisible()
    await expect(page.getByRole('dialog').filter({ hasText: OFFER_TITLE })).toBeHidden()
  })

  test('the helper other specs use really does clear it', async ({ page, signedIn }) => {
    /**
     * `dismissPlanOffer` is called by every spec that measures /home with a
     * workspace, and a helper that silently does nothing would let all of them
     * go green while the offer sat over the screen they were photographing. So
     * the helper is tested where it is used: press it, then assert the thing it
     * claims to have closed is closed.
     */
    expect(signedIn).toBeTruthy()
    await bootstrap(page)
    await seedFirstAction(signedIn.clerkUserId)
    await page.goto('/home')

    await expect(page.getByRole('dialog').filter({ hasText: OFFER_TITLE })).toBeVisible({
      timeout: 30_000,
    })
    await dismissPlanOffer(page)
    await expect(page.getByRole('dialog').filter({ hasText: OFFER_TITLE })).toBeHidden()
  })
})
