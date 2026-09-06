import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import { PlatformTable } from './platform-table'
import type { DailyMetricsRead } from '@/lib/analytics/daily-metrics'
import type { PlatformBreakdownRow } from '@/lib/analytics/platform-breakdown'

const READY: DailyMetricsRead = {
  kind: 'ready',
  days: [],
  platforms: [],
  attribution: 'received',
}

const row = (over: Partial<PlatformBreakdownRow> = {}): PlatformBreakdownRow => ({
  platform: 'instagram',
  posts: 9,
  likes: 40,
  comments: 10,
  shares: 5,
  saves: 5,
  clicks: 20,
  views: 900,
  impressions: 1000,
  reach: 800,
  engagementRate: 0.075,
  measuredParts: 4,
  ...over,
})

describe('PlatformTable', () => {
  it('draws every metric for a channel, with the rate as a percentage', () => {
    render(<PlatformTable read={READY} rows={[row()]} windowLabel="Last 30 days" />)
    const line = within(screen.getByRole('row', { name: /Instagram/ }))
    expect(line.getByText('40')).toBeTruthy()
    expect(line.getByText('900')).toBeTruthy()
    expect(line.getByText('7.5%')).toBeTruthy()
  })

  it('draws a dash for a metric that was not reported, never a zero', () => {
    render(
      <PlatformTable
        read={READY}
        rows={[row({ saves: null, engagementRate: null, measuredParts: 3 })]}
        windowLabel="Last 30 days"
      />,
    )
    // Two dashes: the missing metric and the rate that cannot be built on it.
    expect(screen.getAllByText('—').length).toBe(2)
    expect(screen.getByText(/rate is left blank where one of likes/i)).toBeTruthy()
  })

  it('keeps a measured zero as a zero', () => {
    render(
      <PlatformTable
        read={READY}
        rows={[row({ saves: 0, engagementRate: 0 })]}
        windowLabel="Last 30 days"
      />,
    )
    expect(screen.getByText('0')).toBeTruthy()
    expect(screen.queryByText('—')).toBeNull()
  })

  it('shows an unfamiliar platform under the name it arrived with', () => {
    // `tiktok` is not one of this product's channels. A guessed label on a row
    // of real numbers is worse than an unfamiliar one.
    render(
      <PlatformTable
        read={READY}
        rows={[row({ platform: 'tiktok' })]}
        windowLabel="Last 30 days"
      />,
    )
    expect(screen.getByText('tiktok')).toBeTruthy()
  })

  it('separates "nothing connected", "could not read" and "asked and got none"', () => {
    const sentences = new Set<string>()
    const reads: DailyMetricsRead[] = [{ kind: 'not-connected' }, { kind: 'unreadable' }, READY]
    for (const read of reads) {
      const { unmount } = render(<PlatformTable read={read} rows={[]} windowLabel="Last 30 days" />)
      sentences.add(document.body.textContent ?? '')
      unmount()
    }
    expect(sentences.size).toBe(3)
  })

  it('offers no remedy for a read that came back empty', () => {
    // Nothing failed and nothing is missing. A "connect a channel" button here
    // would send somebody to fix a thing that is not broken.
    render(<PlatformTable read={READY} rows={[]} windowLabel="Last 30 days" />)
    expect(
      screen.getByText(/asked your connected accounts and none of them reported/i),
    ).toBeTruthy()
    expect(screen.queryByText(/Connecting a channel starts this table/i)).toBeNull()
  })
})
