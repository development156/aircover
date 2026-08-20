import { expect } from '@playwright/test'

import { test } from './fixtures/seeded-user'

/**
 * The entrance system, proved on a real page (docs/26 §8.1).
 *
 * ── WHY THIS IS AN E2E AND NOT A UNIT TEST ───────────────────────────────────
 * `.enter-step` is `animation: sl-enter … both` with `from { opacity: 0 }`, and
 * its delay is `calc(min(var(--i,0), var(--stagger-cap)) * var(--stagger))`.
 * If that calc fails to resolve, or the keyframe never loads, every staggered
 * region on the product sits at **opacity 0** — a blank dashboard that passes
 * typecheck, lint and all 3,202 unit tests, because jsdom does not run CSS
 * animation at all. The only thing that can catch it is a real engine.
 *
 * ── WHY IT BOOTSTRAPS A WORKSPACE FIRST ──────────────────────────────────────
 * The first version of this test did not, and failed with "element(s) not
 * found" — because with no workspace `/home` returns `<FirstRun />` and there
 * is no dashboard to stagger at all. That is docs/26 §11's standing warning
 * ("do not measure a responsive fix in the workspace-less state") and it is the
 * same shape as the 17px overflow that stayed green for a whole branch: a guard
 * aimed at the one account shape that never breaks. Bootstrapped through the
 * app's own button, the way six other specs already do it.
 *
 * ── AND WHY REDUCED MOTION IS HALF OF IT ─────────────────────────────────────
 * `tokens.css` zeroes `animation-duration` under `prefers-reduced-motion`, and
 * until this branch it did NOT zero `animation-delay`. With `fill: both` that
 * left a staggered row invisible for the whole length of its delay and then
 * snapped it in, so the person who asked for LESS motion got a slower, jumpier
 * screen than everyone else. Asserting "reduced motion still renders" is the
 * regression test for that.
 */

/** The app's own path to a workspace — no service-role shortcut. */
async function bootstrapWorkspace(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/home')
  await page
    .locator('#main')
    .getByRole('button', { name: /create workspace/i })
    .click()
  await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
}

test.describe('@smoke entrance', () => {
  // `signedIn` is REQUESTED, not just imported. Playwright only instantiates a
  // fixture a test actually destructures, so `async ({ page })` alone left the
  // browser sitting on the sign-in screen for the full 60s timeout — the page
  // snapshot in the failure said so, and nothing about the error mentioned auth.
  test('a staggered item carries its computed delay and is visible', async ({ page, signedIn }) => {
    void signedIn
    await bootstrapWorkspace(page)
    await page.goto('/home')

    const step = page.locator('.enter-step').first()
    await expect(step).toBeVisible()

    // The ladder resolves to real milliseconds, not to the literal calc string
    // and not to 0s-from-invalid.
    const delays = await page.$$eval('.enter-step', (nodes) =>
      nodes.slice(0, 5).map((n) => getComputedStyle(n).animationDelay),
    )
    expect(delays.length).toBeGreaterThan(0)
    for (const d of delays) expect(d).toMatch(/^\d+(\.\d+)?s$/)
    // --stagger is 40ms, so item i=3 is 0.12s. Reading the LADDER rather than
    // one value: if the calc collapsed, every item would report the same delay.
    expect(new Set(delays).size).toBeGreaterThan(1)

    // The thing the animation could silently hide: real content, opaque.
    const opacity = await step.evaluate((n) => getComputedStyle(n).opacity)
    expect(Number(opacity)).toBeGreaterThan(0.99)
  })

  test('prefers-reduced-motion leaves a still page, not a blank one', async ({
    page,
    signedIn,
  }) => {
    void signedIn
    await bootstrapWorkspace(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/home')

    // READ THE RENDERED TEXT, not a box: the queue's own heading, which lives
    // inside the first staggered region on the page.
    await expect(page.getByRole('heading', { name: 'Needs your attention' })).toBeVisible()

    const step = page.locator('.enter-step').first()
    const { delay, duration, opacity } = await step.evaluate((n) => {
      const s = getComputedStyle(n)
      return { delay: s.animationDelay, duration: s.animationDuration, opacity: s.opacity }
    })
    // Both zeroed. The delay is the half that used to survive.
    expect(Number.parseFloat(delay)).toBe(0)
    expect(Number.parseFloat(duration)).toBeLessThan(0.01)
    expect(Number(opacity)).toBeGreaterThan(0.99)
  })
})
