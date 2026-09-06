import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import {
  ContentFormats,
  EngagementAccumulation,
  FollowerEvolution,
  MIN_CADENCE_WEEKS,
  PostingCadence,
} from './posting-shape'
import type { FollowerSeries, PostingAbsence } from '@/lib/analytics/posting-insights'

const series = (over: Partial<FollowerSeries> = {}): FollowerSeries => ({
  accountId: 'acc_a',
  platform: 'instagram',
  username: '@shop',
  currentFollowers: 1200,
  growth: 30,
  points: [
    { date: '2026-08-01', followers: 1170 },
    { date: '2026-08-02', followers: 1185 },
    { date: '2026-08-03', followers: 1200 },
  ],
  ...over,
})

const ABSENCES: PostingAbsence[] = ['not-connected', 'not-configured', 'unreadable']

describe('FollowerEvolution', () => {
  it('draws one card per connected account', () => {
    render(
      <FollowerEvolution
        section={{
          kind: 'ready',
          value: [series(), series({ accountId: 'b', platform: 'linkedin', currentFollowers: 40 })],
        }}
      />,
    )
    // Twice: the headline count and the axis's own top label.
    expect(screen.getAllByText('1,200').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('img', { name: /Followers on/ })).toHaveLength(2)
  })

  it('refuses a trend from one reading, and says so', () => {
    render(
      <FollowerEvolution
        section={{
          kind: 'ready',
          value: [series({ points: [{ date: '2026-08-01', followers: 1200 }] })],
        }}
      />,
    )
    expect(screen.getByText(/Not enough to show a trend/i)).toBeTruthy()
    expect(screen.queryByRole('img', { name: /Followers on/ })).toBeNull()
  })

  it('says an account with no history has none, never that it has zero followers', () => {
    render(<FollowerEvolution section={{ kind: 'ready', value: [series({ points: [] })] }} />)
    expect(screen.getByText(/No history for this account yet/i)).toBeTruthy()
    // The current count is still a real reading and is still shown.
    expect(screen.getByText('1,200')).toBeTruthy()
  })

  it('gives each of the three absences a different sentence', () => {
    const said = new Set<string>()
    for (const absence of ABSENCES) {
      const { unmount } = render(<FollowerEvolution section={{ kind: 'absent', absence }} />)
      said.add(document.body.textContent ?? '')
      unmount()
    }
    expect(said.size).toBe(3)
  })

  it('offers no retry when the key is missing', () => {
    render(<FollowerEvolution section={{ kind: 'absent', absence: 'not-configured' }} />)
    expect(screen.queryByText(/Reload to try again/i)).toBeNull()
  })
})

describe('ContentFormats', () => {
  it('counts each format and draws a format with none as a measured zero', () => {
    const { container } = render(
      <ContentFormats
        breakdown={{
          kind: 'ready',
          counts: { image: 4, video: 2, text: 1, unknown: 0 },
          posts: 7,
        }}
      />,
    )
    expect(container.querySelectorAll('[data-bar="zero"]')).toHaveLength(1)
    // Twice: the axis label and the count list beneath it.
    expect(screen.getAllByText(/Photo/).length).toBeGreaterThan(0)
  })

  it('counts an unidentifiable attachment apart and says why', () => {
    render(
      <ContentFormats
        breakdown={{ kind: 'ready', counts: { image: 1, video: 0, text: 2, unknown: 3 }, posts: 6 }}
      />,
    )
    expect(screen.getByText(/3 of 6 carry an attachment Sahoda could not identify/i)).toBeTruthy()
  })

  it('never reports a failed media read as a window of text posts', () => {
    render(<ContentFormats breakdown={{ kind: 'unreadable' }} />)
    expect(screen.getByText(/could not read what was attached/i)).toBeTruthy()
    expect(screen.queryByText(/Words only/)).toBeNull()
  })
})

describe('PostingCadence', () => {
  const row = (weeks: number, over = {}) => ({
    platform: 'instagram',
    postsPerWeek: 2,
    avgEngagementRate: 44.4,
    avgEngagement: 512,
    weeksCount: weeks,
    ...over,
  })

  it('shows a cadence backed by enough weeks', () => {
    render(<PostingCadence section={{ kind: 'ready', value: [row(18)] }} />)
    expect(screen.getByText('44.4%')).toBeTruthy()
    expect(screen.getByText('18')).toBeTruthy()
  })

  it('leaves a one-week cadence out of the table and counts it in words', () => {
    // A rate from one week plotted beside a rate from eighteen gives them the
    // same weight, and the reader has no way to see the difference.
    render(
      <PostingCadence section={{ kind: 'ready', value: [row(18), row(1, { postsPerWeek: 5 })] }} />,
    )
    expect(screen.getByText(new RegExp(`fewer than ${MIN_CADENCE_WEEKS} weeks`, 'i'))).toBeTruthy()
    expect(screen.queryByText('5')).toBeNull()
  })

  it('refuses the table outright when every row is thin', () => {
    render(<PostingCadence section={{ kind: 'ready', value: [row(1), row(2)] }} />)
    expect(screen.getAllByText(/not a pattern/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('says it is a description and not advice', () => {
    render(<PostingCadence section={{ kind: 'ready', value: [row(18)] }} />)
    expect(screen.getByText(/not advice/i)).toBeTruthy()
  })
})

describe('EngagementAccumulation', () => {
  const bucket = (order: number, pct: number | null, posts = 80) => ({
    order,
    label: `${order}h`,
    avgPctOfFinal: pct,
    postCount: posts,
  })

  it('draws the curve once enough windows are measured', () => {
    render(
      <EngagementAccumulation
        section={{ kind: 'ready', value: [bucket(0, 45), bucket(1, 19), bucket(2, 14)] }}
      />,
    )
    expect(screen.getByText('45%')).toBeTruthy()
  })

  it('refuses a curve from two measured windows', () => {
    render(
      <EngagementAccumulation
        section={{ kind: 'ready', value: [bucket(0, 45), bucket(1, 19), bucket(2, null)] }}
      />,
    )
    expect(screen.getByText(/not enough to describe how your engagement arrives/i)).toBeTruthy()
  })

  it('states that the population moves between windows', () => {
    render(
      <EngagementAccumulation
        section={{
          kind: 'ready',
          value: [bucket(0, 45, 89), bucket(1, 19, 89), bucket(2, 14, 41)],
        }}
      />,
    )
    expect(screen.getByText(/across 41 to 89 posts depending on the window/i)).toBeTruthy()
  })
})
