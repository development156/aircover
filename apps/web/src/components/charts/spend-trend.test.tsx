import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SpendTrend, axisIndices, type SpendPoint } from './spend-trend'

/**
 * The chart replaced `Bars` on /home, and `bars.tsx` had a real argument
 * against a line: it INTERPOLATES, so a run of measured zeroes renders
 * identically to a stretch nobody looked at.
 *
 * Most of what is asserted here is that argument, held. The look — a thin
 * stroke, a faint fill, an average rule — is a handful of attributes and
 * would be cheap to assert and worth little. What is worth pinning is that
 * the drawing cannot make a claim the data does not support.
 */

const days = (values: (number | null)[]): SpendPoint[] =>
  values.map((value, i) => ({ label: `${i + 1} Aug`, value }))

/** Every `d` attribute on the chart's paths, fill and stroke alike. */
function paths(container: HTMLElement): string[] {
  return [...container.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '')
}

describe('SpendTrend — what it may not claim', () => {
  it('never draws a segment across a day nobody read', () => {
    // The whole objection `bars.tsx` raised, in one case. Day 3 is NOT
    // MEASURED. A line from day 2 to day 4 would state a rate of change over
    // a day that was never looked at.
    const { container } = render(
      <SpendTrend points={days([10, 20, null, 40, 50])} unit="credits" />,
    )

    // Two runs, so two stroke paths and two fills — not one of each.
    const strokes = [...container.querySelectorAll('path[stroke="var(--brand)"]')]
    expect(strokes).toHaveLength(2)

    // And no path mentions the x position of the unread day.
    const gapX = (2 / 4) * 600
    for (const d of paths(container)) {
      expect(d).not.toContain(`${gapX} `)
    }
  })

  it('plots a measured zero rather than skipping it', () => {
    // The other half of the same rule, and the one a line chart most easily
    // gets wrong. "Nothing was charged on Tuesday" is knowledge; it must be
    // drawn, at the baseline, not dropped as if nobody looked.
    const { container } = render(<SpendTrend points={days([10, 0, 10])} unit="credits" />)

    const strokes = [...container.querySelectorAll('path[stroke="var(--brand)"]')]
    // ONE run: a zero is measured, so it does not break the line.
    expect(strokes).toHaveLength(1)
    // Three points in the path, the middle one at the baseline.
    // A monotone curve passes THROUGH every reading; the zero at day 4 is a
    // segment end at (300, 158), and the path starts at 0 and ends at 600.
    expect(strokes[0]!.getAttribute('d')).toMatch(/^M0\.0 .*,300\.0 158\.0.*,600\.0 /)
  })

  it('scales height from zero, not from the window minimum', () => {
    // 40, 41, 42 is a 5% change. Scaled against its own range it draws a climb
    // from the floor to the ceiling, which on a chart of somebody's money is a
    // misleading picture. The bottom of this chart is zero credits.
    const { container } = render(<SpendTrend points={days([40, 41, 42])} unit="credits" />)
    const d = container.querySelector('path[stroke="var(--brand)"]')!.getAttribute('d')!

    const ys = [...d.matchAll(/[ML]\d+(?:\.\d+)? (\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]))
    // All three sit in the upper part of the plot and within a few pixels of
    // each other. A range-scaled chart would spread them across ~150px.
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(12)
  })

  it('draws the average rule inside the plot, never above the highest point', () => {
    // ── THE RULE USED ITS OWN GEOMETRY ──────────────────────────────────────
    // `top` was `(1 - heightFraction(average)) * 100`, which ignores PAD_TOP and
    // PAD_BOTTOM, while the line path and the hover dot both go through `py`.
    // MEASURED with the panel's constants (H 160, pad 8/2): the correct
    // expression is `98.75 - 93.75f` and that one is `100 - 100f`.
    //
    // 40/41/42 is the dataset that shows it: the rule landed at 2.38% while the
    // plotted 42 sat at 5.00%, so "Avg 41" was drawn ABOVE the highest reading
    // on the chart. Asserted against the PATH rather than against a number, so
    // the guard survives a change to the padding.
    const { container } = render(<SpendTrend points={days([40, 41, 42])} unit="credits" />)

    // The READINGS, not the control points: a monotone cubic's control
    // handles can sit outside the data's y-range while the curve itself does
    // not, so the plotted points are read off segment ends (`,x y` after each
    // C) and the move-to.
    const d = container.querySelector('path[stroke="var(--brand)"]')!.getAttribute('d')!
    const ys = [
      ...[...d.matchAll(/^M[\d.]+ ([\d.]+)/g)].map((m) => Number(m[1])),
      ...[...d.matchAll(/,[\d.]+ ([\d.]+)(?=C|$)/g)].map((m) => Number(m[1])),
    ]
    const highestPointY = Math.min(...ys)
    const lowestPointY = Math.max(...ys)

    const rule = container.querySelector('[data-avg-rule]') as HTMLElement
    // `top` is a percentage of the panel; the path is in viewBox units of H.
    const ruleY = (parseFloat(rule.style.top) / 100) * 160

    // Larger y is further down. The average of 40/41/42 is between them, so the
    // rule must sit between the highest and lowest plotted points.
    expect(ruleY).toBeGreaterThan(highestPointY)
    expect(ruleY).toBeLessThan(lowestPointY)
  })

  it('averages the days it read, not the days it did not', () => {
    // Two measured days, 10 and 30, and two unread. The average is 20. Dividing
    // by four would print 10 and understate what was actually spent per day.
    render(<SpendTrend points={days([10, null, 30, null])} unit="credits" />)
    expect(screen.getByText('Average').parentElement).toHaveTextContent('Average 20')
  })

  it('draws no average rule over a window with nothing in it', () => {
    // A dotted rule at zero across an empty chart states nothing and gives the
    // reader a line to account for.
    const { container } = render(<SpendTrend points={days([0, 0, 0])} unit="credits" />)
    expect(container.querySelector('[data-avg-rule]')).toBeNull()
  })

  it('says in words how many readings it had, and how many it did not', () => {
    // The summary a screen reader gets INSTEAD of the shape. An absence is
    // information, so the unread days are counted out loud.
    const { container } = render(<SpendTrend points={days([10, null, 30])} unit="credits" />)
    const caption = container.querySelector('figcaption')!
    expect(caption.textContent).toContain('2 of 3 points measured')
    expect(caption.textContent).toContain('1 not measured')
  })
})

