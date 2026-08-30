import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, it, expect } from 'vitest'

import { brandNeutralVars, type BrandNeutralVars, type SkinSurface } from './brand-theme'
import { contrastRatio, oklchToRgb, parseOklch, rgbToOklch, type Rgb } from './oklch'

/**
 * The neutrals, carrying the customer's hue. Design System §2 unfrozen.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Founder's ruling, 2026-08-30. Brand colour reaches under 0.5% of the pixels on
 * any screen — 666 to 5,594 px² of a 1.3M px² frame, held there deliberately by
 * `accent-area-budget` and `accent-budget`. So Brand Skin recoloured one button
 * and a nav item, and his verdict was that it "feels like a pathetic failed
 * attempt". The derivation was correct and the feature still could not deliver
 * its promise, because 0.5% of a frame cannot.
 *
 * Tinting the neutrals is the only change that reaches the other 99.5%.
 *
 * ── AND WHY IT IS SAFE, MEASURED RATHER THAN ASSERTED ───────────────────────
 * The reasoning offered for this was "only chroma moves, lightness is untouched,
 * so the contrast maths is unchanged". That is ALMOST true and the gap matters:
 * WCAG relative luminance is computed from sRGB and is not the same function as
 * OKLCH lightness, so adding chroma at a fixed L does move the ratio a little.
 *
 * "Almost true" is how the near-white card on a dark page shipped. So the drift
 * is bounded here rather than waved at. MEASURED across four brands, two
 * themes, five tokens and two foregrounds: the worst movement is 0.153:1, on
 * `--surface` in light, where the pair is black on white at 21:1. The bound
 * below carries headroom over that and is a RATCHET — tighten it if the maths
 * improves, never raise it to admit a change.
 */

/** Mirrors tokens.css, the same values `brand-theme.ts` re-emits the lightness of. */
const STOPS: Record<SkinSurface, Record<keyof BrandNeutralVars, Rgb>> = {
  light: {
    '--canvas': { r: 250, g: 250, b: 250 },
    '--surface': { r: 255, g: 255, b: 255 },
    '--surface-2': { r: 242, g: 242, b: 243 },
    '--surface-3': { r: 233, g: 233, b: 235 },
    '--line': { r: 233, g: 233, b: 236 },
  },
  dark: {
    '--canvas': { r: 13, g: 13, b: 13 },
    '--surface': { r: 23, g: 23, b: 23 },
    '--surface-2': { r: 33, g: 33, b: 33 },
    '--surface-3': { r: 41, g: 41, b: 41 },
    '--line': { r: 51, g: 51, b: 51 },
  },
}

/** tokens.css `--ink` and `--ink-mute`, the two foregrounds that land on these. */
const FOREGROUNDS: Record<SkinSurface, Record<string, Rgb>> = {
  light: { ink: { r: 0, g: 0, b: 0 }, muted: { r: 87, g: 87, b: 90 } },
  dark: { ink: { r: 255, g: 255, b: 255 }, muted: { r: 151, g: 151, b: 151 } },
}

const BRANDS: Record<string, string> = {
  teal: rgbToOklch(0, 128, 128),
  crimson: rgbToOklch(190, 20, 40),
  navy: rgbToOklch(8, 20, 70),
  yellow: rgbToOklch(255, 214, 0),
  'no brand at all': '',
}

/** Headroom over the 0.153:1 worst case. A ratchet, not a target. */
const MAX_DRIFT = 0.25

const SURFACES: SkinSurface[] = ['light', 'dark']
const TOKENS = Object.keys(STOPS.light) as (keyof BrandNeutralVars)[]

const rgbOf = (value: string): Rgb => {
  const { l, c, h } = parseOklch(value)
  return oklchToRgb(l, c, h)
}
const varsFor = (brand: string, surface: SkinSurface) =>
  brandNeutralVars(brand === '' ? [] : [brand], surface)

