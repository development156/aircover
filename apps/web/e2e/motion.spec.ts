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

/**
 * The scrim, on rendered pixels.
 *
 * Both overlay primitives asked for `backdrop:bg-black/40`. `globals.css` opens
 * @theme with `--color-*: initial`, wiping the stock palette, and redefines only
 * `--color-white` — so `bg-black` was a class Tailwind never generated.
 *
 * ── WHAT THAT ACTUALLY LOOKED LIKE, MEASURED ─────────────────────────────────
 * NOT an undimmed page. Chromium's UA stylesheet paints `dialog::backdrop` at
 * `rgba(0, 0, 0, 0.1)` for a modal dialog, so every overlay in the product got
 * the browser's default 10% wash where the design called for 40% — a 4x
 * difference in dimming, and a value nobody chose.
 *
 * ── THE FIRST VERSION OF THIS TEST WAS HOLLOW ────────────────────────────────
 * It asserted the backdrop was "not transparent", which the UA default already
 * satisfies. Reverting the fix left it GREEN. It is the exact failure this
 * repo keeps writing down — a test that passes for a reason unrelated to the
 * thing it names — and only a mutation caught it.
 *
 * So it asserts the composited value EQUALS the token. Measured both ways:
 *   fixed   rgba(0, 0, 0, 0.4)   the --scrim value
 *   broken  rgba(0, 0, 0, 0.1)   the browser's default
 */
test.describe('@smoke scrim', () => {
  test('an open dialog dims the page by the token, not by the browser default', async ({
    page,
    signedIn,
  }) => {
    void signedIn
    await page.goto('/design-system')
    await page.getByRole('button', { name: 'Open modal' }).click()

    const { backdrop, token } = await page.evaluate(() => {
      const dialog = document.querySelector('dialog[open]')
      if (!dialog) return { backdrop: '', token: '' }
      return {
        // ::backdrop is not an element — it is read through the dialog.
        backdrop: getComputedStyle(dialog, '::backdrop').backgroundColor,
        token: getComputedStyle(document.documentElement).getPropertyValue('--scrim').trim(),
      }
    })

    expect(backdrop).not.toBe('')
    // Compare by ALPHA rather than by string: the token is authored
    // `rgb(0 0 0 / .4)` and composites as `rgba(0, 0, 0, 0.4)`, so a literal
    // match would fail on formatting rather than on the thing being tested.
    //
    // ── AND IT READS BOTH FORMS THE TOKEN CAN TAKE, WHICH IT DID NOT ────────
    // MEASURED 2026-08-22: this parsed only `rgb(… / .4)`, so it silently
    // depended on the BUILD MODE. Against `next dev` the stylesheet is
    // unminified and `--scrim` reads `rgb(0 0 0 / 0.4)`; against `next start`
    // the minifier writes `#0006`, the regex misses, the fallback returns 1, and
    // the test compares a CORRECT backdrop of 0.4 against 1 and fails.
    //
    // A green run therefore meant "the scrim is right AND nobody ran this
    // against a production build" — two claims wearing one result, and the
    // second is the one the config's own comment recommends for reliability.
    const alphaOf = (c: string) => {
      const hex = /^#([0-9a-f]{4}|[0-9a-f]{8})$/i.exec(c.trim())
      if (hex) {
        const digits = hex[1]!
        return digits.length === 4
          ? parseInt(digits[3]!, 16) / 15
          : parseInt(digits.slice(6), 16) / 255
      }
      return Number(c.match(/[\d.]+\s*\)$/)?.[0].replace(')', '') ?? '1')
    }
    expect(alphaOf(backdrop)).toBeCloseTo(alphaOf(token), 2)
    // And explicitly not the browser default the bug produced.
    expect(alphaOf(backdrop)).toBeGreaterThan(0.15)
  })
})
