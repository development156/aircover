import { expect as pwExpect, type Page } from '@playwright/test'

import { adminClient, expect, test } from './fixtures/seeded-user'

/**
 * WHERE DOES A SIGNED-IN PERSON LAND?
 *
 * Four cases, each on its OWN fresh Clerk account, because onboarding's tail is
 * reachable once per workspace and rewinding one is how a peer lost a step
 * permanently. The fixture mints and deletes a user per test, so "fresh" here is
 * literal rather than a convention.
 *
 * NOT @smoke: each test signs up through Clerk's API and creates a workspace.
 * Nothing here spends a credit or calls a model — the paid tail is
 * `onboarding-boot-video.spec.ts`, deliberately separate for the same reason
 * `onboarding-build.spec.ts` is separate from the walk.
 */

test.describe.configure({ timeout: 180_000 })

/** The bootstrap, from the screen a workspace-less account actually gets. */
async function createWorkspace(page: Page): Promise<void> {
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  await pwExpect(create).toBeVisible({ timeout: 60_000 })
  await create.click()
  // `createWorkspace` redirects into the flow. That IS the ruling for a brand
  // new account: the workspace is the only thing that has to exist first.
  await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
}

/**
 * A COMPLETE payload, not a stub, and the difference is a finding rather than a
 * detail.
 *
 * The two readers on this row disagree ON PURPOSE. `read-onboarding-state.ts`
 * selects `id` and never opens the payload, so ROUTING sees any row at all —
 * which is why a workspace whose brain no longer parses is still treated as
 * finished rather than walked through nine screens again. `activeBrandMemory`
 * parses with `StoredBrandMemorySchema` and degrades an unparseable payload to
 * "no saved brain", which is right for the EDITOR: it must not hand somebody
 * half a brain.
 *
 * MEASURED: a two-key stub passed the routing test and failed this one, because
 * /onboarding then rendered the first-time flow. Every field below is required
 * by the schema, and the three-item arrays are `.length(3)` in it.
 */
const SEEDED_BRAIN = {
  voice: {
    descriptor: 'Warm and plain-spoken',
    formality_label: 'Casual',
    signature_phrases: ['pull up a chair', 'the kettle is on', 'come and read'],
    banned_phrases: ['synergy'],
  },
  brand_persona: {
    archetype: 'The Host',
    one_liner: 'A bookshop that pours chai while you decide.',
    core_values: ['patience', 'curiosity', 'welcome'],
  },
  customer_persona: {
    one_liner: 'Weekend readers looking for somewhere unhurried.',
    primary_pain_point: 'Bookshops that feel like transactions.',
    primary_fear: 'Being rushed out.',
    desired_identity: 'Someone with a place to read.',
  },
  hook: {
    core_promise: 'Somewhere to sit and read on a Sunday.',
    primary_emotion: 'calm',
    sample_hooks: ['Sunday readings, four o clock', 'The chai is free', 'Stay as long as you like'],
  },
  taboo: { red_lines: ['never rush a browsing customer'] },
  alignment: { signal_lock: 'moderate', note: 'Seeded by the routing suite.' },
}

/**
 * Give this workspace a Brand Brain WITHOUT walking the flow or spending a
 * credit. Service-role, test scaffolding only — `apps/web` has no such client.
 */
async function giveBrain(workspaceId: string): Promise<void> {
  const admin = adminClient()
  if (!admin) throw new Error('E2E needs SUPABASE_SERVICE_ROLE_KEY to seed a brain')
  const { error } = await admin.from('brand_memory').insert({
    workspace_id: workspaceId,
    status: 'active',
    version: 1,
    source: 'system',
    payload: SEEDED_BRAIN,
  })
  if (error) throw new Error(`could not seed brand_memory: ${error.message}`)
}

async function workspaceIdOf(clerkUserId: string): Promise<string> {
  const admin = adminClient()
  if (!admin) throw new Error('E2E needs SUPABASE_SERVICE_ROLE_KEY')
  const { data, error } = await admin.from('workspaces').select('id').eq('created_by', clerkUserId)
  if (error || !data?.[0]) throw new Error(`no workspace for ${clerkUserId}: ${error?.message}`)
  return data[0].id as string
}