describe.each(SURFACES)('the %s neutrals', (surface) => {
  describe.each(Object.entries(BRANDS))('under a %s brand', (_name, brand) => {
    const vars = varsFor(brand, surface)

    /**
     * THE ONE THAT MAKES IT SAFE. Every pair the product paints keeps the ratio
     * it had, within a bound. This is the whole licence for unfreezing §2.
     */
    it.each(TOKENS)('keeps the contrast %s already had', (token) => {
      const before = STOPS[surface][token]
      const after = rgbOf(vars[token])

      for (const [name, fg] of Object.entries(FOREGROUNDS[surface])) {
        const drift = Math.abs(contrastRatio(fg, after) - contrastRatio(fg, before))
        expect(drift, `${name} on ${token} moved by ${drift.toFixed(3)}:1`).toBeLessThanOrEqual(
          MAX_DRIFT,
        )
      }
    })

    /**
     * ── THE TONAL LADDER SURVIVES ─────────────────────────────────────────
     * `--canvas` < `--surface` < `--surface-2` < `--surface-3` is the ladder the
     * whole design rests on: a card is a card because it is brighter than the
     * page (docs/26 §2.1). A tint that reordered it would make every card on
     * every screen sit at the wrong depth. Lightness is copied, so this should
     * hold by construction — which is exactly the kind of claim that turns out
     * to be false at a gamut boundary, and `--surface` in light is at one.
     */
    it('holds the tonal ladder in the right order', () => {
      const l = (token: keyof BrandNeutralVars) => parseOklch(vars[token]).l
      const rungs = [l('--canvas'), l('--surface'), l('--surface-2'), l('--surface-3')]

      // Light climbs canvas -> surface then steps DOWN through the wells; dark
      // climbs all the way. Either way the SHAPE must match the untinted one.
      const original = ([...TOKENS] as const)
        .filter((t) => t !== '--line')
        .map(
          (t) =>
            parseOklch(rgbToOklch(STOPS[surface][t].r, STOPS[surface][t].g, STOPS[surface][t].b)).l,
        )

      rungs.forEach((value, i) => {
        expect(value, `${TOKENS[i]} changed lightness`).toBeCloseTo(original[i]!, 3)
      })
    })

    /** A cast, not a colour. Chroma this low is felt rather than seen. */
    it.each(TOKENS)('tints %s without colouring it', (token) => {
      expect(parseOklch(vars[token]).c).toBeLessThanOrEqual(0.02)
    })
  })
})

/**
 * ── THE TINT HAS TO BE VISIBLE, AND `c > 0` DID NOT SAY THAT ───────────────
 * MUTATION-PROVED by an adversarial review: setting `NEUTRAL_CHROMA` from 0.006
 * to 0.001 left 512 of 512 tests green while reducing the entire feature to an
 * invisible no-op — light `--canvas` moved by one channel of 1/255 and dark
 * `--surface-2` did not move at all. The old floor was `c > 0`, defeated only by
 * `formatOklch` rounding to zero.
 *
 * A guard on the INPUT constant cannot see this; the question is whether the
 * emitted colour differs from the token it came from by an amount an eye can
 * find. So it is asserted in rendered channels, against the real stop.
 */
/**
 * ── THE MIRROR, PINNED TO THE REAL FILE ─────────────────────────────────────
 * `brand-theme.ts`'s NEUTRAL_STOPS says "`guard-neutrals.test.ts` reads the real
 * token file". Review measured that claim FALSE: that test never references
 * NEUTRAL_STOPS and reads only the light `:root` block, so all ten values —
 * including the entire dark ladder — were unpinned. A mirror nobody checks is
 * the defect this project already hit once, when these constants silently held
 * v2 greys through the v3 swap and the Guard graded tenant brands against
 * surfaces the app had stopped painting.
 *
 * So the claim is made true here instead of being deleted.
 */
describe('the mirrored token values', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../../../../../packages/shared/tokens.css', import.meta.url)),
    'utf8',
  )

  /** The declarations inside one block, so light and dark cannot be confused. */
  const blockOf = (start: RegExp) => {
    const at = css.search(start)
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at))
  }
  const BLOCKS: Record<SkinSurface, string> = {
    light: blockOf(/^:root \{/m),
    dark: blockOf(/^:root\[data-theme='dark'\],/m),
  }

  const hexOf = ({ r, g, b }: Rgb) =>
    `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`

  it.each(SURFACES)('match tokens.css in %s', (surface) => {
    expect(BLOCKS[surface], 'the block was not found — has tokens.css moved?').not.toBe('')

    for (const token of TOKENS) {
      const declared = new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, 'i').exec(BLOCKS[surface])?.[1]
      expect(declared, `${token} is not declared in the ${surface} block`).toBeDefined()
      expect(declared!.toLowerCase(), `${token} has drifted from tokens.css`).toBe(
        hexOf(STOPS[surface][token]),
      )
    }
  })
})

