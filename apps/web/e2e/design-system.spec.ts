import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

/**
 * The design-system gallery, shot in colour and in greyscale.
 *
 * ── WHY GREYSCALE IS A TEST AND NOT A SCREENSHOT ─────────────────────────────
 * The palette is one orange with no red and no green, so every state has to
 * carry its meaning structurally. That claim is easy to make and easy to get
 * wrong: `.is-committed` is a 6% orange wash with a 40% orange ring, and with
 * hue removed the wash is roughly 2% off the surface — the RING is what
 * survives, not the tint. This asserts that each rung still resolves to a
 * DIFFERENT set of computed pixels once colour is gone.
 *
 * No sign-in: /design-system is a public route because it reads nothing.
 */

const OUT = 'design-system-proof'

test.describe('design system gallery @smoke', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`renders and survives greyscale — ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => {
        try {
          window.localStorage.setItem('sahoda-theme', t as string)
        } catch {
          /* best effort */
        }
      }, theme)

      await page.setViewportSize({ width: 1280, height: 1000 })
      await page.goto('/design-system')
      await expect(page.getByRole('heading', { name: 'Design system', level: 1 })).toBeVisible()

      mkdirSync(OUT, { recursive: true })
      await page.screenshot({ path: `${OUT}/${theme}-colour.png`, fullPage: true })

      // ── The four rungs must be distinguishable with hue removed.
      //
      // Measured as GREYSCALE LUMINANCE of the composited fill, not as a colour
      // string: `is-real` and `is-committed` both carry a solid 1px edge and no
      // texture, so FILL WEIGHT is the only thing separating them, and a test
      // that compared `rgb()` strings would pass on hue — the one channel that
      // is not allowed to be load-bearing here.
      const rungs = ['is-real', 'is-committed', 'is-proposed', 'is-simulated']
      const signatures = await page.evaluate((classes) => {
        const lum = (r: number, g: number, b: number) => {
          const f = (v: number) => {
            const s = v / 255
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
          }
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
        }
        const parse = (c: string): [number, number, number, number] => {
          const n = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]
          return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1]
        }
        return classes.map((cls) => {
          const el = document.querySelector(`.${cls}`)
          if (!el) return { cls, error: 'MISSING' }
          const cs = getComputedStyle(el)
          // Composite the (possibly translucent) fill over the page surface, so
          // a 6% wash is measured as what the eye actually receives.
          const page_ = parse(getComputedStyle(document.body).backgroundColor)
          const [r, g, b, a] = parse(cs.backgroundColor)
          const over = (c: number, p: number) => c * a + p * (1 - a)
          return {
            cls,
            fill: Math.round(lum(over(r, page_[0]), over(g, page_[1]), over(b, page_[2])) * 1000),
            edge: `${cs.borderTopStyle}/${cs.borderTopWidth}`,
            texture: cs.backgroundImage === 'none' ? 'none' : 'hatch',
          }
        })
      }, rungs)

      console.log(`\n──── CERTAINTY RUNGS · ${theme} (greyscale luminance /1000) ────`)
      signatures.forEach((s) =>
        console.log(
          `  ${String(s.cls).padEnd(14)} fill=${s.fill} edge=${s.edge} texture=${s.texture}`,
        ),
      )
      for (const s of signatures) expect(s.error, `${s.cls} is not on the page`).toBeUndefined()

      // Every rung differs from every other in at least one STRUCTURAL channel.
      const perceived = signatures.map((s) => `${s.fill}|${s.edge}|${s.texture}`)
      expect(
        new Set(perceived).size,
        `two rungs are perceptually identical: ${perceived.join(' , ')}`,
      ).toBe(rungs.length)

      // And the two that rely on fill weight alone must be far apart in
      // lightness, not merely unequal by a rounding digit.
      const real = signatures.find((s) => s.cls === 'is-real')!
      const committed = signatures.find((s) => s.cls === 'is-committed')!
      expect(
        Math.abs((real.fill ?? 0) - (committed.fill ?? 0)),
        'is-real and is-committed share an edge and a texture, so their fills must differ decisively',
      ).toBeGreaterThan(100)

      // ── Now remove the colour for real and shoot the proof.
      await page.getByTestId('greyscale-toggle').click()
      await expect(page.locator('html')).toHaveClass(/ds-greyscale/)
      await page.screenshot({ path: `${OUT}/${theme}-greyscale.png`, fullPage: true })

      // ── The absence marks must differ from each other structurally, since in
      //    greyscale they are the only thing standing in for a missing number.
      const marks = await page.evaluate(() => {
        const read = (cls: string) => {
          const el = document.querySelector(`.${cls}`)
          if (!el) return `${cls}: MISSING`
          const cs = getComputedStyle(el)
          return `${cls} bg=${cs.backgroundColor} image=${cs.backgroundImage === 'none' ? 'none' : 'broken-rule'}`
        }
        return [read('is-unmeasured'), read('is-unreadable')]
      })
      console.log(`──── ABSENCE MARKS · ${theme} ────`)
      marks.forEach((m) => console.log('  ' + m))
      expect(marks[0]).not.toContain('MISSING')
      expect(marks[1]).not.toContain('MISSING')
      expect(marks[0], '"not measured" and "unreadable" must not render the same mark').not.toBe(
        marks[1],
      )
    })
  }

  /**
   * The headline colour fix, asserted on RENDERED pixels rather than on the
   * token file. `--pfg` flipped from white to ink because white-on-orange
   * measures 2.94:1 — below AA, and below even the 3:1 floor for a UI boundary.
   * A token file can say anything; this reads what the browser painted.
   */
  test('text on a brand fill is ink, and clears AA', async ({ page }) => {
    await page.goto('/design-system')
    const measured = await page.evaluate(() => {
      // The PRIMARY BUTTON, not just the certainty chip. `text-primary-foreground`
      // is the class every filled action in the app uses, so this is the one
      // that proves the fix reached real controls.
      const el = [...document.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Create post',
      )!
      const cs = getComputedStyle(el)
      const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number)
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => {
          const s = (v ?? 0) / 255
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!)
      }
      const a = lum(parse(cs.color))
      const b = lum(parse(cs.backgroundColor))
      const [hi, lo] = a > b ? [a, b] : [b, a]
      return { color: cs.color, bg: cs.backgroundColor, ratio: (hi + 0.05) / (lo + 0.05) }
    })
    console.log(
      `\n[brand fill] ${measured.color} on ${measured.bg} = ${measured.ratio.toFixed(2)}:1`,
    )
    expect(measured.color, 'text on a brand fill must be ink, not white').toBe('rgb(0, 0, 0)')
    expect(measured.ratio, 'a brand fill must clear AA body text').toBeGreaterThanOrEqual(4.5)
  })

  /**
   * Coming-soon must never be a disabled button — a disabled button is still
   * announced as a button, offering an action that does not exist.
   */
  test('coming-soon is not a button', async ({ page }) => {
    await page.goto('/design-system')
    const comingSoon = page.getByTestId('coming-soon-chip')
    await expect(comingSoon).toBeVisible()
    const tag = await comingSoon.evaluate((el) => el.tagName.toLowerCase())
    expect(tag, 'coming-soon renders as a span, never a <button disabled>').toBe('span')
    await expect(page.getByRole('button', { name: /coming soon/i })).toHaveCount(0)
  })
})
