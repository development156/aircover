import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { SpendBars } from './spend-bars'
import type { SpendRead } from '@/lib/home/spend'

/**
 * The two Home charts, hand-rolled SVG — no chart library.
 *
 * The rule that shapes both: NEVER draw a flat line that reads as "no activity"
 * when it means "no data". A chart is a claim about what happened, and an axis
 * with a line pinned to zero is a confident claim of zero. When the read failed,
 * or there is nothing to plot, these say so in words instead.
 *
 * Everything paints with `var(--brand)`, so both follow a tenant's Brand Skin
 * with no per-theme code. Asserted here rather than by colour, since jsdom does
 * not resolve custom properties.
 */

const days = (values: number[]): SpendRead['days'] =>
  values.map((credits, i) => ({ date: `2026-07-${String(i + 1).padStart(2, '0')}`, credits }))

const spend = (over: Partial<SpendRead> = {}): SpendRead => ({
  status: 'ok',
  days: days([0, 3, 0, 20, 5]),
  byAction: [
    { action: 'brand_research', label: 'Brand research', credits: 50 },
    { action: 'post_variants', label: 'Post variants', credits: 5 },
  ],
  total: 55,
  capped: false,
  coveredFrom: null,
  ...over,
})

/**
 * ── `SpendArea` AND ITS TEN TESTS ARE GONE, AND WHERE EACH PROPERTY WENT ─────
 * The card draws BARS now (see spend-card.tsx for why the three-day floor was
 * an argument about a line, not about how much data there is), so `SpendArea`
 * became a component nothing rendered — with ten green tests still standing on
 * it. That is the shape this repo has already recorded as "a test suite that
 * proves the wrong thing": ten assertions reporting a chart works, on a chart
 * no customer can reach.
 *
 * Deleted rather than left, and every property re-homed rather than dropped:
 *
 *   paints with `var(--brand)`, never a hex   → `design-lint` rule 1, at zero
 *   nothing drawn for empty / unreadable      → `spend-card.test.tsx`
 *   a lone spike stays inside the box         → structural in `Bars`: heights
 *                                               are `value / peak`, so the peak
 *                                               IS 100% and cannot overflow
 *   a measured-zero window is not "no data"   → `trend-area.test.tsx`, "draws a
 *                                               STUB for a measured zero"
 *   a capped read names its start DATE        → `spend-card.test.tsx`
 *   one active day is not charted as a trend  → DELIBERATELY CHANGED. It is
 *                                               charted, and captioned "one day
 *                                               with activity so far — not
 *                                               enough to read as a trend".
 *                                               The claim is kept; the chart is
 *                                               no longer withheld to make it.
 */

describe('SpendBars', () => {
  test('one bar per action, biggest first', () => {
    render(<SpendBars spend={spend()} />)
    // Excludes `spend-bar-value-*`, which is the amount, not the bar.
    const bars = screen.getAllByTestId(/^spend-bar-(?!value-)/)

    expect(bars).toHaveLength(2)
    expect(bars[0]?.getAttribute('data-testid')).toBe('spend-bar-brand_research')
  })

  test('bars paint with var(--brand)', () => {
    render(<SpendBars spend={spend()} />)

    expect(screen.getByTestId('spend-bar-brand_research').getAttribute('fill')).toBe('var(--brand)')
  })

  test('bar width is proportional, and the largest fills the track', () => {
    render(<SpendBars spend={spend()} />)
    const big = Number(screen.getByTestId('spend-bar-brand_research').getAttribute('width'))
    const small = Number(screen.getByTestId('spend-bar-post_variants').getAttribute('width'))

    expect(big).toBeGreaterThan(small)
    expect(small / big).toBeCloseTo(5 / 50, 1)
  })

  test('amounts use .num so the column aligns', () => {
    render(<SpendBars spend={spend()} />)

    expect(screen.getByTestId('spend-bar-value-brand_research').className).toContain('num')
  })

  test('labels are the human label, never the raw action token', () => {
    render(<SpendBars spend={spend()} />)

    expect(screen.getByText('Brand research')).toBeInTheDocument()
    expect(screen.queryByText('brand_research')).not.toBeInTheDocument()
  })

  test('empty says so rather than drawing an empty axis', () => {
    render(<SpendBars spend={spend({ status: 'empty', byAction: [], total: 0 })} />)

    expect(screen.queryByTestId(/^spend-bar-(?!value-)/)).not.toBeInTheDocument()
    expect(screen.getByText(/nothing spent yet/i)).toBeInTheDocument()
  })

  test('unreadable is distinct from empty here too', () => {
    render(<SpendBars spend={spend({ status: 'unreadable', byAction: [], total: 0 })} />)

    expect(screen.getByText(/couldn.t read/i)).toBeInTheDocument()
  })

  /**
   * REPLACES 'a single action still renders a sane bar', which asserted the
   * defect. With one category `credits / peak` is `credits / credits`, so that
   * "sane bar" was the full track every time and the assertion `width > 0`
   * could not tell a proportion from a constant — it passed just as happily on
   * 20 credits as on 20,000. See the component header.
   */
  test('one action draws NO track, because there is nothing to compare it against', () => {
    render(
      <SpendBars
        spend={spend({ byAction: [{ action: 'loop_cycle', label: 'Plan my week', credits: 20 }] })}
      />,
    )

    expect(screen.queryByTestId('spend-bar-loop_cycle')).not.toBeInTheDocument()
  })

  /** And the FIGURE is never what gets dropped — only the ratio that isn't one. */
  test('one action still states its label and its number', () => {
    render(
      <SpendBars
        spend={spend({ byAction: [{ action: 'loop_cycle', label: 'Plan my week', credits: 20 }] })}
      />,
    )

    expect(screen.getByText('Plan my week')).toBeInTheDocument()
    expect(screen.getByTestId('spend-bar-value-loop_cycle')).toHaveTextContent('20')
  })

  /** Two categories is where a comparison starts existing, so the track returns. */
  test('two actions draw tracks, and the smaller one is genuinely shorter', () => {
    render(
      <SpendBars
        spend={spend({
          byAction: [
            { action: 'brand_research', label: 'Brand research', credits: 100 },
            { action: 'loop_cycle', label: 'Plan my week', credits: 20 },
          ],
        })}
      />,
    )
    const big = Number(screen.getByTestId('spend-bar-brand_research').getAttribute('width'))
    const small = Number(screen.getByTestId('spend-bar-loop_cycle').getAttribute('width'))

    expect(big).toBeGreaterThan(small)
  })
})