/* ─────────────────────────────────────────────────────── no workspace ── */

test('an account with no workspace gets the first-run screen, not a broken page', async ({
  page,
  signedIn,
}) => {
  // `signedIn` is destructured on EVERY test in this file even where its value
  // is unused. Playwright only runs a fixture a test ASKS for, so omitting it
  // does not sign in — the first draft of this file did exactly that and every
  // assertion failed against /sign-in, which reads like a routing bug and is a
  // harness one.
  void signedIn
  /**
   * THE PEER'S FINDING, EXECUTED.
   *
   * /analytics told a workspace-less account to connect a channel — an
   * instruction it cannot carry out, because a connection belongs to a workspace
   * it does not have. The fix is the whole class at once: the page does not
   * render in this state, at any URL under (app).
   */
  await page.goto('/analytics')

  // The URL is NOT changed. Replacing the content is what covers every route;
  // a redirect would only cover the ones somebody remembered.
  expect(new URL(page.url()).pathname).toBe('/analytics')

  await pwExpect(page.getByText(/create a workspace to get started/i)).toBeVisible({
    timeout: 60_000,
  })
  // The remedy that cannot work must be gone.
  await pwExpect(page.getByText(/connect a channel/i)).toBeHidden()
  await pwExpect(
    page.locator('#main').getByRole('button', { name: /create workspace/i }),
  ).toBeVisible()
})

test('the shell stays, so a workspace-less account can still sign out', async ({
  page,
  signedIn,
}) => {
  void signedIn
  // The other half of "no dead ends". If the layout REDIRECTED to a bare screen
  // the topbar would go with it, and the only way out of the product would be to
  // use it.
  await page.goto('/posts')

  await pwExpect(page.getByText(/create a workspace to get started/i)).toBeVisible({
    timeout: 60_000,
  })
  // Clerk's user button is the app's one sign-out. It renders in the topbar.
  await pwExpect(
    page.locator('.cl-userButtonTrigger, [data-clerk-component]').first(),
  ).toBeVisible()
})

test('/onboarding without a workspace offers BOTH a remedy and a way out', async ({
  page,
  signedIn,
}) => {
  void signedIn
  await page.goto('/onboarding')

  await pwExpect(page.getByRole('heading', { name: /make a workspace first/i })).toBeVisible({
    timeout: 60_000,
  })
  await pwExpect(page.getByRole('button', { name: /create workspace/i })).toBeVisible()
  /**
   * This card returns BEFORE `OnboardingStage`, so it has no header, no
   * `Save & exit` and — until this lane — no user menu either. It is the one
   * screen in the product from which a person could not leave.
   */
  await pwExpect(page.getByRole('button', { name: /^sign out$/i })).toBeVisible()
})

/* ────────────────────────────────────────────── a workspace, no brain ── */

test('a new account with a workspace lands in onboarding, not on the dashboard', async ({
  page,
  signedIn,
}) => {
  void signedIn
  await createWorkspace(page)

  // The ruling. Arriving at the dashboard by any door lands in the flow.
  await page.goto('/home')
  await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
  expect(new URL(page.url()).pathname).toBe('/onboarding')
})

test('Save & exit reaches the dashboard, and the next visit lands in the flow again', async ({
  page,
  context,
  signedIn,
}) => {
  void signedIn
  await createWorkspace(page)

  await pwExpect(page.getByRole('heading', { name: /teach Sahoda/i })).toBeVisible({
    timeout: 60_000,
  })

  /**
   * wt-onboard2 BUILT THIS BUTTON. A landing rule that bounced it back would
   * have deleted the feature while every test of the button still passed — it
   * would still save, still navigate, and arrive nowhere.
   */
  await page.getByRole('button', { name: /save & exit/i }).click()
  await page.waitForURL(/\/home/, { timeout: 60_000 })
  expect(new URL(page.url()).pathname).toBe('/home')

  // And it holds for the rest of the visit rather than for one navigation.
  await page.goto('/home')
  expect(new URL(page.url()).pathname).toBe('/home')

  /**
   * THE DEFERRAL IS A SESSION COOKIE. Clearing it is what a new browser session
   * is, and the next sign-in must land back in the flow — the ruling's "mid-way
   * → resumes at the step they left", carried across a sign-out.
   */
  await context.clearCookies({ name: 'sahoda_onb_defer' })
  await page.goto('/home')
  await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
})

