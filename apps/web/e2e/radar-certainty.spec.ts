import { mkdirSync } from 'node:fs'
import { expect, test } from './fixtures/seeded-user'
import { leaveOnboarding } from './fixtures/compose'

/**
 * SOLID AND HATCHED STAY APART WITH THE COLOUR REMOVED.
 *
 * ── MEASURED AS COMPOSITED LUMINANCE, NOT AS A COLOUR STRING ────────────────
 * The tempting version of this test reads `getComputedStyle().backgroundColor`
 * off both marks and asserts they differ. It passes on HUE — the one channel
 * that is not allowed to be load-bearing, because a colour-blind reader, a
 * greyscale print and Brand Skin's own recolouring all destroy it. A peer's
 * first attempt at exactly this check compared colour strings and would have
 * reported a pass for two marks a reader could not tell apart.
 *
 * So each mark's fill is COMPOSITED over the surface behind it — the hatch is a
 * background-image over a transparent background, so its own `backgroundColor`
 * says nothing at all — and converted to WCAG relative luminance. Same method as
 * `design-system.spec.ts`, deliberately: two ways of measuring the same property
 * would eventually disagree.
 *
 * ── THE ASSERTION IS ON |ΔL|, NOT ON A DIRECTION ────────────────────────────
 * In light, `.is-real` is a solid brand fill (dark) against a near-white hatched
 * surface; in dark the surface is near-black and the relationship inverts. An
 * assertion that solid is darker would pass in one theme and fail in the other,
 * and "fix" itself if someone flipped a token. What must hold in BOTH is that
 * the gap is large.
 *
 * ── CHROMIUM ONLY ───────────────────────────────────────────────────────────
 * Lightpanda cannot do this: its `screenshot()` writes a placeholder PNG that
 * passes a size gate and its `getBoundingClientRect` returns 5x5, so a layout or
 * pixel claim made through it is confidently wrong.
 *
 * NOT `@smoke`. It needs `RADAR_FIXTURES=1` to have any marks on the page at
 * all, and the gate's smoke run does not set it. Run it the way the header of
 * `design-audit.spec.ts` is run.
 */

const OUT = 'e2e/__artifacts__/radar'

/** docs/26 §3.1 measures `.is-real` at 308 and the hatched surface at 1000/3. */
const MIN_GAP = 100

test.describe('Radar certainty survives greyscale', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`solid and hatched are distinct in ${theme}`, async ({ page, signedIn }) => {
      void signedIn
      test.setTimeout(180_000)

      await page.emulateMedia({ colorScheme: theme })
      await page.goto('/home')
      const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
      if (await create.count()) {
        await create.click()
        await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
        await leaveOnboarding(page)
      }

      await page.goto('/radar')
      await expect(page.getByRole('heading', { name: 'Radar', level: 1 })).toBeVisible({
        timeout: 60_000,
      })

      const seen = page.locator('[data-radar-certainty="seen"]').first()
      const read = page.locator('[data-radar-certainty="read"]').first()
      await expect(
        seen,
        'no "Seen" mark on the page — is RADAR_FIXTURES=1 set on the server?',
      ).toBeVisible({ timeout: 30_000 })
      await expect(read).toBeVisible()

      const measured = await page.evaluate(() => {
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
        const page_ = parse(getComputedStyle(document.body).backgroundColor)

        const read = (selector: string) => {
          const el = document.querySelector(selector)
          if (!el) return null
          const cs = getComputedStyle(el)
          const [r, g, b, a] = parse(cs.backgroundColor)
          // Composite over the page surface, so a translucent or absent fill is
          // measured as what the eye actually receives rather than as rgba(0,0,0,0).
          const over = (c: number, p: number) => c * a + p * (1 - a)
          return {
            fill: Math.round(lum(over(r, page_[0]), over(g, page_[1]), over(b, page_[2])) * 1000),
            texture: cs.backgroundImage === 'none' ? 'none' : 'hatch',
            edge: `${cs.borderTopStyle}/${cs.borderTopWidth}`,
            text: (el.textContent ?? '').trim(),
          }
        }
        return {
          seen: read('[data-radar-certainty="seen"]'),
          read: read('[data-radar-certainty="read"]'),
        }
      })

      const solid = measured.seen
      const hatched = measured.read
      expect(solid, 'the Seen mark was not measurable').not.toBeNull()
      expect(hatched, 'the Our-read mark was not measurable').not.toBeNull()
      if (!solid || !hatched) return

      console.log(
        `\n──── RADAR CERTAINTY · ${theme} (composited greyscale luminance /1000) ────\n` +
          `  SEEN     fill=${solid.fill} texture=${solid.texture} edge=${solid.edge}\n` +
          `  OUR READ fill=${hatched.fill} texture=${hatched.texture} edge=${hatched.edge}`,
      )

      // ── 1 · FILL WEIGHT SEPARATES THEM, IN BOTH THEMES ──────────────────
      expect(
        Math.abs(solid.fill - hatched.fill),
        `solid (${solid.fill}) and hatched (${hatched.fill}) are within ${MIN_GAP}/1000 of each ` +
          `other in ${theme} — a reader with no colour cannot tell an observation from an inference`,
      ).toBeGreaterThan(MIN_GAP)

      // ── 2 · AND TEXTURE SEPARATES THEM INDEPENDENTLY ────────────────────
      // A second channel, so neither signal is load-bearing alone. If a token
      // change ever collapses the fills, this still fails loudly rather than
      // leaving the pair distinguishable by a value nobody re-measured.
      expect(solid.texture).toBe('none')
      expect(hatched.texture).toBe('hatch')

      // ── 3 · THE HATCH NEVER RENDERS WITHOUT ITS WORD ────────────────────
      // tokens.css: "Never render this without the label; the hatch alone is not
      // a claim." A texture with no word is a decoration a screen reader skips.
      expect(hatched.text.length).toBeGreaterThan(0)

      mkdirSync(OUT, { recursive: true })
      await page.screenshot({ path: `${OUT}/${theme}-colour.png`, fullPage: true })

      // The real thing: the colour taken out at the compositor, then shot.
      await page.evaluate(() => {
        document.documentElement.style.filter = 'grayscale(1)'
      })
      await page.screenshot({ path: `${OUT}/${theme}-greyscale.png`, fullPage: true })
    })
  }
})
