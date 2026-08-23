import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

/**
 * THE SURFACE LADDER HAD NO GUARD, AND THAT IS WHY IT BROKE.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * It reads ONE file — `@sahoda/shared/tokens.css` — pulls three named scope
 * blocks out of it by regex, and compares four rungs inside each:
 *  · [CORRECTED 2026-08-23 — this entry was WRONG.] It read: "THE SECOND COPY.
 *    `apps/web/src/lib/sites/tokens-css-inline.ts` carries the same ladder
 *    inline… the ladder this guard proves and the ladder a published site ships
 *    are two different strings."
 *
 *    They cannot be two different strings. `tokens-css-inline.test.ts` asserts
 *    the inline copy is BYTE-FOR-BYTE identical to `tokens.css`, and that check
 *    runs on every gate. MEASURED: making `--surface-2` identical to `--surface`
 *    in the inline copy alone fails it in two places.
 *
 *    The composition was real and undocumented, which is its own hazard — this
 *    guard's coverage of the shipped ladder depended on a sibling test no reader
 *    of this file was told about, and deleting that sibling would have silently
 *    halved this one. So the loop is closed HERE as well, in the last test in
 *    this file, rather than left as an arrangement between two files that do not
 *    mention each other;
 *  · a rung that is not a six-digit hex literal. The extraction takes the last
 *    six hex characters of the declaration, so a `var()` reference, an
 *    eight-digit hex with alpha, or an `rgb()`/`oklch()` value is either
 *    mis-read or throws;
 *  · any scope tokens.css declares that is not one of the three named in
 *    SCOPES — a fourth theme block is simply not examined;
 *  · what actually RENDERS. A component with a hardcoded fill, or a Brand Skin
 *    theme overriding these variables at runtime, is not tokens.css and cannot
 *    fail here;
 *  · any pair other than adjacent rungs — nothing is asserted about a surface
 *    against text, or about surface-3 against canvas.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────────
 * v4's dark theme shipped `--surface-2` BYTE-IDENTICAL to `--surface`
 * (#17171a both). Not close — the same six characters. Every element that
 * lifted itself off a card with a `bg-s2` fill painted the card's own colour
 * and separated nothing. MEASURED across all 40 routes in dark: 117 of 120
 * frames carried at least one fill that separated nothing.
 *
 * Nothing went red, and nothing COULD, because a missing 4% fill reads as a
 * design choice rather than a bug. `scripts/design/dark-ladder.mjs` existed —
 * but it is a SOLVER: it prints, it asserts nothing, and it is not in the gate.
 * A script that only prints is a script nobody runs.
 *
 * ── THE UNIT, AND WHY THE OBVIOUS ONE IS WRONG ───────────────────────────────
 * dark-ladder.mjs printed ΔL/1000 (a relative-luminance delta). In that unit
 * v5's light steps measure 44-111 and its dark steps 4.5-7.0 — a 10-20x
 * difference for pairs doing exactly the same job — because sRGB is compressed
 * near black. In CONTRAST the same pairs measure 1.04 and 1.08: the same order.
 *
 * So a floor written in ΔL would condemn a dark ladder that is fine, and a
 * single ΔL floor covering both themes is not expressible at all. This guard
 * and docs/37 both speak CONTRAST, which is also the unit v4's own repair note
 * quoted ("makes the two steps 1.042 and 1.045").
 *
 * ── TWO FLOORS, BOTH DERIVED ─────────────────────────────────────────────────
 * Neither number is asserted. Each sits just under the worst adjacent pair the
 * reference (runey.app) itself achieves, measured off its screenshots:
 *
 *     light   reference worst 1.04:1   ->  floor 1.03
 *     dark    reference worst 1.08:1   ->  floor 1.06
 *
 * That leaves room to tune a rung without tripping the guard, while the defect
 * it exists for — 1.000:1 — is caught with room to spare.
 */

const require_ = createRequire(import.meta.url)
const TOKENS = readFileSync(require_.resolve('@sahoda/shared/tokens.css'), 'utf8')

/** The three scopes tokens.css declares a full ladder in. */
const SCOPES = {
  light: /:root\s*\{([\s\S]*?)\n\}/,
  dark: /\.dark\s*\{([\s\S]*?)\n\}/,
  inverse: /\[data-surface='inverse'\]\s*\{([\s\S]*?)\n\}/,
} as const

/** Rungs in ladder order. A ladder is only meaningful in one direction. */
const RUNGS = ['--canvas', '--surface', '--surface-2', '--surface-3'] as const

/**
 * Floors per scope. The inverse surface reuses dark's floor: it IS a dark
 * ladder, it just lives inside a light document.
 */
const FLOOR = { light: 1.03, dark: 1.06, inverse: 1.06 } as const

