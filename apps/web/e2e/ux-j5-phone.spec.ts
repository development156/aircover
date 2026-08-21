import type { Page } from '@playwright/test'

import { expect, test } from './fixtures/seeded-user'
import { DETECTORS } from './helpers/ux-detect'
import {
  framesTaken,
  shot,
  timedGoto,
  useReducedMotion,
  useTheme,
  type Theme,
} from './helpers/ux-shot'

/**
 * JOURNEY 5 — THE PHONE USER, on a bus.
 *
 * Journeys 1 to 4 already run at 390, so this file does NOT repeat them. What it
 * covers is the part of a phone that only exists on a phone:
 *
 *  · the bottom bar, which is the ENTIRE navigation below 700px — the rail is
 *    `max-narrow:hidden`, so anything reachable only from the rail is
 *    unreachable on a phone, and no desktop frame can show that;
 *  · what the rail's destinations become when the rail is gone;
 *  · the on-screen keyboard, emulated as a viewport that loses half its height
 *    while a field has focus — the classic way a sticky commit bar ends up
 *    underneath the keyboard or on top of the text;
 *  · a slow connection, because these users are not on office wifi;
 *  · landscape, because a phone turns.
 *
 * Mobile is not secondary here. It is the primary device of an Indian SMB owner.
 */

const JOURNEY = 'j5-phone'
const PHONE = { width: 390, height: 844 }

/**
 * EVERY test in this file must capture something.
 *
 * These specs assert almost nothing on purpose — their product is frames, and a
 * dead end is a finding rather than a failure. That trade has one hole in it: a
 * run whose sign-in silently parked on /sign-in, or whose selectors all missed,
 * writes zero PNGs and reports green. This closes it in one place rather than
 * thirteen, and it is the difference between "nothing broke" and "nothing ran".
 */
let framesAtStart = 0
test.beforeEach(() => {
  framesAtStart = framesTaken()
})
test.afterEach(() => {
  expect(framesTaken()).toBeGreaterThan(framesAtStart)
})

async function bootstrap(page: Page): Promise<void> {
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  try {
    await create.waitFor({ state: 'visible', timeout: 10_000 })
    await create.click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
  } catch {
    /* already bootstrapped */
  }
}

/** What the bottom bar actually offers, by accessible name and by destination. */
const BOTTOM_NAV = `
;(() => {
  const bars = Array.from(document.querySelectorAll('nav, [role="navigation"]'))
    .filter((n) => {
      const s = getComputedStyle(n)
      const r = n.getBoundingClientRect()
      return s.position === 'fixed' && r.bottom > window.innerHeight - 120 && r.width > 0
    })
  const items = []
  for (const bar of bars) {
    for (const el of bar.querySelectorAll('a[href], button, [role="button"]')) {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      items.push({
        name: (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30),
        href: el.getAttribute('href') || '',
        w: Math.round(r.width),
        h: Math.round(r.height),
      })
    }
  }
  /* Everything reachable from the RAIL, which is display-none'd on a phone. */
  const railLinks = Array.from(document.querySelectorAll('a[href^="/"]'))
    .map((a) => a.getAttribute('href'))
  return { bars: bars.length, items, allLinks: Array.from(new Set(railLinks)).slice(0, 60) }
})()`

