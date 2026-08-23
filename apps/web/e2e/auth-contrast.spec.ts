import { expect, test } from '@playwright/test'

/**
 * THE FIRST SCREEN A CUSTOMER MEETS, MEASURED WHERE IT IS RASTERISED.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────────
 * MEASURED on the shipped /sign-in at 1440 light, 2026-08-23, by sampling the
 * rendered pixels of Clerk's primary button: `#ffffff` on `rgb(255,107,8)` is
 * **2.85:1**. docs/37 §2.4 names that exact pair as a never — it fails AA and
 * fails the 3:1 UI-boundary floor — and it was on the ONE action of the ONE
 * screen every customer passes through.
 *
 * ── WHY THE EXISTING GUARD COULD NOT SEE IT ──────────────────────────────────
 * `ink-on-brand` scans 927 source files for `text-white` beside a brand fill.
 * That pair does not appear in this repository's source at all: Clerk derives a
 * foreground from `colorPrimary` at RUNTIME and picked white. A grep over source
 * cannot see a colour that only exists after a third-party component renders.
 *
 * So this measures the composited result in a real browser, which is the only
 * place the pair exists — the same reason half of docs/37 §19's table is
 * rendered rather than static.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * 1. HOVER and FOCUS states. It samples the resting button only; a hover recipe
 *    that inverts badly would pass here. (`buttonVariants` covers ours; Clerk's
 *    is pinned in `clerk-appearance.ts` but not measured.)
 * 2. Any Clerk screen this file does not visit — the verification-code step, the
 *    reset-password flow, the user button's menu. Those are behind an email
 *    round trip this suite deliberately does not drive.
 * 3. It reads `getComputedStyle`, not the raster, so a gradient or an image
 *    background would be reported as its computed `background-color`. The pinned
 *    `backgroundImage: 'none'` is what makes that safe, and the assertion below
 *    checks that pin directly rather than assuming it.
 */

const AA_LARGE_AND_UI_FLOOR = 3

function channel(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function parse(css: string): [number, number, number] {
  const m = /rgba?\(([^)]+)\)/.exec(css)
  if (!m) throw new Error(`not a colour: ${css}`)
  const parts = m[1]!.split(',').map((n) => parseFloat(n))
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) {
    // Refuse to report a ratio computed from something we did not parse. A
    // guard that answers on a colour it could not read is worse than none.
    throw new Error(`could not parse a colour from: ${css}`)
  }
  return [parts[0]!, parts[1]!, parts[2]!]
}

for (const theme of ['light', 'dark'] as const) {
  for (const route of ['/sign-in', '/sign-up'] as const) {
    test(`${route} · the primary action clears the UI floor · ${theme} @smoke`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.addInitScript((t) => {
        try {
          window.localStorage.setItem('sahoda-theme', t as string)
        } catch {
          /* storage disabled: the emulated scheme is then the only signal */
        }
      }, theme)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(route)
      await page.waitForLoadState('load')

      // Clerk's own class, because there is no app-authored selector to use —
      // this button is entirely Clerk's markup. If Clerk renames it this test
      // FAILS on the locator rather than passing on an empty match, which is
      // the behaviour a guard needs.
      const button = page.locator('.cl-formButtonPrimary').first()
      await expect(button).toBeVisible({ timeout: 20_000 })

      const read = await button.evaluate((el) => {
        const cs = getComputedStyle(el)
        return {
          color: cs.color,
          background: cs.backgroundColor,
          backgroundImage: cs.backgroundImage,
        }
      })

      // A gradient would make the ratio vary along the label, so a single
      // reading of `background-color` would be a number that is true at one
      // x-coordinate. Assert the pin rather than assume it.
      expect(read.backgroundImage, `${route} ${theme}: a gradient under the label`).toBe('none')

      const ratio = contrast(parse(read.color), parse(read.background))
      expect(
        ratio,
        `${route} ${theme}: ${read.color} on ${read.background} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_LARGE_AND_UI_FLOOR)
    })
  }
}
