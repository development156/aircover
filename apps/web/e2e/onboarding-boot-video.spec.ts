import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect as pwExpect, type Page } from '@playwright/test'

import { adminClient, expect, test, type SeededUser } from './fixtures/seeded-user'

/**
 * THE BOOT ANIMATION, DRIVEN.
 *
 * ── WHAT A HEADLESS BROWSER CAN AND CANNOT PROVE ─────────────────────────────
 * There is no audio sink here, so "sound came out of a speaker" is not a
 * measurable claim and is never made. What IS measurable is the element's state
 * and the branch that ran: `muted === false`, `volume === 1`, playing, and
 * `data-boot-audio="unmuted"` with the muted fallback NOT entered. That is the
 * honest form of the claim and it is the form asserted below.
 *
 * Nothing here passes `--autoplay-policy=no-user-gesture-required`. A flag that
 * makes the test go green by removing the policy would prove something no
 * customer's browser does.
 *
 * ── COST ─────────────────────────────────────────────────────────────────────
 * NOT @smoke. Each test walks the flow to the end, which calls the model once.
 * That resolve is FREE for a fresh workspace (`isFirstResolve`), so no credit is
 * spent, but a provider is called — the same trade `onboarding-build.spec.ts`
 * already makes, and the reason both sit outside the gate.
 */

const SHOT_DIR =
  process.env.BOOT_SHOT_DIR ??
  '/tmp/claude-1000/-home-divas-Documents-GitHub-sahodalabs/15ddfed2-eef5-454a-8a62-1ea8aeaa3975/scratchpad/shots'

const ANSWERS = {
  name: 'Chai & Chapters',
  what: 'A neighbourhood bookshop that serves chai and hosts Sunday readings.',
  category: 'Local business',
  audience: 'weekend readers in Bengaluru',
}

/**
 * THE POINTER GOES OFF-SCREEN BEFORE EVERY FRAME.
 *
 * Playwright parks the mouse wherever it last clicked, so the control a shot is
 * about is photographed in `:hover` — a peer captured a primary action as solid
 * black three times that way before anyone noticed the cursor was the cause.
 */
async function shoot(page: Page, label: string): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true })
  await page.mouse.move(-40, -40).catch(() => {})
  const buf = await page.screenshot()
  writeFileSync(join(SHOT_DIR, `${label}.png`), buf)
  // eslint-disable-next-line no-console
  console.log(`SHOT ${label} ${buf.length}B`)
}

async function createWorkspace(page: Page): Promise<void> {
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  await pwExpect(create).toBeVisible({ timeout: 60_000 })
  await create.click()
  await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
}

/** Answer the flow and press Build. Stops on the result card, one click short of Enter. */
async function walkToResult(page: Page): Promise<void> {
  await pwExpect(page.getByRole('heading', { name: /teach Sahoda/i })).toBeVisible({
    timeout: 60_000,
  })
  await page.getByRole('button', { name: /build my brand brain/i }).click()

  await page.locator('#f-name').fill(ANSWERS.name)
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await page.locator('#f-what').fill(ANSWERS.what)
  await page.getByRole('button', { name: ANSWERS.category, exact: true }).click()
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await page.locator('#f-aud').fill(ANSWERS.audience)
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await page.getByRole('button', { name: /^Continue$/ }).click() // 04 visual
  await page.getByRole('button', { name: /^Continue$/ }).click() // 05 references
  await page.getByRole('button', { name: /^Continue$/ }).click() // 06 knowledge

  await pwExpect(page.getByRole('heading', { name: /understand your market too/i })).toBeVisible()
  await page.getByRole('button', { name: /build my brand brain/i }).click()

  await pwExpect(page.getByRole('heading', { name: /your brand brain is ready/i })).toBeVisible({
    timeout: 300_000,
  })
}

/**
 * Read one of the stage's reported flags.
 *
 * ONLY VALID WHILE /onboarding IS STILL MOUNTED. `[data-boot-*]` lives on that
 * page, so a read after the film has navigated to /home waits for a node that
 * left with the document — MEASURED: the first draft called this for
 * `data-boot-end` immediately after `waitForURL`, and the test sat on a
 * successful dashboard until the 600s ceiling, with a page snapshot showing
 * Home rendered correctly behind it. A hang that looks like a product defect
 * and is a harness one.
 *
 * WHICH of the four endings fired is pinned per-ending in
 * `use-boot-video.test.tsx`. What the browser is here to measure is the OUTCOME
 * and the TIME, and the timings below are what separate the failure paths from
 * each other and from a film that ran.
 */
