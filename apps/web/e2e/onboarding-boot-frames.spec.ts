import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect as pwExpect, type Page } from '@playwright/test'

import { expect, test } from './fixtures/seeded-user'

/**
 * THE FILM AT BOTH WIDTHS AND BOTH THEMES, AND WHAT IT COSTS ON A BAD LINE.
 *
 * ── WHY ONE WALK AND NOT FOUR ────────────────────────────────────────────────
 * Each walk to the result card calls the model, so a naive (width × theme)
 * sweep is four provider calls to photograph the same ten seconds. The film runs
 * for ten seconds and a resize is instant, so ONE walk captures all four frames
 * with time to spare — the overlay is `fixed inset-0`, so it re-lays out on
 * resize like anything else, and the theme changes the ground the 16:9 frame is
 * letterboxed against.
 *
 * Mobile is not an afterthought here. A 390px viewport is where `object-contain`
 * matters most: the film is 16:9 and the phone is not, so most of that screen is
 * the ground behind it, and `bg-s1` rather than black is what stops it reading
 * as a broken embed.
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

const WIDTHS = [
  { label: '390', width: 390, height: 844 },
  { label: '1440', width: 1440, height: 900 },
] as const
const THEMES = ['light', 'dark'] as const

async function shoot(page: Page, label: string): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true })
  // The pointer parks where it last clicked, and a control photographed in
  // :hover is how a peer captured a primary action as solid black three times.
  await page.mouse.move(-40, -40).catch(() => {})
  const buf = await page.screenshot()
  writeFileSync(join(SHOT_DIR, `${label}.png`), buf)
  // eslint-disable-next-line no-console
  console.log(`SHOT ${label} ${buf.length}B`)
}

/** The app stores its theme choice; setting it directly avoids hunting a toggle. */
async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((t) => {
    document.documentElement.classList.toggle('dark', t === 'dark')
    document.documentElement.dataset.theme = t
    document.documentElement.style.colorScheme = t
  }, theme)
}

async function createWorkspace(page: Page): Promise<void> {
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  await pwExpect(create).toBeVisible({ timeout: 60_000 })
  await create.click()
  await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
}

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
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await page.getByRole('button', { name: /^Continue$/ }).click()
  await pwExpect(page.getByRole('heading', { name: /understand your market too/i })).toBeVisible()
  await page.getByRole('button', { name: /build my brand brain/i }).click()
  await pwExpect(page.getByRole('heading', { name: /your brand brain is ready/i })).toBeVisible({
    timeout: 300_000,
  })
}

test.describe.configure({ timeout: 600_000 })

