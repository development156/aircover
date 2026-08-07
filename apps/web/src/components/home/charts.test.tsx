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
    render(<SpendArea spend={spend({ days: days([0, 0, 999, 0]) })} />)
    const d = screen.getByTestId('spend-area-line').getAttribute('d') ?? ''
    const ys = [...d.matchAll(/[ ,](-?\d+(?:\.\d+)?)(?=[ L]|$)/g)].map((m) => Number(m[1]))

    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
  })

  test('an all-zero window still plots a real zero line', () => {
    // Distinct from empty: these days were READ and genuinely had no spend.
    render(<SpendArea spend={spend({ days: days([0, 0, 0]), total: 0 })} />)

    expect(screen.getByTestId('spend-area-line')).toBeInTheDocument()
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

  test('a single action still renders a sane bar', () => {
    render(
      <SpendBars
        spend={spend({ byAction: [{ action: 'loop_cycle', label: 'Plan my week', credits: 20 }] })}
      />,
    )
    const width = Number(screen.getByTestId('spend-bar-loop_cycle').getAttribute('width'))

    expect(width).toBeGreaterThan(0)
  })
})