test('mid-way, the flow resumes at the step they left', async ({ page, signedIn }) => {
  void signedIn
  await createWorkspace(page)

  await pwExpect(page.getByRole('heading', { name: /teach Sahoda/i })).toBeVisible({
    timeout: 60_000,
  })
  await page.getByRole('button', { name: /build my brand brain/i }).click()
  await page.locator('#f-name').fill('Chai & Chapters')
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await pwExpect(
    page.getByRole('heading', { name: /what does your brand actually do/i }),
  ).toBeVisible()

  // Leave, then come back the way the ruling describes: land on the dashboard,
  // be routed into the flow, and find the step you were on.
  await page.getByRole('button', { name: /save & exit/i }).click()
  await page.waitForURL(/\/home/, { timeout: 60_000 })
  await page.context().clearCookies({ name: 'sahoda_onb_defer' })
  await page.goto('/home')
  await page.waitForURL(/\/onboarding/, { timeout: 60_000 })

  // Step 02, not the intro. The resume point is localStorage, which the server
  // cannot see — which is why both cases route to the same URL.
  await pwExpect(
    page.getByRole('heading', { name: /what does your brand actually do/i }),
  ).toBeVisible({ timeout: 30_000 })
  await pwExpect(page.locator('#f-name')).toBeHidden()
})

/* ────────────────────────────────────────────────────────── finished ── */

test('a finished account goes straight to the dashboard and is never offered the flow again', async ({
  page,
  signedIn,
}) => {
  await createWorkspace(page)
  await giveBrain(await workspaceIdOf(signedIn.clerkUserId))

  await page.goto('/home')
  // No redirect. This is the assertion a `null`-collapsing read would fail the
  // moment a query hiccupped.
  expect(new URL(page.url()).pathname).toBe('/home')
  await pwExpect(page.getByText(/available credits/i)).toBeVisible({ timeout: 60_000 })

  // A second arrival, and a different door.
  await page.goto('/posts')
  expect(new URL(page.url()).pathname).toBe('/posts')
})

test('re-entering /onboarding with a brain offers a review, not a paid rebuild', async ({
  page,
  signedIn,
}) => {
  await createWorkspace(page)
  await giveBrain(await workspaceIdOf(signedIn.clerkUserId))

  /**
   * THE DEAD END A PEER FOUND, RE-EXECUTED RATHER THAN RE-READ.
   *
   * A workspace that already had a brain was offered the nine-step flow, and the
   * only route to the brain it already owned was paying 50 credits again.
   */
  await page.goto('/onboarding')

  /**
   * IT IS A DIFFERENT SCREEN, not the nine-step flow with an extra button.
   * `IntroStep` branches on `hasSavedBrain` and this is the branch — which is
   * why the heading is not the one a first-time visitor meets.
   */
  await pwExpect(page.getByRole('heading', { name: /your brand brain\s+is ready/i })).toBeVisible({
    timeout: 60_000,
  })
  await pwExpect(page.getByText(/nothing to rebuild and nothing to spend/i)).toBeVisible()

  // The PRIMARY action is the free one. Rebuilding is the ghost button beside
  // it, and its price is stated before it is pressed rather than after.
  await pwExpect(page.locator('#review-saved')).toBeVisible()
  await pwExpect(page.getByText(/uses \d+ credits? and replaces what is there/i)).toBeVisible()

  await page.locator('#review-saved').click()
  await page.waitForURL(/\/brain/, { timeout: 60_000 })

  // Reached without spending anything: the balance is the untouched signup grant.
  await page.goto('/wallet')
  await pwExpect(page.getByText('100').first()).toBeVisible({ timeout: 60_000 })
})