describe('the tint is actually visible', () => {
  const TINTABLE = TOKENS.filter((t) => !(t === '--surface'))

  it.each(TINTABLE)('moves %s away from its untinted value in light', (token) => {
    const before = STOPS.light[token]
    const after = rgbOf(varsFor(BRANDS.teal!, 'light')[token])
    const moved = Math.max(
      Math.abs(after.r - before.r),
      Math.abs(after.g - before.g),
      Math.abs(after.b - before.b),
    )

    expect(moved, `${token} is indistinguishable from the untinted token`).toBeGreaterThanOrEqual(3)
  })

  it.each(TINTABLE)('moves %s away from its untinted value in dark', (token) => {
    const before = STOPS.dark[token]
    const after = rgbOf(varsFor(BRANDS.teal!, 'dark')[token])
    const moved = Math.max(
      Math.abs(after.r - before.r),
      Math.abs(after.g - before.g),
      Math.abs(after.b - before.b),
    )

    expect(moved, `${token} is indistinguishable from the untinted token`).toBeGreaterThanOrEqual(3)
  })

  /**
   * ── AND LIGHT `--surface` IS THE ONE THAT MUST NOT MOVE ───────────────────
   * `#ffffff` is L=1.0 and sRGB has no headroom for chroma there, so asking for
   * some CLAMPS lightness instead of adding hue. MEASURED by the review: the
   * canvas-to-surface step fell from 1.0438:1 to 1.0298:1, under the 1.03 floor
   * `tonal-ladder.test.ts` enforces — dissolving the only thing that separates a
   * card from the page in light mode.
   */
  it('leaves light --surface exactly as tokens.css has it', () => {
    const after = rgbOf(varsFor(BRANDS.crimson!, 'light')['--surface'])
    expect(after).toEqual(STOPS.light['--surface'])
  })
})

/**
 * The step that makes a card a card, held across the whole hue circle rather
 * than at the four brands the rest of this file samples. docs/26 §2.1 and
 * tokens.css:147 put the light adjacent-pair floor at 1.03:1.
 */
describe('the tonal ladder keeps its steps', () => {
  const FLOOR = 1.03

  it('keeps canvas and surface apart at every hue', () => {
    let worst = Infinity
    let at = 0

    for (let hue = 0; hue < 360; hue += 4) {
      const vars = varsFor(`oklch(0.55 0.12 ${hue})`, 'light')
      const step = contrastRatio(rgbOf(vars['--canvas']), rgbOf(vars['--surface']))
      if (step < worst) {
        worst = step
        at = hue
      }
    }

    expect(worst, `the card/page step collapsed to ${worst.toFixed(4)}:1 at hue ${at}`).toBeGreaterThanOrEqual(FLOOR)
  })
})

describe('the neutrals belong to the brand', () => {
  it('carries the brand hue rather than a fixed one', () => {
    const teal = parseOklch(varsFor(BRANDS.teal!, 'light')['--canvas']).h
    const crimson = parseOklch(varsFor(BRANDS.crimson!, 'light')['--canvas']).h

    expect(Math.abs(teal - crimson)).toBeGreaterThan(60)
  })

  /** The same hue as the primary, or the tint is a second brand nobody chose. */
  it('uses the hue the primary settled on', () => {
    const brand = rgbToOklch(0, 128, 128)
    expect(parseOklch(varsFor(brand, 'light')['--canvas']).h).toBeCloseTo(parseOklch(brand).h, 0)
  })

  /**
   * A grey logo has no hue to lend, and the chroma floor already sends the
   * primary to Sahoda orange. The neutrals must follow it rather than tinting
   * the product in a hue nobody has.
   */
  it('follows the primary into the fallback for a colourless logo', () => {
    const grey = varsFor(rgbToOklch(200, 200, 202), 'light')
    expect(grey).toEqual(varsFor('', 'light'))
  })

  it('produces different neutrals for the two themes', () => {
    expect(varsFor(BRANDS.teal!, 'light')).not.toEqual(varsFor(BRANDS.teal!, 'dark'))
  })
})
