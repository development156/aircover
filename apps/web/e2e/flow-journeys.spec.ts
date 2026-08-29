import type { Page } from '@playwright/test'

import { adminClient, expect, signInSecondContext, test } from './fixtures/seeded-user'
import { seedFlowWorkspace, workspaceIdFor, DIVERGED } from './helpers/flow-seed'

/**
 * WHAT HAPPENS TO A FLOW WHEN THE PERSON DOES NOT WALK IT FORWARDS.
 *
 * Every journey in this lane is judged on five things a real person does and
 * that a happy-path capture never covers: reload half way, press Back, press
 * Forward after Back, arrive by a deep link with no prior state, and open the
 * same thing in two tabs.
 *
 * ── WHY THESE ARE HERE AND NOT IN THE UNIT SUITE ─────────────────────────────
 * `use-step-history.test.tsx` proves the hook's arithmetic against jsdom's real
 * history stack, which is the right place for it. It cannot prove that the
 * SCREEN survives a reload, because a reload is the one thing a component test
 * cannot do — the state under examination is what a fresh document rebuilds
 * from storage, and there is no fresh document in jsdom.
 *
 * NOTHING HERE PUBLISHES, and nothing walks past "Build my brand brain".
 *
 * Deliberately NOT @smoke: it mints a Clerk user and opens a second browser
 * context.
 */

test.describe.configure({ timeout: 600_000 })

const ANSWERS = {
  name: 'Chai & Chapters',
  site: 'https://example.com',
  what: 'A neighbourhood bookshop that serves chai and hosts Sunday readings.',
  audience: 'weekend readers in Bengaluru',
} as const

async function bootstrap(page: Page): Promise<void> {
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  await create.waitFor({ state: 'visible', timeout: 60_000 })
  await create.click()
  await page.waitForURL(/\/onboarding/, { timeout: 90_000 })
}

/** Walk to step 03, answering as we go. Leaves the flow on the audience question. */
async function walkToAudience(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: /teach Sahoda/i })).toBeVisible({
    timeout: 60_000,
  })
  await page.getByRole('button', { name: /build my brand brain/i }).click()
  await page.locator('#f-name').fill(ANSWERS.name)
  await page.locator('#f-site').fill(ANSWERS.site)
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await page.locator('#f-what').fill(ANSWERS.what)
  await page.getByRole('button', { name: 'Local business', exact: true }).click()
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await expect(page.getByRole('heading', { name: /who are you trying to reach/i })).toBeVisible()
}

test.describe('onboarding, walked the way a person actually walks it', () => {
  test('Back returns to the previous question instead of leaving the flow', async ({
    page,
    signedIn,
  }) => {
    void signedIn
    await bootstrap(page)
    await walkToAudience(page)

    await page.goBack()

    // STILL ON /onboarding — this is the whole finding. Before the history hook
    // this press left the route entirely, on the screens every customer meets
    // first.
    expect(new URL(page.url()).pathname).toBe('/onboarding')
    await expect(
      page.getByRole('heading', { name: /what does your brand actually do/i }),
    ).toBeVisible()
  })

  test('the words typed on the step behind are still there', async ({ page, signedIn }) => {
    void signedIn
    await bootstrap(page)
    await walkToAudience(page)

    await page.goBack()
    await expect(page.locator('#f-what')).toHaveValue(ANSWERS.what)
  })

  test('FORWARD after Back returns to the question that was left', async ({ page, signedIn }) => {
    // docs/34 §11 records this as exercised nowhere, for any flow. A Back that
    // pushes its own entry passes the two tests above and makes Forward dead.
    void signedIn
    await bootstrap(page)
    await walkToAudience(page)

    await page.goBack()
    await expect(
      page.getByRole('heading', { name: /what does your brand actually do/i }),
    ).toBeVisible()

    await page.goForward()
    await expect(page.getByRole('heading', { name: /who are you trying to reach/i })).toBeVisible()
  })

  test('a reload half way keeps both the position and the answers', async ({ page, signedIn }) => {
    void signedIn
    await bootstrap(page)
    await walkToAudience(page)
    await page.locator('#f-aud').fill(ANSWERS.audience)

    await page.reload()

    // The store is per workspace and resumes where they left. A reload that
    // returned to the intro would make every interruption a restart.
    await expect(page.getByRole('heading', { name: /who are you trying to reach/i })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.locator('#f-aud')).toHaveValue(ANSWERS.audience)
  })

  test('a deep link into /onboarding with no prior state opens the intro, not a blank', async ({
    page,
    signedIn,
  }) => {
    void signedIn
    await bootstrap(page)
    // Straight to the URL with nothing saved: the first paint is the intro for
    // everyone, deliberately, because the resumed step lives in localStorage
    // and the server cannot see it.
    await page.evaluate(() => {
      for (const k of Object.keys(window.localStorage)) {
        if (k.startsWith('sahoda.brandbrain')) window.localStorage.removeItem(k)
      }
    })
    await page.goto('/onboarding')
    await expect(page.getByRole('heading', { name: /teach Sahoda/i })).toBeVisible({
      timeout: 60_000,
    })
    // And it is not a dead end: the free-first-time position is stated here.
    await expect(page.getByText(/free the first time|uses \d+ credits/i)).toBeVisible()
  })
})