describe('SpendTrend — what the founder asked for', () => {
  it('draws a thin brand-coloured line over a faint brand fill', () => {
    const { container } = render(<SpendTrend points={days([10, 30, 20])} unit="credits" />)

    const stroke = container.querySelector('path[stroke="var(--brand)"]')!
    expect(stroke.getAttribute('stroke-width')).toBe('2')
    // Non-scaling, or the stroke smears with the horizontal stretch and stops
    // being thin at a wide viewport — which is the whole brief.
    expect(stroke.getAttribute('vector-effect')).toBe('non-scaling-stroke')

    const stops = [...container.querySelectorAll('stop')]
    expect(stops[0]!.getAttribute('stop-opacity')).toBe('0.22')
    expect(stops[1]!.getAttribute('stop-opacity')).toBe('0')
  })

  it('shows the date and the credits under the pointer', async () => {
    const user = userEvent.setup()
    const { container } = render(<SpendTrend points={days([10, 30, 20])} unit="credits" />)

    // Targeted at the tooltip itself, not at its words: "30 credits" also
    // appears in the accessible summary and "2 Aug" on the axis, so a text
    // query here would pass with no tooltip in the document at all.
    expect(container.querySelector('[data-tip]')).toBeNull()

    // The hover targets are full-height columns, not the 1.5px line itself.
    const columns = [...container.querySelectorAll('.flex.touch-manipulation > div')]
    await user.hover(columns[1] as HTMLElement)

    expect(container.querySelector('[data-tip]')).toHaveTextContent('2 Aug 30 credits')
  })

  it('keeps the peak sentence the card already gave', () => {
    // `Bars` printed this. The brief replaces the drawing, not the information.
    render(<SpendTrend points={days([10, 30, 20])} unit="credits" />)
    expect(screen.getByText(/Most used:/)).toHaveTextContent('Most used: 30 credits on 2 Aug')
  })

  it('prints a readable axis instead of thirty crushed dates', () => {
    // `bars.tsx` MEASURED why: at 1440 a thirty-column axis gives each label
    // ~34px and "25 Jul" needs ~40, so eight labels rendered as "25 … 29 … 2
    // A… 6 …". Six across the same band get ~170px each.
    expect(axisIndices(30)).toEqual([0, 6, 12, 17, 23, 29])
    // Both ends always, whatever the count — an axis states the window.
    for (const n of [2, 7, 30, 31, 90]) {
      const ix = axisIndices(n)
      expect(ix[0]).toBe(0)
      expect(ix[ix.length - 1]).toBe(n - 1)
      expect(ix.length).toBeLessThanOrEqual(6)
    }
    // Fewer readings than slots prints every one of them.
    expect(axisIndices(4)).toEqual([0, 1, 2, 3])
  })
})
