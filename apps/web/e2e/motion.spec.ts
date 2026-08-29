import { expect } from '@playwright/test'

import { test } from './fixtures/seeded-user'
import { leaveOnboarding, dismissPlanOffer } from './fixtures/compose'

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
  await leaveOnboarding(page)
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
    await dismissPlanOffer(page)

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
    await dismissPlanOffer(page)

    /**
     * READ THE RENDERED TEXT, not a box — that is the claim, and it is why this
     * assertion exists at all: `fill: both` with a surviving delay leaves a
     * staggered region present, sized and completely empty.
     *
     * It used to name the queue's own heading, "Needs your attention". That
     * heading is the DASHBOARD's, and on 2026-08-23 /home gained a third state
     * (`lib/home/started.ts`) where a workspace with nothing in it gets a setup
     * screen instead — so a spec that bootstraps a workspace and stops no longer
     * lands on the dashboard, and this test went red naming a heading that was
     * correctly absent. The header above already records the SAME correction one
     * state earlier, for `FirstRun`.
     *
     * The fix is not a different heading. It is the property the assertion was
     * always making: the first staggered region has real, visible text in it,
     * whichever state the page is in. That is strictly stronger than a string,
     * and it does not have to be revisited the next time /home grows a state.
     */
    const firstRegionText = await page.locator('.enter-step').first().innerText()
    expect(firstRegionText.trim().length).toBeGreaterThan(0)

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
 * Alpha of a colour the ENGINE resolved — never of a raw token string.
 *
 * `getPropertyValue('--scrim')` hands back the token AFTER the minifier has
 * had it: `next build` rewrites `rgb(0 0 0 / 0.4)` to `#0006` (dark's 0.62 to
 * `#0000009e`). MEASURED both through lightningcss 1.32.0 and in Chromium.
 * The first version of this helper was
 * `Number(c.match(/[\d.]+\s*\)$/)?.[0].replace(')','') ?? '1')`, which needs a
 * closing paren — so a hex fell to `?? '1'` and "could not read this colour"
 * became "the alpha is 1", failing the test against a backdrop that was
 * correct at 0.4. In the other direction it read `rgb(0, 0, 0)` as 0, having
 * captured the blue channel: opaque reported as fully transparent.
 *
 * The fix is not a better regex. The token is resolved through a probe element
 * (the idiom already in `connections-honesty.spec.ts`), so the browser — the
 * only thing that has to agree with the browser — normalises the hex and rgb()
 * forms the minifier can produce, and this stops depending on whether the CSS
 * was minified. MEASURED, so the comment does not overclaim: Chromium keeps
 * `oklch()` and `color-mix()` in computed style rather than converting them, so
 * authoring `--scrim` in either would reach the end of this function and THROW.
 * That is the designed behaviour, not an oversight — a measurement helper that
 * returns a plausible number when it failed to measure is worse than one with
 * no fallback at all.
 */
function alphaOf(color: string): number {
  const args = /^rgba?\(([^)]+)\)$/i.exec(color.trim())?.[1]
  if (args !== undefined) {
    const [r, g, b, a] = args.split(/[\s,/]+/).filter(Boolean)
    if (r !== undefined && g !== undefined && b !== undefined) {
      if (a === undefined) return 1
      const n = a.endsWith('%') ? Number.parseFloat(a) / 100 : Number.parseFloat(a)
      if (Number.isFinite(n)) return n
    }
  }
  throw new Error(`alphaOf: not a resolved rgb()/rgba() colour: ${JSON.stringify(color)}`)
}

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

    const { backdrop, token, rawToken } = await page.evaluate(() => {
      const dialog = document.querySelector('dialog[open]')
      if (!dialog) return { backdrop: '', token: '', rawToken: '' }
      // The token AS AUTHORED is `#0006` in a production build and
      // `rgb(0 0 0 / 0.4)` in dev — two strings for one colour, and neither is
      // something a test should have to parse. Hand it to the engine and read
      // back what the engine computes, which is always rgb()/rgba().
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--scrim').trim()
      const probe = document.createElement('span')
      probe.style.backgroundColor = raw
      document.body.append(probe)
      const token = getComputedStyle(probe).backgroundColor
      probe.remove()
      return {
        // ::backdrop is not an element — it is read through the dialog.
        backdrop: getComputedStyle(dialog, '::backdrop').backgroundColor,
        token,
        rawToken: raw,
      }
    })

    expect(backdrop).not.toBe('')
    expect(rawToken, '--scrim is not defined on :root').not.toBe('')
    // Compare by ALPHA, not by string.
    expect(alphaOf(backdrop)).toBeCloseTo(alphaOf(token), 2)
    // A token that reads as fully opaque or fully transparent is a parse
    // failure wearing a number — the exact shape of the bug this replaced.
    expect(alphaOf(token)).toBeGreaterThan(0.15)
    expect(alphaOf(token)).toBeLessThan(1)
    // And explicitly not the browser default the original bug produced (0.1).
    expect(alphaOf(backdrop)).toBeGreaterThan(0.15)
  })
})
