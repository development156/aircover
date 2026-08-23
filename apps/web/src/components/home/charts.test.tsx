import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { SpendArea } from './spend-area'
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

describe('SpendArea', () => {
  test('draws an area and a line when there is data', () => {
    render(<SpendArea spend={spend()} />)

    expect(screen.getByTestId('spend-area-fill')).toBeInTheDocument()
    expect(screen.getByTestId('spend-area-line')).toBeInTheDocument()
  })

  test('paints with var(--brand) so it re-themes', () => {
    render(<SpendArea spend={spend()} />)

    expect(screen.getByTestId('spend-area-fill').getAttribute('fill')).toBe('var(--brand)')
    expect(screen.getByTestId('spend-area-line').getAttribute('stroke')).toBe('var(--brand)')
  })

  test('the fill is low-opacity and the line is not', () => {
    render(<SpendArea spend={spend()} />)

    const fillOpacity = Number(screen.getByTestId('spend-area-fill').getAttribute('fill-opacity'))
    expect(fillOpacity).toBeGreaterThan(0)
    expect(fillOpacity).toBeLessThan(0.5)
    expect(screen.getByTestId('spend-area-line').getAttribute('fill')).toBe('none')
  })

  test('an EMPTY read draws nothing and says why', () => {
    render(<SpendArea spend={spend({ status: 'empty', days: [], total: 0 })} />)

    expect(screen.queryByTestId('spend-area-line')).not.toBeInTheDocument()
    expect(screen.getByText(/no credits spent yet/i)).toBeInTheDocument()
  })

  test('an UNREADABLE read never renders as an empty chart', () => {
    // The dangerous case: a failed read drawn as a flat line tells the user they
    // spent nothing, which is a different — and false — claim.
    render(<SpendArea spend={spend({ status: 'unreadable', days: [], total: 0 })} />)

    expect(screen.queryByTestId('spend-area-line')).not.toBeInTheDocument()
    expect(screen.getByText(/couldn.t read/i)).toBeInTheDocument()
    expect(screen.queryByText(/no credits spent yet/i)).not.toBeInTheDocument()
  })

  test('a capped read names the date coverage starts at, not a row count', () => {
    render(<SpendArea spend={spend({ capped: true, coveredFrom: '2026-07-12' })} />)

    expect(screen.getByText(/12 Jul/)).toBeInTheDocument()
  })

  test('an uncapped read shows no coverage note', () => {
    render(<SpendArea spend={spend()} />)

    expect(screen.queryByText(/^from /i)).not.toBeInTheDocument()
  })

  test('the path stays inside the viewBox for a single spike', () => {
    // A lone large value must not send the path above the top edge, which would
    // clip the peak and understate it.
    //
    // The fixture gained two more active days. It was [0, 0, 999, 0] — ONE day
    // with spend — which now renders the sparse state instead of a path, so the
    // geometry it means to guard was no longer being exercised. The guarantee is
    // unchanged and still the point: a lone enormous value among ordinary ones
    // must stay inside the box.
    render(<SpendArea spend={spend({ days: days([0, 1, 999, 1, 1]) })} />)
    const d = screen.getByTestId('spend-area-line').getAttribute('d') ?? ''
    const ys = [...d.matchAll(/[ ,](-?\d+(?:\.\d+)?)(?=[ L]|$)/g)].map((m) => Number(m[1]))

    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
  })

  test('a measured-zero window says so, and is never the no-data state', () => {
    // The guarantee this has always made: days that were READ and genuinely had
    // no spend must not be reported as "we have nothing". That still holds — it
    // is now made in words rather than as a flat line at the axis, because a
    // zero line and a broken chart are the same picture.
    render(<SpendArea spend={spend({ days: days([0, 0, 0]), total: 0 })} />)

    expect(screen.getByTestId('spend-sparse')).toBeInTheDocument()
    expect(screen.getByText(/No credits spent in the last 30 days/i)).toBeInTheDocument()
    // The no-data copy, which would be the false claim, must NOT appear.
    expect(screen.queryByText(/Your first AI action will show up here/i)).not.toBeInTheDocument()
  })

  test('one active day is not charted as a trend', () => {
    // The shape that started this: 29 zeros and one spike drew a flat line with
    // a vertical edge and read as a rendering fault.
    render(<SpendArea spend={spend({ days: days([0, 0, 0, 0, 6]), total: 6 })} />)

    expect(screen.getByTestId('spend-sparse')).toBeInTheDocument()
    expect(screen.queryByTestId('spend-area-line')).not.toBeInTheDocument()
  })
})

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