test.describe('the composer, arrived at sideways', () => {
  async function seeded(page: Page, clerkUserId: string): Promise<string> {
    await bootstrap(page)
    const admin = adminClient()
    expect(admin).not.toBeNull()
    const workspaceId = await workspaceIdFor(admin!, clerkUserId)
    expect(workspaceId).not.toBeNull()
    const { divergedPostId } = await seedFlowWorkspace(admin!, workspaceId!, clerkUserId)
    expect(divergedPostId).not.toBeNull()
    return divergedPostId as string
  }

  test('a deep link straight to a post opens it, with a way back to the list', async ({
    page,
    signedIn,
  }) => {
    const postId = await seeded(page, signedIn.clerkUserId)
    await page.goto(`/posts/${postId}`)

    await expect(page.locator('[data-composer]')).toBeVisible({ timeout: 60_000 })
    // The momentum half: docs/34 §10 lists "no back link" among the reasons this
    // was named the worst screen in the product. A deep link is exactly the
    // arrival where the rail is the only other way out.
    const back = page.getByRole('link', { name: /all posts/i })
    await expect(back).toBeVisible()
    await back.click()
    await page.waitForURL(/\/posts$/, { timeout: 30_000 })
  })

  test('Back from the composer returns to the list it came from', async ({ page, signedIn }) => {
    const postId = await seeded(page, signedIn.clerkUserId)
    await page.goto('/posts')
    await page
      .getByRole('link', { name: new RegExp(DIVERGED.title, 'i') })
      .first()
      .click()
    await page.waitForURL(new RegExp(postId), { timeout: 60_000 })

    await page.goBack()
    await page.waitForURL(/\/posts$/, { timeout: 30_000 })
    // ── THE TIMEOUT IS THE MACHINE, NOT THE CLAIM ────────────────────────────
    // This assertion failed in a full-file run and passed alone, three times.
    // Rather than assume either way, the behaviour was TRACED: `goBack()` then
    // a poll of `location.pathname`, `[data-composer]` and every `h1` every
    // 250ms for six seconds, run both immediately after the composer appears
    // and after a three-second settle. Both traces read
    // `path=/posts composer=false h1=Posts` at t+0 and never moved.
    //
    // So the app is right and the wait was short. `/posts/[id]` is the heaviest
    // route in the product (33.5 kB, first load 295 kB) and this file opens two
    // browser contexts before reaching here; the repo's global expect timeout is
    // 15s and specs across this suite already override it to 60s for exactly
    // this reason. The CLAIM is untouched — Back lands on the list, and the
    // composer is gone when it does.
    await expect(page.locator('[data-composer]')).toHaveCount(0, { timeout: 60_000 })
    await expect(page.getByRole('heading', { name: /^posts$/i })).toBeVisible({ timeout: 60_000 })
  })

  test('a reload keeps both channels, both bodies and both limits', async ({ page, signedIn }) => {
    const postId = await seeded(page, signedIn.clerkUserId)
    await page.goto(`/posts/${postId}`)
    await expect(page.locator('[data-version-card="x"]')).toBeVisible({ timeout: 60_000 })

    await page.reload()

    await expect(page.locator('[data-version-card="x"]')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('[data-version-card="linkedin"]')).toBeVisible()
    // TWO DIFFERENT limits, read off the rendered meters — the product's one
    // structural claim, surviving a fresh document.
    await expect(page.locator('[data-version-card="x"]')).toContainText('280')
    await expect(page.locator('[data-version-card="linkedin"]')).toContainText('3,000')
  })

  test('two tabs on the same post both render it, and neither blanks the other', async ({
    page,
    browser,
    signedIn,
  }) => {
    // Two CONTEXTS, not two tabs in one: docs/23 is explicit that a shared
    // cookie jar masks a defect that only appears when two sessions hold
    // different beliefs about the same row.
    const postId = await seeded(page, signedIn.clerkUserId)
    await page.goto(`/posts/${postId}`)
    await expect(page.locator('[data-composer]')).toBeVisible({ timeout: 60_000 })

    const second = await signInSecondContext(browser, signedIn)
    try {
      await second.goto(`/posts/${postId}`)
      await expect(second.locator('[data-composer]')).toBeVisible({ timeout: 60_000 })
      await expect(second.locator('[data-version-card="x"]')).toBeVisible()
      // The first tab is untouched by the second opening. This asserts the
      // READ side only: the concurrent WRITE case is docs/23's own subject and
      // `concurrent-edit.spec.ts` owns it.
      await expect(page.locator('[data-version-card="x"]')).toBeVisible()
    } finally {
      await second.context().close()
    }
  })
})

test.describe('the planner keeps its view across a reload', () => {
  test('a reload on the calendar comes back to the calendar', async ({ page, signedIn }) => {
    // The view lives in the URL rather than in state, which is what makes this
    // true — and is why a deep link to a view is shareable. Asserted because
    // moving it into React state would be an easy, invisible regression.
    void signedIn
    await bootstrap(page)
    await page.goto('/planner?view=month')
    await page.reload()
    expect(new URL(page.url()).searchParams.get('view')).toBe('month')
  })
})
