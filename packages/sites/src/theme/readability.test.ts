import { describe, it, expect } from 'vitest'
import { contrastRatio, formatOklch, oklchToRgb, type Oklch, type Rgb } from './oklch'
import { guardPrimaryForeground } from './readability'

const MIN_CONTRAST = 4.5
const WHITE: Rgb = { r: 255, g: 255, b: 255 }
// Recomputed locally from --ink #131313 (packages/shared/tokens.css) so the
// tests independently pin the constant the implementation uses.
const INK: Rgb = { r: 0x13, g: 0x13, b: 0x13 }

const foregroundRgb = (fg: 'white' | 'var(--ink)'): Rgb => (fg === 'white' ? WHITE : INK)

describe('guardPrimaryForeground — picks a foreground, darkening only when it must', () => {
  it('picks var(--ink) for a pale yellow, because white on pale yellow is unreadable', () => {
    const pale: Oklch = { l: 0.95, c: 0.12, h: 100 }

    const guarded = guardPrimaryForeground(pale)

    expect(guarded.fg).toBe('var(--ink)')
    expect(formatOklch(guarded.primary)).toBe('oklch(0.95 0.12 100)')
    expect(guarded.ratio).toBeCloseTo(16.13, 2)
  })

  it('picks white for a dark navy, because ink on navy is unreadable', () => {
    const navy: Oklch = { l: 0.25, c: 0.09, h: 264 }

    const guarded = guardPrimaryForeground(navy)

    expect(guarded.fg).toBe('white')
    expect(formatOklch(guarded.primary)).toBe('oklch(0.25 0.09 264)')
    expect(guarded.ratio).toBeCloseTo(16.2411, 3)
  })

  it('leaves the brand orange untouched and pairs it with var(--ink) at 5.54:1', () => {
    // #FF4B00 expressed in OKLCH — docs/08 §2 --p.
    const brandOrange: Oklch = { l: 0.6657, c: 0.225, h: 36.6 }

    const guarded = guardPrimaryForeground(brandOrange)

    expect(guarded.fg).toBe('var(--ink)')
    expect(formatOklch(guarded.primary)).toBe('oklch(0.6657 0.225 36.6)')
    expect(guarded.ratio).toBeGreaterThanOrEqual(MIN_CONTRAST)
    expect(guarded.ratio).toBeCloseTo(5.5372, 3)
  })

  it('darkens a mid-tone red that fails BOTH foregrounds at its input lightness', () => {
    // At l=0.6 this reads 4.14:1 on white and 4.49:1 on ink — both short of 4.5.
    const midRed: Oklch = { l: 0.6, c: 0.1, h: 0 }

    const guarded = guardPrimaryForeground(midRed)

    // One 0.03 step down is enough: 0.60 -> 0.57.
    expect(formatOklch(guarded.primary)).toBe('oklch(0.57 0.1 0)')
    expect(guarded.fg).toBe('white')
    expect(guarded.ratio).toBeCloseTo(4.7025, 4)
    expect(guarded.ratio).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })

  it('reports a ratio that is the real contrast of the RETURNED primary against var(--ink)', () => {
    const guarded = guardPrimaryForeground({ l: 0.62, c: 0.14, h: 250 })

    expect(guarded.fg).toBe('var(--ink)')
    expect(guarded.ratio).toBe(contrastRatio(oklchToRgb(guarded.primary), INK))
  })

  it('reports a ratio that is the real contrast of the RETURNED primary against white', () => {
    const guarded = guardPrimaryForeground({ l: 0.3, c: 0.12, h: 280 })

    expect(guarded.fg).toBe('white')
    expect(guarded.ratio).toBe(contrastRatio(oklchToRgb(guarded.primary), WHITE))
  })

  it('falls back to near-black + white for a non-finite lightness, which no loop can converge on', () => {
    // Oklch is a plain struct; nothing in the type system stops NaN reaching here,
    // and NaN makes every >= comparison false, so the loop exhausts its budget.
    const guarded = guardPrimaryForeground({ l: Number.NaN, c: 0.1, h: 20 })

    expect(guarded.fg).toBe('white')
    expect(guarded.ratio).toBe(21)
    expect(guarded.ratio).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })

  it('drops chroma to zero in the fallback, so the fallback is provably pure black', () => {
    const guarded = guardPrimaryForeground({ l: Number.POSITIVE_INFINITY, c: Number.NaN, h: 20 })

    expect(guarded.primary).toEqual({ l: 0, c: 0, h: 20 })
    expect(oklchToRgb(guarded.primary)).toEqual({ r: 0, g: 0, b: 0 })
  })
})

describe('guardPrimaryForeground — PROPERTY: the pair is never below 4.5:1', () => {
  // This is the guarantee the whole file exists for. A regression here ships an
  // unreadable button to a customer's live domain, so it is swept, not sampled.
  const CHROMA_VALUES = [0, 0.02, 0.05, 0.08, 0.12, 0.16, 0.2, 0.25, 0.3, 0.4]

  for (const c of CHROMA_VALUES) {
    it(`clears 4.5:1 for every lightness and hue at chroma ${c}`, () => {
      const violations: Array<{ input: Oklch; fg: string; ratio: number }> = []

      for (let step = 0; step <= 100; step += 1) {
        const l = step / 100
        for (let h = 0; h < 360; h += 5) {
          const input: Oklch = { l, c, h }
          const guarded = guardPrimaryForeground(input)
          const actual = contrastRatio(oklchToRgb(guarded.primary), foregroundRgb(guarded.fg))
          if (actual < MIN_CONTRAST || guarded.ratio < MIN_CONTRAST) {
            violations.push({ input, fg: guarded.fg, ratio: actual })
          }
        }
      }

      expect(violations).toEqual([])
    })
  }
})
