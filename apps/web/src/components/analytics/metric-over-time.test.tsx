import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { MetricOverTime, type MetricLegendEntry } from './metric-over-time'
import type { Route } from 'next'

const legend: MetricLegendEntry[] = [
  { metric: 'reach', label: 'Reach', total: 1200, href: '/analytics' as Route },
  { metric: 'likes', label: 'Likes', total: 42, href: '/analytics?metric=likes' as Route },
  { metric: 'saves', label: 'Saves', total: null, href: '/analytics?metric=saves' as Route },
]

const points = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    day: `2026-08-0${index + 1}`,
    value: (index + 1) * 10,
  }))

describe('the legend is also the switch', () => {
  it('offers every metric as a link that keeps the rest of the view', () => {
    render(
      <MetricOverTime
        legendBasis="Totals for the last 30 days."
        metric="reach"
        label="Reach"
        legend={legend}
        stored={{ kind: 'unavailable' }}
      />,
    )
    expect(screen.getByRole('link', { name: /Likes/ }).getAttribute('href')).toBe(
      '/analytics?metric=likes',
    )
  })

  it('marks the selected metric for a screen reader, not by colour alone', () => {
    render(
      <MetricOverTime
        legendBasis="Totals for the last 30 days."
        metric="likes"
        label="Likes"
        legend={legend}
        live={{ read: { kind: 'not-connected' }, points: [] }}
      />,
    )
    expect(screen.getByRole('link', { name: /Likes/ }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('link', { name: /Reach/ }).getAttribute('aria-current')).toBeNull()
  })

  it('shows the absence mark for a metric nothing reported, never a zero', () => {
    render(
      <MetricOverTime
        legendBasis="Totals for the last 30 days."
        metric="reach"
        label="Reach"
        legend={legend}
        stored={{ kind: 'empty' }}
      />,
    )
    expect(screen.getByRole('link', { name: /Saves/ }).textContent).toContain('—')
    expect(screen.getByRole('link', { name: /Saves/ }).textContent).not.toContain('0')
  })
})

describe('the two sources say which one they are', () => {
  it('calls a stored metric a running lifetime total', () => {
    render(
      <MetricOverTime
        legendBasis="Totals for the last 30 days."
        metric="reach"
        label="Reach"
        legend={legend}
        stored={{
          kind: 'ready',
          points: [
            { day: '2026-08-01', total: 10, series: 1 },
            { day: '2026-08-02', total: 20, series: 1 },
            { day: '2026-08-03', total: 30, series: 1 },
          ],
          minSeries: 1,
          maxSeries: 1,
        }}
      />,
    )
    expect(screen.getByText(/running total since each post went out/i)).toBeTruthy()
  })

  it('calls a live metric what came in on the day', () => {
    render(
      <MetricOverTime
        legendBasis="Totals for the last 30 days."
        metric="likes"
        label="Likes"
        legend={legend}
        live={{
          read: { kind: 'ready', days: [], platforms: [], attribution: 'received' },
          points: points(4),
        }}
      />,
    )
    expect(screen.getByText(/received on the day itself/i)).toBeTruthy()
    expect(screen.queryByText(/running total/i)).toBeNull()
  })
})

describe('the four kinds of nothing a live metric can be', () => {
  const cases = [
    ['not-connected', /no account is connected that reports them/i],
    ['not-configured', /no publishing key set/i],
    ['unreadable', /could not read/i],
  ] as const

  it.each(cases)('%s gets its own sentence', (kind, pattern) => {
    render(
      <MetricOverTime
        legendBasis="Totals for the last 30 days."
        metric="likes"
        label="Likes"
        legend={legend}
        live={{ read: { kind }, points: [] }}
      />,
    )
    expect(screen.getByText(pattern)).toBeTruthy()
  })

  it('separates "we asked and got none" from "we could not ask"', () => {
    render(
      <MetricOverTime
        legendBasis="Totals for the last 30 days."
        metric="likes"
        label="Likes"
        legend={legend}
        live={{
          read: { kind: 'ready', days: [], platforms: [], attribution: 'received' },
          points: [],
        }}
      />,
    )
    expect(
      screen.getByText(/asked your connected accounts and none of them reported/i),
    ).toBeTruthy()
    // The remedy that cannot work must not appear: nothing is broken and there
    // is nothing to connect.
    expect(screen.queryByText(/Connect a channel to start this chart/i)).toBeNull()
  })

  it('offers no retry for a missing key, because reloading cannot add one', () => {
    render(
      <MetricOverTime
        legendBasis="Totals for the last 30 days."
        metric="likes"
        label="Likes"
        legend={legend}
        live={{ read: { kind: 'not-configured' }, points: [] }}
      />,
    )
    expect(screen.queryByText(/Reload to try again/i)).toBeNull()
  })

  it('refuses a trend from two reported days', () => {
    render(
      <MetricOverTime
        legendBasis="Totals for the last 30 days."
        metric="likes"
        label="Likes"
        legend={legend}
        live={{
          read: { kind: 'ready', days: [], platforms: [], attribution: 'received' },
          points: points(2),
        }}
      />,
    )
    expect(screen.getByText(/a line through two readings shows a direction neither/i)).toBeTruthy()
  })
})

/**
 * ── PORTED FROM `performance-over-time.test.tsx`, WHICH THIS PANEL REPLACES ──
 * Every sentence that card could render is a DIFFERENT claim, and each of them
 * was pinned. The card is gone; the claims are not, so its assertions moved
 * here rather than being deleted with the file. Two e2e specs read these exact
 * sentences off the rendered page.
 */
describe('the six sentences the stored branch can say', () => {
  const show = (stored: Parameters<typeof MetricOverTime>[0]['stored']) =>
    render(
      <MetricOverTime
        legendBasis="Totals for the last 30 days."
        metric="reach"
        label="Reach"
        legend={legend}
        stored={stored}
      />,
    )

  it('before the migration, says Sahoda keeps no history yet', () => {
    show({ kind: 'unavailable' })
    expect(screen.getByText(/does not keep a history yet/i)).toBeTruthy()
  })

  it('does not report a failed read as an absence of history', () => {
    show({ kind: 'unreadable' })
    expect(screen.getByText(/could not read the history/i)).toBeTruthy()
    expect(screen.queryByText(/does not keep a history/i)).toBeNull()
  })

  it('tells an account with no workspace that, and offers no retry', () => {
    // Reloading cannot make a workspace. `no-impossible-remedy.spec.ts` caught
    // this exact card offering one.
    show({ kind: 'no-workspace' })
    expect(screen.getByText(/belongs to a workspace/i)).toBeTruthy()
    expect(screen.queryByText(/Reload to try again/i)).toBeNull()
  })

  it('says an empty table is empty without claiming a fault', () => {
    show({ kind: 'empty' })
    expect(screen.getByText(/has started keeping a history/i)).toBeTruthy()
    expect(screen.queryByText(/could not read/i)).toBeNull()
  })

  it('states the coverage when it moved across the window', () => {
    // A total drawn from fewer posts on one day dips for a reason that is not
    // performance, and the card must say so rather than let the line imply it.
    show({
      kind: 'ready',
      points: [
        { day: '2026-08-01', total: 10, series: 2 },
        { day: '2026-08-02', total: 20, series: 3 },
        { day: '2026-08-03', total: 30, series: 5 },
      ],
      minSeries: 2,
      maxSeries: 5,
    })
    expect(screen.getByText(/across 2 to 5 post channels a day/i)).toBeTruthy()
  })

  it('says nothing about coverage when it did not move', () => {
    show({
      kind: 'ready',
      points: [
        { day: '2026-08-01', total: 10, series: 2 },
        { day: '2026-08-02', total: 20, series: 2 },
        { day: '2026-08-03', total: 30, series: 2 },
      ],
      minSeries: 2,
      maxSeries: 2,
    })
    expect(screen.queryByText(/post channels a day/i)).toBeNull()
  })

  it('describes the chart for a reader who cannot see it', () => {
    show({
      kind: 'ready',
      points: [
        { day: '2026-08-01', total: 10, series: 1 },
        { day: '2026-08-02', total: 20, series: 1 },
        { day: '2026-08-03', total: 30, series: 1 },
      ],
      minSeries: 1,
      maxSeries: 1,
    })
    expect(screen.getByRole('img', { name: /measured days/i })).toBeTruthy()
  })
})