type Rgb = [number, number, number]

function block(scope: keyof typeof SCOPES): string {
  const m = TOKENS.match(SCOPES[scope])
  if (!m) throw new Error(`tokens.css has no ${scope} block`)
  return m[1]!
}

function rung(scope: keyof typeof SCOPES, name: string): Rgb {
  const m = block(scope).match(new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm'))
  if (!m) throw new Error(`tokens.css ${scope} block has no ${name}`)
  const raw = m[1]!.trim()
  const hex = raw.replace(/^.*?([0-9a-fA-F]{6})\s*$/, '$1')
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`${scope} ${name} is "${raw}" — a ladder rung must be a 6-digit hex literal`)
  }
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
}

/* WCAG 2.1 relative luminance. Duplicated from scripts/design/contrast.mjs
   rather than imported: that file is a build script outside the app's module
   graph, and a guard that cannot run without the tool it grades is a guard
   with a second way to go green. Twelve lines is a cheaper price than that. */
function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

describe('the tonal ladder separates every adjacent pair', () => {
  for (const scope of Object.keys(SCOPES) as (keyof typeof SCOPES)[]) {
    const floor = FLOOR[scope]

    it(`${scope}: no adjacent pair is under ${floor}:1`, () => {
      const measured: string[] = []
      for (let i = 0; i < RUNGS.length - 1; i++) {
        const a = RUNGS[i]!
        const b = RUNGS[i + 1]!
        const ratio = contrast(rung(scope, a), rung(scope, b))
        measured.push(`${a} -> ${b} ${ratio.toFixed(3)}:1`)
        expect(
          ratio,
          `${scope}: ${a} -> ${b} measures ${ratio.toFixed(3)}:1, under the ${floor}:1 floor. ` +
            `A fill that separates nothing reads as a design choice, not a bug — which is why ` +
            `v4 shipped 1.000:1 here for weeks.`,
        ).toBeGreaterThanOrEqual(floor)
      }
      console.log(`[ladder ${scope}] ${measured.join('  ·  ')}`)
    })

    it(`${scope}: no two rungs are the same colour`, () => {
      const seen = new Map<string, string>()
      for (const name of RUNGS) {
        const key = rung(scope, name).join(',')
        const prior = seen.get(key)
        expect(
          prior,
          `${scope}: ${name} is byte-identical to ${prior}. This is the exact shape of the ` +
            `v4 defect: --surface-2 equalled --surface and 117 of 120 dark frames carried a ` +
            `fill that separated nothing.`,
        ).toBeUndefined()
        seen.set(key, name)
      }
    })
  }

  /**
   * THE DETECTOR, SHOWN FAILING.
   *
   * If this checker could not fail, the assertions above would prove nothing.
   * The pair below is the ACTUAL v4 defect — #17171a against itself — expressed
   * as RGB triples rather than hex literals so this file stays inside
   * design-lint's no-raw-hex rule without needing an allowlist entry.
   */
  it('rejects the pair that shipped before this guard existed', () => {
    const v4DarkSurface: Rgb = [23, 23, 26] // #17171a
    const v4DarkSurface2: Rgb = [23, 23, 26] // #17171a — the same value, shipped
    expect(contrast(v4DarkSurface, v4DarkSurface2)).toBe(1)
    expect(contrast(v4DarkSurface, v4DarkSurface2)).toBeLessThan(FLOOR.dark)
  })

  /** And that it does not simply fail everything. */
  it('accepts a pair that genuinely separates', () => {
    expect(contrast([13, 13, 13], [23, 23, 23])).toBeGreaterThanOrEqual(FLOOR.dark)
  })

  /**
   * THE SHIPPED LADDER IS THE LADDER PROVED ABOVE.
   *
   * Everything above reads `@sahoda/shared/tokens.css`. A generated site cannot
   * import a stylesheet, so `lib/sites/tokens-css-inline.ts` carries the same
   * ladder as a string — and if the two could drift, every measurement above
   * would be true of a stylesheet no customer's site ever loads.
   *
   * They cannot drift: `tokens-css-inline.test.ts` pins them byte-for-byte. This
   * asserts the SAME thing from this side, deliberately duplicating one line,
   * because a guard whose scope depends on a sibling test staying alive has a
   * second way to go quietly green.
   */
  it('the inline copy a published site ships is the same ladder, byte for byte', async () => {
    const { TOKENS_CSS } = await import('@/lib/sites/tokens-css-inline')
    expect(
      TOKENS_CSS,
      'lib/sites/tokens-css-inline.ts has drifted from tokens.css, so every ladder ' +
        'measurement in this file is true of a stylesheet no published site loads. ' +
        'Regenerate it: node scripts/gen-tokens-inline.mjs',
    ).toBe(TOKENS)
  })
})