const flag = (page: Page, name: string) =>
  page.locator(`[data-boot-${name}]`).getAttribute(`data-boot-${name}`)

/** What the media element itself reports. The only evidence about audio there is. */
async function videoState(page: Page) {
  return page.evaluate(() => {
    const v = document.querySelector('[data-boot-video] video') as HTMLVideoElement | null
    if (!v) return null
    return {
      muted: v.muted,
      volume: v.volume,
      paused: v.paused,
      currentTime: v.currentTime,
      readyState: v.readyState,
      duration: v.duration,
      hasControls: v.hasAttribute('controls'),
      tabIndex: v.tabIndex,
      src: v.currentSrc,
    }
  })
}

async function seenFlagOf(user: SeededUser): Promise<unknown> {
  const admin = adminClient()
  if (!admin) throw new Error('E2E needs SUPABASE_SERVICE_ROLE_KEY')
  const { data } = await admin
    .from('users_profile')
    .select('prefs')
    .eq('user_id', user.clerkUserId)
    .maybeSingle()
  return (data as { prefs?: Record<string, unknown> } | null)?.prefs?.boot_video_seen
}

test.describe.configure({ timeout: 600_000 })

/* ══════════════════════════════════ the journey, once, with sound ══════ */

test('onboarding → the film with sound → the dashboard, once', async ({ page, signedIn }) => {
  await createWorkspace(page)
  await walkToResult(page)

  // MOUNTED BEFORE THE CLICK. `play()` must run inside the click's own call
  // stack to keep the audio permission, and an element created in the same tick
  // has nothing to play.
  await pwExpect(page.locator('[data-boot-video]')).toHaveCount(1)
  expect(await flag(page, 'plays')).toBe('yes')
  await shoot(page, 'boot-01-result-1440-light')

  const clickedAt = Date.now()
  await page.getByRole('button', { name: /enter sahoda/i }).click()

  // It is on screen and it is running.
  await pwExpect(page.locator('[data-boot-video][data-active="true"]')).toBeVisible({
    timeout: 10_000,
  })
  await pwExpect
    .poll(async () => (await videoState(page))?.currentTime ?? 0, { timeout: 10_000 })
    .toBeGreaterThan(0.2)
  await shoot(page, 'boot-02-playing-1440-light')

  /**
   * THE AUDIO CLAIM, in the only form this environment can support.
   *
   * `muted === false` with `volume === 1` on a playing element means the browser
   * accepted UNMUTED playback — it did not silently mute us, which is what the
   * policy does when it refuses. `data-boot-audio` says which branch the code
   * took, so a fallback that ran would be visible rather than inferred.
   */
  const state = await videoState(page)
  expect(state).not.toBeNull()
  expect(state!.muted).toBe(false)
  expect(state!.volume).toBe(1)
  expect(state!.paused).toBe(false)
  expect(await flag(page, 'audio')).toBe('unmuted')
  // eslint-disable-next-line no-console
  console.log(`AUDIO PATH: ${await flag(page, 'audio')}  duration=${state!.duration}s`)

  /* ── NO SKIP. Every input a person could reach for, and none of them work ── */
  const before = state!.currentTime
  await page.mouse.click(640, 400)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Space')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(700)

  const after = await videoState(page)
  expect(after!.paused).toBe(false)
  // It kept going. A pause would have frozen currentTime; a seek would have
  // moved it backwards.
  expect(after!.currentTime).toBeGreaterThan(before)
  // And nothing navigated. Escape used to call `Save & exit`.
  expect(new URL(page.url()).pathname).toBe('/onboarding')
  // The element offers no controls and cannot be focused.
  expect(after!.hasControls).toBe(false)
  expect(after!.tabIndex).toBe(-1)

  /* ── it ends, and the dashboard is behind it ── */
  await page.waitForURL(/\/home/, { timeout: 60_000 })
  const total = Date.now() - clickedAt
  // eslint-disable-next-line no-console
  console.log(`ENTER→DASHBOARD (unthrottled): ${total}ms`)
  // The film is ten seconds. Landing much sooner would mean something cut it
  // short; much later would mean the dashboard was not ready behind it.
  expect(total).toBeGreaterThan(9_000)
  await pwExpect(page.getByText(/available credits/i)).toBeVisible({ timeout: 30_000 })
  await shoot(page, 'boot-03-dashboard-1440-light')

  /* ── PERSISTED SERVER-SIDE ── */
  await pwExpect.poll(() => seenFlagOf(signedIn), { timeout: 20_000 }).toBe(true)

  /* ── AND NEVER AGAIN ── */
  await page.goto('/onboarding')
  /**
   * The RE-ENTRY branch, which is what a finished workspace gets — a different
   * screen, not the nine-step flow with a button added. (`IntroStep` branches on
   * `hasSavedBrain`.) Worth asserting here rather than only in the routing
   * suite: that one seeds `brand_memory` directly, and this one arrives having
   * genuinely walked and paid for the thing.
   */
  await pwExpect(page.getByRole('heading', { name: /your brand brain\s+is ready/i })).toBeVisible({
    timeout: 60_000,
  })

  // The film is not offered a second time, and it is not merely hidden — the
  // element is never mounted, so its 2.7 MB is never fetched again either.
  expect(await flag(page, 'plays')).toBe('no')
  await pwExpect(page.locator('[data-boot-video]')).toHaveCount(0)
})

