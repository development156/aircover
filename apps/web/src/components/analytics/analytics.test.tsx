import { render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import type { MetricAvailability } from '@sahoda/publishing'

import { AccountPanel } from './account-panel'
import { ChannelTable } from './channel-table'
import { FollowerChart, FollowerFlow } from './follower-chart'
import { PostTable } from './post-table'
import { TotalFigure } from './figure'
import type { AccountAnalytics } from '@/lib/analytics/account-insights'
import type { ComparableRow } from '@/lib/analytics/compare'

/**
 * What actually reaches the screen.
 *
 * `compare.test.ts` proves the arithmetic refuses to fabricate. This proves the
 * markup does not undo it — that a null total renders as a dash rather than a "0",
 * that a pending post appears nowhere in the ranked table, and that the two
 * Instagram delays are stated separately beside the figures each governs.
 *
 * Asserted on TEXT rather than on colour: docs/design2.0 forbids any state that only
 * reads through colour, and jsdom does not resolve custom properties anyway.
 */

const STAMP = '2026-08-11T13:16:55Z'

const ready = (over: Record<string, number | null> = {}): MetricAvailability =>
  ({
    kind: 'ready',
    metrics: {
      impressions: 100,
      reach: 80,
      engagement: 5,
      engagementRate: 5,
      measuredAt: STAMP,
      ...over,
    },
  }) as MetricAvailability

const lagPending: MetricAvailability = {
  kind: 'pending',
  reason: 'lag',
  availableAfter: '2026-08-13T00:00:00.000Z',
}

const unknownWindow: MetricAvailability = {
  kind: 'pending',
  reason: 'unknown-window',
  availableAfter: null,
}

const row = (over: Partial<ComparableRow> = {}): ComparableRow => ({
  postId: 'p1',
  title: 'A post',
  channel: 'instagram',
  state: ready(),
  ...over,
})

describe('a figure that does not exist is a dash, not a zero', () => {
  test('renders an em dash for a null total', () => {
    render(<TotalFigure total={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  test('renders a real zero as a zero — it is a measurement', () => {
    render(<TotalFigure total={{ value: 0, coverage: { counted: 3, of: 3 } }} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  test('shows the denominator only when coverage is partial', () => {
    const { unmount } = render(
      <TotalFigure total={{ value: 9, coverage: { counted: 2, of: 5 } }} />,
    )
    expect(screen.getByText('2/5')).toBeInTheDocument()
    unmount()

    render(<TotalFigure total={{ value: 9, coverage: { counted: 5, of: 5 } }} />)
    expect(screen.queryByText('5/5')).not.toBeInTheDocument()
  })
})

describe('the ranked table does not rank what it cannot measure', () => {
  const rows = [
    row({ postId: 'p1', title: 'Measured post', state: ready({ impressions: 61 }) }),
    row({ postId: 'p2', title: 'Waiting post', channel: 'linkedin', state: unknownWindow }),
  ]

  test('keeps a pending post out of the ranking entirely', () => {
    render(<PostTable rows={rows} />)
    const table = screen.getByRole('table')
    expect(within(table).getByText('Measured post')).toBeInTheDocument()
    // Not last, not anywhere — being ordered last IS the claim we refuse to make.
    expect(within(table).queryByText('Waiting post')).not.toBeInTheDocument()
  })

  test('lists it separately with its own reason', () => {
    render(<PostTable rows={rows} />)
    expect(screen.getByText(/Not ranked — no measurement yet \(1\)/)).toBeInTheDocument()
    expect(screen.getByText('Waiting post')).toBeInTheDocument()
    // The `unknown-window` copy: no date promised, no zero implied.
    expect(screen.getByText(/doesn’t publish how far behind its metrics run/)).toBeInTheDocument()
  })

  test('states its coverage rather than implying the table is everything', () => {
    render(<PostTable rows={rows} />)
    expect(screen.getByText(/1 of 2 published channels reported/)).toBeInTheDocument()
  })

  test('says nothing reported rather than drawing an empty table of zeroes', () => {
    render(<PostTable rows={[row({ state: lagPending })]} />)
    expect(
      screen.getByText('None of your published posts has reported metrics yet.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  test('dashes a column the measured row never reported', () => {
    render(<PostTable rows={[row({ state: ready({ impressions: 12, reach: null }) })]} />)
    const table = screen.getByRole('table')
    expect(within(table).getByText('12')).toBeInTheDocument()
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0)
  })
})

/**
 * ── TWO RENDERINGS, ONE OF WHICH jsdom CANNOT SEE HIDDEN ─────────────────────
 * Below 700px the channel comparison is a block per channel rather than a table
 * (docs/37 §13, and see the component header for the 390px measurement that
 * forced it). Both are mounted and each is `display:none`'d for the other, which
 * is right in a browser and invisible to jsdom — so every figure appears TWICE
 * to a query over the whole render, and these two tests went red counting three
 * "1/2"s as six.
 *
 * They scope to the table rather than de-duplicating, because the CLAIM is about
 * the comparison table's per-metric denominator and the table is where it lives.
 * `connections-widths.spec.ts` and the frames are what prove the narrow
 * rendering; a jsdom query could not tell the two apart in any case.
 */
const table = () => {
  const el = document.querySelector('table')
  if (!el) throw new Error('the channel table did not render')
  return within(el)
}

describe('the channel table keeps each channel on its own denominator', () => {
  test('shows a partial channel’s coverage beside its figure', () => {
    render(
      <ChannelTable
        rows={[
          row({ postId: 'p1', channel: 'instagram', state: ready({ impressions: 4 }) }),
          row({ postId: 'p2', channel: 'linkedin', state: ready({ impressions: 61 }) }),
          row({ postId: 'p3', channel: 'linkedin', state: unknownWindow }),
        ]}
      />,
    )
    // LinkedIn: one of its two posts reported. The bare 61 alongside Instagram's 4
    // would read as a like-for-like comparison, and it is not one.
    //
    // Once per metric column, not once per row: coverage is per metric, so a
    // channel can be complete for reach and partial for impressions.
    expect(table().getAllByText('1/2')).toHaveLength(3)
    expect(screen.getByText(/2 of 3 channels reported/)).toBeInTheDocument()
  })

  test('lists a channel that reported nothing rather than dropping it', () => {
    render(<ChannelTable rows={[row({ channel: 'x', state: lagPending })]} />)
    // Omitting it would read as "X has nothing to say" instead of "we have
    // nothing from X yet".
    expect(table().getByText('X')).toBeInTheDocument()
  })
})

describe('the follower chart will not describe a trend it does not have', () => {
  test('draws no line and no change figure for a single point', () => {
    const { container } = render(<FollowerChart points={[{ date: '2026-08-11', value: 4 }]} />)
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText(/not enough to show a trend/)).toBeInTheDocument()
    // The documented past bug: "No change over 1 day" claims two readings, that
    // they were equal, and that a day separated them. One point supports none.
    expect(screen.queryByText(/No change/)).not.toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
  })

  test('draws a line, and labels both ends of the zoomed axis', () => {
    const { container } = render(
      <FollowerChart
        points={[
          { date: '2026-08-08', value: 0 },
          { date: '2026-08-09', value: 1 },
          { date: '2026-08-10', value: 1 },
          { date: '2026-08-11', value: 1 },
        ]}
      />,
    )
    expect(container.querySelector('svg')).not.toBeNull()
    expect(screen.getByText('+1 across 4 days')).toBeInTheDocument()
    // Without both ends printed, the steepness of a min/max-scaled line is
    // unreadable — an unlabelled zoomed axis is its own lie.
    expect(screen.getByText(/2026-08-08 · 0/)).toBeInTheDocument()
    expect(screen.getByText(/2026-08-11 · 1/)).toBeInTheDocument()
  })

  test('states the flow window itself, since it can be shorter than the count’s', () => {
    render(
      <FollowerFlow
        gained={[
          { date: '2026-08-09', value: 1 },
          { date: '2026-08-10', value: 0 },
          { date: '2026-08-11', value: 0 },
        ]}
        lost={[{ date: '2026-08-09', value: 0 }]}
      />,
    )
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByText('3 days')).toBeInTheDocument()
  })
})

describe('the account panel answers every state', () => {
  const readyAccount: AccountAnalytics = {
    kind: 'ready',
    followers: [
      { date: '2026-08-10', value: 1 },
      { date: '2026-08-11', value: 1 },
    ],
    gained: [],
    lost: [],
    insights: [
      { label: 'Reach', value: 1 },
      { label: 'Views', value: 13 },
    ],
    followerLagHours: 24,
    insightsLagHours: 48,
    nothingReported: false,
  }

  /**
   * The two delays are different endpoints with different `dataDelay` fields.
   * Printing the shorter one under the insight tiles would claim those figures are
   * a day fresher than Instagram says they are.
   */
  test('states both delays, separately', () => {
    render(<AccountPanel analytics={readyAccount} />)
    expect(screen.getByText(/delay of about a day/)).toBeInTheDocument()
    expect(screen.getByText(/delay of about two days/)).toBeInTheDocument()
  })

  test('renders rather than hides when nothing is connected', () => {
    // Home renders nothing here, correctly — but silence is the wrong answer on
    // the page a customer opens to ask this exact question.
    render(<AccountPanel analytics={{ kind: 'not-connected' }} />)
    expect(screen.getByText(/Connect Instagram to see followers/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open connections' })).toBeInTheDocument()
  })

  test('says it could not look, never that the account is empty', () => {
    render(<AccountPanel analytics={{ kind: 'unreadable' }} />)
    expect(screen.getByText(/Couldn’t read your account insights/)).toBeInTheDocument()
    expect(screen.queryByText(/No follower history/)).not.toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  test('does not print zero followers when Instagram reported no history', () => {
    render(<AccountPanel analytics={{ ...readyAccount, followers: [], nothingReported: true }} />)
    expect(screen.getByText('No follower history to show yet.')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})
