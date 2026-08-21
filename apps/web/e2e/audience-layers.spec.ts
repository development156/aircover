import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { decodePng, luminanceAt } from './helpers/png'

/**
 * THE LINE BETWEEN MEASURED AND WORKED OUT, PROVED WITH HUE REMOVED.
 *
 * `/brain/audience` shows two kinds of number and the whole feature rests on a
 * shop owner telling them apart at a glance. This asserts that the separation
 * survives greyscale — twice, by two independent methods, because the weaker one
 * is the one that would have passed on hue:
 *
 *   1. COMPOSITED LUMINANCE from `getComputedStyle`, alpha-composited over the
 *      surface each element actually sits on. This is `design-system.spec.ts`'s
 *      own method and is what the four certainty rungs are already held to.
 *   2. ACTUAL PIXELS out of a greyscaled screenshot. Stronger, because it reads
 *      what a browser composited rather than what the cascade says it should
 *      have, and because it catches an edge that computes as `dashed` and paints
 *      as nothing.
 *
 * A colour-string comparison would report `--brand` versus `transparent` as
 * "different" and pass on hue alone — the one channel docs/26 §0 forbids being
 * load-bearing. Neither method here can do that.
 */

const OUT = 'design-audit/audience'

/** Rec. 709 relative luminance, 0-1000. Matches design-system.spec.ts. */
const LUMINANCE_FN = `
  const lum = (r, g, b) => {
    const f = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const parse = (c) => { const n = (c.match(/[\\d.]+/g) ?? []).map(Number); return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1] }
`

for (const theme of ['light', 'dark'] as const) {
  test(`the measured and worked-out layers stay apart in greyscale — ${theme} @smoke`, async ({
    page,
  }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 1280, height: 1000 })
    await page.goto('/design-system')
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await expect(page.getByRole('heading', { name: 'Measured, and worked out' })).toBeVisible()

    // ── METHOD 1 · composited luminance from the cascade ────────────────────
    const sig = await page.evaluate(`(() => {
      ${LUMINANCE_FN}
      const over = (c, p, a) => c * a + p * (1 - a)
      const measure = (el) => {
        const cs = getComputedStyle(el)
        const ground = parse(getComputedStyle(el.parentElement ?? document.body).backgroundColor)
        const [r, g, b, a] = parse(cs.backgroundColor)
        return {
          fill: Math.round(lum(over(r, ground[0], a), over(g, ground[1], a), over(b, ground[2], a)) * 1000),
          edge: cs.borderTopStyle + '/' + cs.borderTopWidth,
          texture: cs.backgroundImage === 'none' ? 'none' : 'image',
        }
      }
      const solid = document.querySelector('[data-layer="measured"]')
      const inferred = document.querySelector('[data-layer="worked-out"]')
      if (!solid || !inferred) return { error: 'a layer is missing from the page' }
      return { solid: measure(solid), inferred: measure(inferred) }
    })()`)

    expect((sig as { error?: string }).error).toBeUndefined()
    const { solid, inferred } = sig as {
      solid: { fill: number; edge: string; texture: string }
      inferred: { fill: number; edge: string; texture: string }
    }
    // eslint-disable-next-line no-console
    console.log(
      `\n──── AUDIENCE LAYERS · ${theme} (composited greyscale luminance /1000) ────\n` +
        `  measured (solid fill)  fill=${solid.fill} edge=${solid.edge}\n` +
        `  worked out (.is-proposed) fill=${inferred.fill} edge=${inferred.edge}`,
    )

    // The measured layer is a SOLID FILL; the worked-out layer has none and is
    // carried by a DASHED EDGE. Both channels are asserted, because either one
    // alone is a treatment someone could "clean up" and delete the distinction.
    expect(
      Math.abs(solid.fill - inferred.fill),
      'the measured fill and the worked-out panel must differ decisively in lightness, not by a rounding digit',
    ).toBeGreaterThan(100)
    expect(inferred.edge, 'the worked-out layer is carried by a DASHED edge').toContain('dashed')
    expect(solid.edge, 'the measured layer must not borrow the dashed edge').not.toContain('dashed')

    // ── METHOD 2 · the pixels a browser actually composited ─────────────────
    await page.getByTestId('greyscale-toggle').click()
    await expect(page.locator('html')).toHaveClass(/ds-greyscale/)

    const box = await page.evaluate(`(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x + window.scrollX, y: b.y + window.scrollY, w: b.width, h: b.height } }
      const solid = document.querySelector('[data-layer="measured"]')
      const inferred = document.querySelector('[data-layer="worked-out"]')
      return { solid: r(solid), inferred: r(inferred) }
    })()`)

    const file = `${OUT}/${theme}-greyscale.png`
    await page.screenshot({ path: file, fullPage: true })
    const bytes = readFileSync(file)
    // HASHED, not size-checked. Two frames that came out byte-identical would
    // pass any "bigger than N kilobytes" gate while proving nothing.
    // eslint-disable-next-line no-console
    console.log(
      `  frame ${file} sha256:${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}`,
    )

    const img = decodePng(bytes)
    const px = (x: number, y: number): number => luminanceAt(img, x, y)

    const b = box as { solid: Rect; inferred: Rect }

    /**
     * The MEDIAN of a run, not a single point.
     *
     * The first version sampled each element at its CENTRE, and a mutation test
     * caught what that misses: give the worked-out panel a solid brand fill and
     * the centre lands on the panel's own body TEXT, so the probe reported ink
     * and the guard stayed green while the two layers had become identical. A
     * point sample of a box that contains words measures the words.
     *
     * The run is taken inside the padding band — below the border, above the
     * first line of type — and the median throws away any glyph that still
     * intrudes.
     */
    const medianRun = (x0: number, y: number, width: number): number => {
      const seen: number[] = []
      for (let dx = 0; dx < width; dx += 1) seen.push(px(x0 + dx, y))
      seen.sort((m, n) => m - n)
      return seen[Math.floor(seen.length / 2)] ?? 0
    }

    const solidPx = medianRun(
      b.solid.x + 2,
      b.solid.y + b.solid.h / 2,
      Math.max(4, Math.floor(b.solid.w / 3)),
    )
    // 6px below the top edge: past the 1px border, inside the 16px padding, and
    // well above the eyebrow's first baseline.
    const inferredPx = medianRun(
      b.inferred.x + 6,
      b.inferred.y + 6,
      Math.max(8, Math.floor(b.inferred.w - 12)),
    )

    // The dashed edge, read along its top run. A dash and a gap must alternate:
    // an edge that computes as `dashed` and paints flat would pass method 1.
    let lo = 1000
    let hi = 0
    for (let dx = 6; dx < Math.min(b.inferred.w - 6, 300); dx += 1) {
      const v = px(b.inferred.x + dx, b.inferred.y + 0.5)
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }

    // eslint-disable-next-line no-console
    console.log(
      `  PIXELS  measured fill=${solidPx}  worked-out interior=${inferredPx}  ` +
        `dashed edge ${lo}..${hi} (spread ${hi - lo})`,
    )

    expect(
      Math.abs(solidPx - inferredPx),
      'in the composited image, the measured fill and the worked-out interior must be far apart',
    ).toBeGreaterThan(100)
    expect(
      hi - lo,
      'the worked-out edge must actually PAINT as broken, not merely compute as dashed',
    ).toBeGreaterThan(20)
  })
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}