/* ══════════════════════════════ a second device, and a second visit ════ */

test('a second device with empty storage still never sees it again', async ({
  page,
  browser,
  signedIn,
}) => {
  await createWorkspace(page)
  await walkToResult(page)
  await page.getByRole('button', { name: /enter sahoda/i }).click()
  await page.waitForURL(/\/home/, { timeout: 60_000 })
  await pwExpect.poll(() => seenFlagOf(signedIn), { timeout: 20_000 }).toBe(true)

  /**
   * A SEPARATE CONTEXT IS A SEPARATE DEVICE.
   *
   * Its own cookie jar and its own localStorage — so this is exactly the case a
   * client-side flag cannot answer, and the reason the flag lives in
   * `users_profile.prefs`.
   */
  const context = await browser.newContext()
  const second = await context.newPage()
  const { setupClerkTestingToken } = await import('@clerk/testing/playwright')
  await setupClerkTestingToken({ page: second })

  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: signedIn.clerkUserId, expires_in_seconds: 600 }),
  })
  const { token } = (await res.json()) as { token: string }
  await second.goto(`/sign-in?__clerk_ticket=${token}`)
  /**
   * WAIT FOR /home, NOT MERELY FOR "NOT /sign-in".
   *
   * Clerk returns to `/`, and `/` is its own redirect to /home — so a wait that
   * only asks to have left /sign-in resolves on the intermediate hop and reads
   * the URL as "/". MEASURED: it did, and the failure said `Expected "/home",
   * Received "/"`, which looks like the landing rule misfiring and is the test
   * sampling one hop early.
   */
  await second.waitForURL(/\/home/, { timeout: 60_000 })

  // Signed in fresh, on a device that has never held a byte of this app's
  // storage: straight to the dashboard, and no film.
  expect(new URL(second.url()).pathname).toBe('/home')
  await pwExpect(second.getByText(/available credits/i)).toBeVisible({ timeout: 30_000 })
  await pwExpect(second.locator('[data-boot-video]')).toHaveCount(0)

  await second.goto('/onboarding')
  await pwExpect(second.getByRole('heading', { name: /your brand brain\s+is ready/i })).toBeVisible(
    { timeout: 60_000 },
  )
  expect(await flag(second, 'plays')).toBe('no')

  await context.close()
})

/* ══════════════════════════════════════════ every way it can fail ═════ */