test.describe('ux j5 phone', () => {
  for (const theme of ['light', 'dark'] as Theme[]) {
    test(`the bottom bar is the whole navigation ${theme}`, async ({ page, signedIn }) => {
      void signedIn
      test.setTimeout(240_000)
      await page.setViewportSize(PHONE)
      await useTheme(page, theme)
      await bootstrap(page)

      await timedGoto(page, '/home')
      const nav = await page.evaluate(BOTTOM_NAV)
      await shot(page, {
        journey: JOURNEY,
        stop: 'P1-bottom-nav',
        width: 390,
        theme,
        note: JSON.stringify(nav).slice(0, 1800),
      })

      // Walk the bar. A tab that goes nowhere, or lands on a screen that then
      // offers no way back, is the phone's version of a dead end.
      const bar = page.locator('nav').last()
      const count = await bar.locator('a[href], button').count()
      for (let i = 0; i < Math.min(count, 6); i++) {
        const item = bar.locator('a[href], button').nth(i)
        const label = ((await item.getAttribute('aria-label')) ?? (await item.textContent()) ?? '')
          .replace(/\s+/g, ' ')
          .trim()
        await item.click().catch(() => {})
        await page.waitForTimeout(1800)
        await shot(page, {
          journey: JOURNEY,
          stop: `P2-tab-${i}-${label.slice(0, 18) || 'unnamed'}`,
          width: 390,
          theme,
        })
      }
    })
  }

  test('the keyboard is up and the commit bar is somewhere', async ({ page, signedIn }) => {
    void signedIn
    test.setTimeout(240_000)
    await page.setViewportSize(PHONE)
    await useTheme(page, 'light')
    await bootstrap(page)

    await timedGoto(page, '/posts/new')
    const tile = page.locator('[data-channel-tile="instagram"]')
    await tile.click().catch(() => {})
    await page.waitForTimeout(2500)
    await shot(page, { journey: JOURNEY, stop: 'P3-composer-phone', width: 390, theme: 'light' })

    const body = page.getByLabel('Your post')
    if (await body.isVisible().catch(() => false)) {
      await body.click()
      await body.type('Saturday cupping is open again.', { delay: 12 })
      // An on-screen keyboard takes roughly half the height of a 390x844 phone.
      // The visual viewport shrinks; the layout viewport often does not, which is
      // exactly how a `fixed bottom-0` bar ends up under the keyboard.
      await page.setViewportSize({ width: 390, height: 420 })
      await page.waitForTimeout(1200)
      await shot(page, {
        journey: JOURNEY,
        stop: 'P4-keyboard-up',
        width: 390,
        theme: 'light',
        viewportOnly: true,
      })
      await page.setViewportSize(PHONE)
      await page.waitForTimeout(600)
    }
  })

  test('landscape, because a phone turns', async ({ page, signedIn }) => {
    void signedIn
    test.setTimeout(200_000)
    await page.setViewportSize({ width: 844, height: 390 })
    await useTheme(page, 'light')
    await bootstrap(page)
    for (const route of ['/home', '/posts', '/inbox', '/wallet']) {
      const ms = await timedGoto(page, route)
      await shot(page, {
        journey: JOURNEY,
        stop: `P5-landscape-${route.slice(1).replace(/\//g, '-')}`,
        width: 844,
        theme: 'light',
        ms,
      })
    }
  })

  test('a slow connection, which is the normal one', async ({ page, signedIn }) => {
    void signedIn
    test.setTimeout(300_000)
    await page.setViewportSize(PHONE)
    await useTheme(page, 'light')
    await bootstrap(page)

    // Regular 4G on a bus, applied through CDP because Playwright has no
    // first-class throttling. 1.6 Mbit down, 750 Kbit up, 150ms RTT.
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

    for (const route of ['/home', '/posts', '/analytics', '/inbox', '/brain']) {
      const t0 = Date.now()
      await page.goto(route, { waitUntil: 'commit' }).catch(() => {})
      // Photograph the screen 700ms in. Whatever is on it at that moment is what
      // a person on a bus actually sees, and "nothing at all" is the finding.
      await page.waitForTimeout(700)
      await shot(page, {
        journey: JOURNEY,
        stop: `P6-slow-700ms-${route.slice(1).replace(/\//g, '-')}`,
        width: 390,
        theme: 'light',
        viewportOnly: true,
      })
      await page.waitForLoadState('load').catch(() => {})
      await page.waitForTimeout(600)
      await shot(page, {
        journey: JOURNEY,
        stop: `P7-slow-settled-${route.slice(1).replace(/\//g, '-')}`,
        width: 390,
        theme: 'light',
        ms: Date.now() - t0,
      })
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  })

  test('reduced motion is still and fast, never broken', async ({ page, signedIn }) => {
    void signedIn
    test.setTimeout(240_000)
    await page.setViewportSize(PHONE)
    await useTheme(page, 'light')
    await useReducedMotion(page, true)
    await bootstrap(page)

    for (const route of ['/home', '/posts', '/brain', '/wallet']) {
      await timedGoto(page, route)
      const motion = await page.evaluate(DETECTORS.motion)
      await shot(page, {
        journey: JOURNEY,
        stop: `P8-reduced-${route.slice(1).replace(/\//g, '-')}`,
        width: 390,
        theme: 'light',
        note: JSON.stringify(motion).slice(0, 1600),
      })
    }
  })
})
