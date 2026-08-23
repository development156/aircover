import type { Page } from '@playwright/test'

import { expect, test } from './fixtures/seeded-user'

/**
 * THE REFUSAL ON THE FIRST SCREEN A CUSTOMER MEETS HAS TO BE READABLE.
 *
 * ── THE DEFECT, MEASURED ON REAL PIXELS ──────────────────────────────────────
 * `onboarding.css` disabled its primary with `opacity: 0.34` over an
 * `!important` orange fill. Composited exactly as the eye sees it — fill
 * `rgb(255,102,0)`, label `rgb(0,0,0)`, effective alpha 0.34, over
 * `rgb(242,242,243)` light and `rgb(13,13,13)` dark — the label measured
 * **1.65:1 in light and 1.75:1 in dark**.
 *
 * That is the same class of defect `docs/34` fix #2 called CRITICAL and fixed in
 * `button.tsx` at 1.37:1. It survived here for a structural reason worth naming:
 * **these screens do not use the Button primitive.** They ship their own `.btn`
 * classes, so a fix in the component could never have reached them, and no
 * amount of care in `button.tsx` would ever have found it.
 *
 * ── WHY THIS IS A RENDERED GUARD AND NOT A TOKEN TEST ────────────────────────
 * `docs/37` §19: "guards that grade TOKENS cannot see what COMPONENTS write" —
 * `--pfg` was correct for weeks while three components wrote `text-white` on a
 * brand fill. Every token involved here was correct the whole time. The defect
 * was an `opacity` on the element, which does not exist until something is
 * rasterised, so it is measured in a browser or it is not measured.
 *
 * Deliberately NOT @smoke: it mints a Clerk user and walks two screens.
 */

test.describe.configure({ timeout: 600_000 })

/** WCAG AA for body text. A refusal is text a person has to read. */
const AA = 4.5

function channel(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function luminance([r, g, b]: readonly number[]): number {
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!)
}

function contrast(a: readonly number[], b: readonly number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const parse = (css: string): number[] => {
  const m = css.match(/-?[\d.]+/g)
  if (!m || m.length < 3) throw new Error(`unparseable colour: ${css}`)
  return [Number(m[0]), Number(m[1]), Number(m[2])]
}

/** Fold a colour over a ground at an alpha — what the eye actually receives. */
const over = (fg: readonly number[], bg: readonly number[], a: number): number[] =>
  fg.map((c, i) => a * c + (1 - a) * bg[i]!)

async function bootstrap(page: Page): Promise<void> {
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  await create.waitFor({ state: 'visible', timeout: 60_000 })
  await create.click()
  await page.waitForURL(/\/onboarding/, { timeout: 90_000 })
}

/**
 * Three widths, because a downscaled contact sheet cannot settle a colour and
 * the 390 thumbnails genuinely looked like they might still be orange. The
 * question is answered by measuring, at the width the reader actually holds.
 */
for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1024, 1440] as const) {
    test(`the disabled Continue is legible in ${theme} at ${width}`, async ({ page, signedIn }) => {
      void signedIn
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme: theme })
      await page.addInitScript((t) => {
        try {
          window.localStorage.setItem('sahoda-theme', t as string)
        } catch {
          /* storage disabled: the emulated scheme is then the only signal */
        }
      }, theme)

      await bootstrap(page)
      await page.goto('/onboarding')
      await page.evaluate(() => {
        for (const k of Object.keys(window.localStorage)) {
          if (k.startsWith('sahoda.brandbrain')) window.localStorage.removeItem(k)
        }
      })
      await page.reload()
      await page.getByRole('button', { name: /build my brand brain/i }).click()

      const button = page.getByRole('button', { name: /^Continue$/ })
      // The state under examination. If this stops being disabled the gate for
      // step 01 has gone, which is a different and larger defect — so it is
      // asserted rather than skipped past.
      await expect(button).toBeDisabled()

      const read = await button.evaluate((el) => {
        /**
         * EFFECTIVE alpha, not the element's own. `opacity` multiplies down the
         * tree, and the defect this guard exists for was an opacity ON THE
         * BUTTON — a reader of `getComputedStyle(el).opacity` alone would miss
         * the same defect applied to a wrapper.
         */
        let alpha = 1
        let node: Element | null = el
        while (node) {
          alpha *= Number(getComputedStyle(node).opacity)
          node = node.parentElement
        }
        let behind = 'rgb(255, 255, 255)'
        let p: Element | null = el.parentElement
        while (p) {
          const c = getComputedStyle(p).backgroundColor
          if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) {
            behind = c
            break
          }
          p = p.parentElement
        }
        const cs = getComputedStyle(el)
        return { fill: cs.backgroundColor, text: cs.color, alpha, behind }
      })

      const ground = parse(read.behind)
      const fill = over(parse(read.fill), ground, read.alpha)
      const label = over(parse(read.text), ground, read.alpha)
      const ratio = contrast(label, fill)

      expect(
        ratio,
        `the disabled Continue's label measures ${ratio.toFixed(2)}:1 against its own fill in ` +
          `${theme} (label ${read.text}, fill ${read.fill}, effective alpha ${read.alpha}, ` +
          `ground ${read.behind}). A refusal a person cannot read does not tell them why ` +
          `they cannot continue. button.tsx settled this recipe already: a recessed ` +
          `surface with muted text, not a dimmed brand fill.`,
      ).toBeGreaterThanOrEqual(AA)
    })
  }
}