test('a blocked video file lands on the dashboard, not a black screen', async ({
  page,
  signedIn,
}) => {
  // `signedIn` is requested even where its value is unused: Playwright only runs
  // a fixture a test ASKS for, so omitting it does not sign in — it leaves the
  // run on /sign-in, where the failure names a missing button and looks like a
  // product defect. This file lost three tests to it after the routing suite had
  // already been fixed for the same reason.
  void signedIn

  /**
   * THE ROUTE IS INSTALLED FIRST, AND THAT IS THE WHOLE TEST.
   *
   * MEASURED: with this line AFTER `walkToResult`, blocking the file took
   * 11,061ms to reach the dashboard — the film's own ten seconds. The element is
   * mounted at the result step with `preload="auto"`, so by the time the handler
   * existed the 2.7 MB was already fetched and cached, and the "blocked" run
   * played the video normally. The assertion was `< 15s`, so it PASSED while
   * exercising nothing at all.
   *
   * Installed here, the abort lands on the preload — which is also what actually
   * happens to a customer whose connection cannot fetch it.
   */
  await page.route('**/sahodaboot.mp4', (route) => route.abort('failed'))

  await createWorkspace(page)
  await walkToResult(page)

  const clickedAt = Date.now()
  await page.getByRole('button', { name: /enter sahoda/i }).click()
  await page.waitForURL(/\/home/, { timeout: 30_000 })
  const took = Date.now() - clickedAt
  // eslint-disable-next-line no-console
  console.log(`BLOCKED FILE → dashboard in ${took}ms`)

  /**
   * FAST, and the number matters. `error` has already fired on the preload by
   * the time Enter is pressed, so `start()` sees a dead element and finishes
   * without ever showing the overlay — nobody watches a black rectangle waiting
   * for a deadline to expire. What is left is the save and the navigation.
   *
   * Well under the film's ten seconds, which is what the old assertion could not
   * tell apart.
   */
  expect(took).toBeLessThan(8_000)
  await pwExpect(page.getByText(/available credits/i)).toBeVisible({ timeout: 30_000 })
  // No error, no blank screen — the dashboard, with the Brand Brain saved.
  await pwExpect(page.getByText(/something went wrong|could not/i)).toBeHidden()
  await shoot(page, 'boot-04-blocked-file-dashboard-1440-light')
})

test('a video that stalls lands on the dashboard after the timeout', async ({ page, signedIn }) => {
  // `signedIn` is requested even where its value is unused: Playwright only runs
  // a fixture a test ASKS for, so omitting it does not sign in — it leaves the
  // run on /sign-in, where the failure names a missing button and looks like a
  // product defect. This file lost three tests to it after the routing suite had
  // already been fixed for the same reason.
  void signedIn

  /**
   * THE REQUEST NEVER ANSWERS. Not an abort — an abort produces `error`, which
   * is a different watchdog. This is the connection that accepts the request and
   * then says nothing, which only the START DEADLINE can see.
   *
   * Installed BEFORE the walk for the same measured reason as the test above:
   * the element preloads at the result step, so a handler added afterwards finds
   * the file already in cache and the film plays as normal.
   */
  await page.route('**/sahodaboot.mp4', () => {
    /* deliberately never fulfilled */
  })

  await createWorkspace(page)
  await walkToResult(page)

  const clickedAt = Date.now()
  await page.getByRole('button', { name: /enter sahoda/i }).click()
  await page.waitForURL(/\/home/, { timeout: 30_000 })
  const took = Date.now() - clickedAt
  // eslint-disable-next-line no-console
  console.log(`STALLED → dashboard in ${took}ms`)

  // The deadline is 2.5s from the click. Allow for the save and the navigation,
  // but it must be nothing like the film's ten seconds.
  expect(took).toBeGreaterThan(2_000)
  expect(took).toBeLessThan(9_000)
  await pwExpect(page.getByText(/available credits/i)).toBeVisible({ timeout: 30_000 })
  await shoot(page, 'boot-05-stalled-dashboard-1440-light')
})

test('prefers-reduced-motion never mounts it at all', async ({ page, signedIn }) => {
  // `signedIn` is requested even where its value is unused: Playwright only runs
  // a fixture a test ASKS for, so omitting it does not sign in — it leaves the
  // run on /sign-in, where the failure names a missing button and looks like a
  // product defect. This file lost three tests to it after the routing suite had
  // already been fixed for the same reason.
  void signedIn

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await createWorkspace(page)
  await walkToResult(page)

  /**
   * AN ACCESSIBILITY SETTING, NOT A PREFERENCE TO WEIGH.
   *
   * A ten-second animation that cannot be stopped is the exact thing this
   * setting exists to prevent, so it is not shortened or muted — it does not
   * happen.
   */
  expect(await flag(page, 'plays')).toBe('no')
  await pwExpect(page.locator('[data-boot-video]')).toHaveCount(0)

  const clickedAt = Date.now()
  await page.getByRole('button', { name: /enter sahoda/i }).click()
  await page.waitForURL(/\/home/, { timeout: 30_000 })
  // eslint-disable-next-line no-console
  console.log(`REDUCED MOTION → dashboard in ${Date.now() - clickedAt}ms`)
  await pwExpect(page.getByText(/available credits/i)).toBeVisible({ timeout: 30_000 })
})
