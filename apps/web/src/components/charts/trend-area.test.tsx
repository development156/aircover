import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { TrendArea, monotoneTangents, type TrendPoint } from './trend-area'
import { Bars, type BarPoint } from './bars'

/**
 * THE THREE THINGS A CHART ON THIS PRODUCT MAY NOT DRAW.
 *
 * Two of these were `performance-over-time.test.tsx`'s, held against a `pathFor`
 * helper that no longer renders anything. They are re-stated here against the
 * component that actually ships, and a third is added that the old
 * implementation could not have had — it drew straight segments, which cannot
 * overshoot. A smooth one can, and a smooth curve that dips below its own data
 * is a rendered reading nobody measured.
 */

const day = (n: number, y: number): TrendPoint => ({ x: n, y, label: `day ${n}` })

/** Every path's `d`, in document order. */
function paths(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('path')).map((p) => p.getAttribute('d') ?? '')
}

/** Every y coordinate a cubic path visits, including its control points. */
function ysIn(d: string): number[] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  // Commands alternate x,y throughout M/L/C, so every odd index is a y.
  return nums.filter((_, i) => i % 2 === 1)
}

describe('the curve', () => {
  test('joins consecutive points with one path', () => {
    const { container } = render(
      <TrendArea points={[day(1, 10), day(2, 20), day(3, 30)]} unit="reach" gradientId="a" />,
    )
    // One fill and one stroke — a single run.
    expect(paths(container)).toHaveLength(2)
  })

  test('BREAKS across a missing point rather than spanning it', () => {
    // Days 1, 2, then 5. A line from day 2 to day 5 is indistinguishable from
    // three real readings, which is the same lie as plotting a zero.
    const { container } = render(
      <TrendArea points={[day(1, 10), day(2, 20), day(5, 30)]} unit="reach" gradientId="b" />,
    )
    // Two runs — {1,2} and {5} — so two fills and two strokes.
    expect(paths(container)).toHaveLength(4)
  })

  /**
   * THE ONE THE OLD PATH COULD NOT FAIL.
   *
   * A Catmull-Rom spline through 40, 0, 40 passes through roughly -12 — a
   * negative reach, drawn, on a chart. Monotone cubic cannot: its tangent at a
   * local minimum is zero by construction.
   *
   * Asserted on the TANGENTS rather than on the rendered path, because the path
   * is in screen space where y is inverted and a reader of this test would have
   * to hold that inversion in their head to know which direction "below" is.
   */
  test('never dips below the two readings it joins', () => {
    const m = monotoneTangents([0, 1, 2], [40, 0, 40])
    expect(m[1], 'the tangent at a local minimum must be flat').toBe(0)

    const rising = monotoneTangents([0, 1, 2], [0, 10, 20])
    expect(
      rising.every((t) => t >= 0),
      'a rising series has no falling tangent',
    ).toBe(true)
  })

  test('a flat series is drawn down the middle, not stretched into variation', () => {
    const { container } = render(
      <TrendArea points={[day(1, 7), day(2, 7), day(3, 7)]} unit="reach" gradientId="c" />,
    )
    const stroke = paths(container)[1] ?? ''
    const ys = ysIn(stroke)
    expect(new Set(ys.map((y) => Math.round(y))).size, 'a flat series has one height').toBe(1)
  })

  test('has nothing to draw for no points', () => {
    const { container } = render(<TrendArea points={[]} unit="reach" gradientId="d" />)
    expect(container.querySelector('svg')).toBeNull()
  })

  test('describes itself for a reader who cannot see it', () => {
    render(
      <TrendArea points={[day(1, 10), day(2, 90)]} unit="reach" pointNoun="days" gradientId="e" />,
    )
    expect(screen.getByRole('img')).toHaveAccessibleName(/2 measured days/i)
    expect(screen.getByRole('img')).toHaveAccessibleName(/highest 90/i)
  })
})

describe('the bars', () => {
  const bar = (label: string, value: number | null): BarPoint => ({ label, value })

  test('draws NOTHING for an unmeasured point — a zero would be a claim', () => {
    const { container } = render(
      <Bars points={[bar('Mon', 5), bar('Tue', null), bar('Wed', 3)]} unit="credits" />,
    )
    // Three columns, two bars.
    expect(container.querySelectorAll('[data-bar]')).toHaveLength(2)
  })

  test('draws a STUB for a measured zero — that is knowledge, not an absence', () => {
    const { container } = render(
      <Bars points={[bar('Mon', 5), bar('Tue', 0), bar('Wed', 3)]} unit="credits" />,
    )
    const bars = Array.from(container.querySelectorAll('[data-bar]'))
    expect(bars, 'a measured zero still draws').toHaveLength(3)
    expect(
      bars[1]!.getAttribute('data-bar'),
      'a measured zero is marked as one, so it is never read as a value',
    ).toBe('zero')
    expect(
      // `parseFloat`, not the string: jsdom normalises "0.00%" to "0%", and a
      // test that pins a serialisation is a test that breaks on a formatter.
      parseFloat((bars[1] as HTMLElement).style.height),
      'a measured zero has no proportional height — the 3px it draws is a floor',
    ).toBe(0)
    expect(
      parseFloat((bars[0] as HTMLElement).style.height),
      'the peak fills the track, so the two are not the same bar',
    ).toBe(100)
  })

  test('counts the unmeasured points in its own summary', () => {
    render(<Bars points={[bar('Mon', 5), bar('Tue', null), bar('Wed', null)]} unit="credits" />)
    // An absence is information, so the summary a screen reader gets says how
    // much of the window was never read.
    expect(screen.getByText(/1 of 3 points measured/i)).toBeInTheDocument()
    expect(screen.getByText(/2 not measured/i)).toBeInTheDocument()
  })

  /**
   * `.is-simulated`'s own contract: the hatch is never a claim on its own. A
   * component that can draw it without a label is a component that will.
   */
  test('refuses to hatch a bar without saying what the hatch means', () => {
    expect(() =>
      render(<Bars points={[{ label: 'Mon', value: 5, hatched: true }]} unit="credits" />),
    ).toThrow(/hatchLabel/)
  })
})
