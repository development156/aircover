import type { Page } from '@playwright/test'

import { expect, test } from './fixtures/seeded-user'
import { leaveOnboarding } from './fixtures/compose'
import { DETECTORS } from './helpers/ux-detect'
import { framesTaken, shot, useReducedMotion, useTheme } from './helpers/ux-shot'

/**
 * THE MOTION SYSTEM, PHOTOGRAPHED RATHER THAN ASSERTED.
 *
 * A motion audit that only reads CSS answers the wrong question. What matters is
 * what is ON THE SCREEN in the second before the data lands, because that second
 * is the whole of the experience on a bus.
 *
 * So this file throttles the network hard, then photographs each route at 150ms,
 * 400ms and 900ms. Three frames of the same route tell you at a glance whether
 * the app showed a shape, a spinner, the PREVIOUS page, or nothing at all.
 *
 * It also asks the two questions docs/26 §8.1 says are load-bearing and that no
 * screenshot can answer:
 *
 *  · under `prefers-reduced-motion`, is `animation-DELAY` zeroed as well as
 *    duration? A staggered row with `fill: both` and a live 320ms delay stays
 *    invisible and then snaps in, so the person who asked for LESS motion gets a
 *    slower, jumpier screen;
 *  · does anything animate a number that is not settled?
 */

const JOURNEY = 'motion'

const ROUTES = ['/home', '/posts', '/analytics', '/wallet', '/brain', '/inbox', '/campaigns']

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
    await leaveOnboarding(page)
  } catch {
    /* already bootstrapped */
  }
}

/**
 * Is there a skeleton on screen right now, and does it have the SHAPE of what it
 * replaces? A grey block that is 40px tall where a 220px card is coming is a
 * skeleton that guarantees a jolt.
 */
const SKELETONS = `
;(() => {
  const pulsing = Array.from(document.querySelectorAll('*')).filter((el) => {
    const s = getComputedStyle(el)
    if (s.animationName === 'none' || !s.animationName) return false
    const r = el.getBoundingClientRect()
    return r.width > 4 && r.height > 4
  })
  const spinners = Array.from(document.querySelectorAll('[class*="animate-spin"], [role="progressbar"], [aria-busy="true"]'))
    .filter((el) => el.getBoundingClientRect().width > 2)
  const text = (document.querySelector('main') || document.body).innerText.replace(/\\s+/g, ' ').trim()
  return {
    pulsing: pulsing.length,
    shapes: pulsing.slice(0, 12).map((el) => {
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height), anim: getComputedStyle(el).animationName, cls: String(el.className || '').slice(0, 50) }
    }),
    spinners: spinners.length,
    mainChars: text.length,
    mainHead: text.slice(0, 120),
  }
})()`

/** Does the reduced-motion block reach DELAY, or only DURATION? */
const DELAY_PROBE = `
;(() => {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;left:-9999px;animation-name:sl-enter;animation-duration:400ms;animation-delay:320ms;animation-fill-mode:both'
  document.body.appendChild(probe)
  const s = getComputedStyle(probe)
  const out = { duration: s.animationDuration, delay: s.animationDelay, transitionDelay: '', matches: window.matchMedia('(prefers-reduced-motion: reduce)').matches }
  const t = document.createElement('div')
  t.style.cssText = 'position:fixed;left:-9999px;transition-property:opacity;transition-duration:400ms;transition-delay:300ms'
  document.body.appendChild(t)
  out.transitionDelay = getComputedStyle(t).transitionDelay
  probe.remove(); t.remove()
  return out
})()`

test.describe('ux motion', () => {
  test('what is on screen at 150ms, 400ms and 900ms on a slow line', async ({ page, signedIn }) => {
    void signedIn
    test.setTimeout(420_000)
    await page.setViewportSize({ width: 1440, height: 900 })
    await useTheme(page, 'light')
    await bootstrap(page)

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 200,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

    for (const route of ROUTES) {
      const slug = route.slice(1).replace(/\//g, '-')
      const t0 = Date.now()
      // `commit` returns as soon as the navigation is committed, so the waits
      // below are measured from the moment the old page is gone.
      await page.goto(route, { waitUntil: 'commit' }).catch(() => {})
      for (const at of [150, 400, 900]) {
        const elapsed = Date.now() - t0
        if (elapsed < at) await page.waitForTimeout(at - elapsed)
        const skel = await page.evaluate(SKELETONS).catch(() => null)
        await shot(page, {
          journey: JOURNEY,
          stop: `${slug}-at-${at}ms`,
          width: 1440,
          theme: 'light',
          ms: Date.now() - t0,
          viewportOnly: true,
          note: JSON.stringify(skel).slice(0, 1200),
        })
      }
      await page.waitForLoadState('load').catch(() => {})
      await page.waitForTimeout(800)
      await shot(page, {
        journey: JOURNEY,
        stop: `${slug}-settled`,
        width: 1440,
        theme: 'light',
        ms: Date.now() - t0,
        note: JSON.stringify(await page.evaluate(DETECTORS.motion)).slice(0, 1500),
      })
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  })

  test('reduced motion zeroes the DELAY as well as the duration', async ({ page, signedIn }) => {
    void signedIn
    test.setTimeout(200_000)
    await page.setViewportSize({ width: 1440, height: 900 })
    await useTheme(page, 'light')
    await bootstrap(page)

    await page.goto('/home')
    await page.waitForTimeout(1200)
    const normal = await page.evaluate(DELAY_PROBE)

    await useReducedMotion(page, true)
    await page.goto('/home')
    await page.waitForTimeout(1200)
    const reduced = await page.evaluate(DELAY_PROBE)
    const motion = await page.evaluate(DETECTORS.motion)

    await shot(page, {
      journey: JOURNEY,
      stop: 'reduced-motion-probe',
      width: 1440,
      theme: 'light',
      note: JSON.stringify({ normal, reduced, motion }).slice(0, 1800),
    })
    console.log('[ux motion] normal  ', JSON.stringify(normal))
    console.log('[ux motion] reduced ', JSON.stringify(reduced))
  })
})