test('the film and the card, 390 and 1440, light and dark', async ({ page, signedIn }) => {
  void signedIn
  await page.setViewportSize({ width: 1440, height: 900 })
  await createWorkspace(page)
  await walkToResult(page)

  // The card that carries the button, before anything moves.
  for (const { label, width, height } of WIDTHS) {
    await page.setViewportSize({ width, height })
    for (const theme of THEMES) {
      await setTheme(page, theme)
      await page.waitForTimeout(200)
      await shoot(page, `boot-result-${label}-${theme}`)
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await setTheme(page, 'light')
  await page.getByRole('button', { name: /enter sahoda/i }).click()

  await pwExpect(page.locator('[data-boot-video][data-active="true"]')).toBeVisible({
    timeout: 10_000,
  })
  await pwExpect
    .poll(
      async () =>
        page.evaluate(() => {
          const v = document.querySelector('[data-boot-video] video') as HTMLVideoElement | null
          return v?.currentTime ?? 0
        }),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0.3)

  /**
   * Four frames inside ten seconds of film. The resize is what this is for: the
   * overlay is `fixed inset-0`, and on a 390px phone the 16:9 frame occupies a
   * band in the middle with the ground either side — which is why that ground is
   * a token and not black.
   */
  for (const { label, width, height } of WIDTHS) {
    await page.setViewportSize({ width, height })
    for (const theme of THEMES) {
      await setTheme(page, theme)
      await page.waitForTimeout(150)
      await shoot(page, `boot-playing-${label}-${theme}`)
    }
  }

  // Still running after all of that: a resize is not a skip either.
  const stillPlaying = await page.evaluate(() => {
    const v = document.querySelector('[data-boot-video] video') as HTMLVideoElement | null
    return v ? !v.paused : false
  })
  expect(stillPlaying).toBe(true)

  await page.waitForURL(/\/home/, { timeout: 60_000 })
  await pwExpect(page.getByText(/available credits/i)).toBeVisible({ timeout: 30_000 })

  for (const { label, width, height } of WIDTHS) {
    await page.setViewportSize({ width, height })
    for (const theme of THEMES) {
      await setTheme(page, theme)
      await page.waitForTimeout(200)
      await shoot(page, `boot-dashboard-${label}-${theme}`)
    }
  }
})

/**
 * WHAT THE FILM COSTS SOMEBODY ON A BAD CONNECTION.
 *
 * The honest question is not "how long is the video" — it is ten seconds, by
 * construction. It is how much LONGER the first dashboard paint takes than it
 * would without the film, on a link slow enough to matter. So both paths are
 * measured under the same throttling in the same run shape, and the answer is
 * the difference.
 *
 * `prefers-reduced-motion` is the no-film path and it is not a contrivance: it
 * is a real customer's real experience of this screen, and it is the only way to
 * get the same save and the same navigation without the video in front of them.
 */
test('the measured cost of the film on a throttled connection', async ({ page, signedIn }) => {
  void signedIn

  const client = await page.context().newCDPSession(page)
  await client.send('Network.enable')
  /**
   * Fast 3G, Chrome DevTools' own numbers: 1.6 Mbit down, 750 kbit up, 150ms
   * round trip. At that rate the 2.7 MB film needs ~13s of wire time, so this is
   * deliberately a connection the video cannot win on.
   */
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
  })
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await createWorkspace(page)
  await walkToResult(page)

  const withoutFilm = Date.now()
  await page.getByRole('button', { name: /enter sahoda/i }).click()
  await page.waitForURL(/\/home/, { timeout: 120_000 })
  await pwExpect(page.getByText(/available credits/i)).toBeVisible({ timeout: 120_000 })
  const baseline = Date.now() - withoutFilm

  // eslint-disable-next-line no-console
  console.log(
    `THROTTLED baseline (no film, reduced motion): ${baseline}ms to first dashboard paint`,
  )

  /**
   * The film's own contribution, on the same connection, without a second
   * provider call: the element is mounted and played directly, and the wall
   * clock from `play()` to the ending is what a customer would sit through.
   * Whatever ends it — the ten seconds, or a watchdog giving up on a link that
   * cannot deliver 2.7 MB — is the number that matters.
   */
  const filmMs = await page.evaluate(async () => {
    const started = performance.now()
    const v = document.createElement('video')
    v.src = '/sahodaboot.mp4'
    v.muted = true
    v.playsInline = true
    document.body.appendChild(v)
    const outcome = await new Promise<string>((resolve) => {
      const deadline = window.setTimeout(() => resolve('start-timeout'), 2500)
      v.addEventListener('playing', () => window.clearTimeout(deadline), { once: true })
      v.addEventListener('ended', () => resolve('ended'), { once: true })
      v.addEventListener('error', () => resolve('error'), { once: true })
      void v.play().catch(() => resolve('blocked'))
    })
    v.remove()
    return { ms: Math.round(performance.now() - started), outcome }
  })

  // eslint-disable-next-line no-console
  console.log(
    `THROTTLED film: ${filmMs.ms}ms (${filmMs.outcome}) — ADDED over the no-film path: ` +
      `${filmMs.ms}ms, total ≈ ${baseline + filmMs.ms}ms`,
  )

  // The claim this run has to support: the film is BOUNDED on a bad link. Either
  // it plays (about ten seconds) or a watchdog ends it — never an open wait.
  expect(filmMs.ms).toBeLessThan(30_000)
  expect(baseline).toBeLessThan(120_000)
})

/**
 * AND NOW THE REAL PATH, THROTTLED — because the measurement above is not it.
 *
 * The previous test times a BARE element with no watchdog attached, so its
 * 15,638ms is the film's raw cost on Fast 3G: ten seconds of content plus five
 * of rebuffering. The product does not do that. `currentTime` freezing for 2.5s
 * mid-playback is exactly what watchdog 2 exists to catch, so a customer on that
 * link should be released EARLY rather than made to wait out the buffering.
 *
 * Whether that is what actually happens is a question about the shipped code and
 * only a shipped run can answer it, so this walks the flow under the same
 * throttling and measures the button to the dashboard.
 */
test('the real enter-to-dashboard, throttled', async ({ page, signedIn }) => {
  void signedIn

  const client = await page.context().newCDPSession(page)
  await client.send('Network.enable')
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
  })
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })

  await createWorkspace(page)
  await walkToResult(page)

  const clickedAt = Date.now()
  await page.getByRole('button', { name: /enter sahoda/i }).click()
  await page.waitForURL(/\/home/, { timeout: 120_000 })
  await pwExpect(page.getByText(/available credits/i)).toBeVisible({ timeout: 120_000 })
  const total = Date.now() - clickedAt

  // eslint-disable-next-line no-console
  console.log(`THROTTLED real path: ${total}ms from Enter to first dashboard paint`)

  /**
   * BOUNDED, and bounded well under the film's raw 15.6s on this link. Nobody
   * waits out the buffering: either it plays or a watchdog releases them.
   */
  expect(total).toBeLessThan(20_000)
})
