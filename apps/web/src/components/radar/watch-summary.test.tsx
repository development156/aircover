import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { creditCost } from '@sahoda/shared'

import { WatchSummary } from './watch-summary'
import type { Competitor } from '@/lib/radar/types'

const watch = (over: Partial<Competitor> = {}): Competitor => ({
  id: crypto.randomUUID(),
  name: 'Sunrise Bakery',
  url: 'https://example.com',
  kind: 'website',
  addedOn: '2026-08-01',
  lastObservedAt: null,
  ...over,
})

describe('WatchSummary', () => {
  it('prints the price this product actually charges', () => {
    // The reference showed "15 credits / scan". What a customer is charged is
    // `radar_scan` in pricing.config.json, and a screen about money that prints
    // a price nobody pays is the one defect this product may never ship. The
    // assertion reads the config rather than a literal, so it stays true when
    // the price is repriced.
    // ── THIS GUARD DID NOT BITE ON ITS FIRST DRAFT ──────────────────────
    // It read `toHaveTextContent(String(creditCost('radar_scan')))`, which is a
    // SUBSTRING match. The real price is 5; hardcoding the reference's 15 left
    // it green, because "15" contains "5". The exact defect the test is named
    // for was invisible to it, and a guard that has not been watched fail is
    // not a guard. Exact string, both directions.
    render(<WatchSummary competitors={[watch()]} />)
    const price = document.querySelector('[data-credit-price="radar_scan"]')
    expect(price).not.toBeNull()
    expect(price!.textContent).toBe(String(creditCost('radar_scan')))
    // And the reference's figure specifically, since that is the number a
    // careless copy of the mockup would ship.
    expect(price!.textContent).not.toBe('15')
  })

  it('offers no Paused figure, because nothing can pause a watch', () => {
    // `Competitor` has no paused flag, the store has no column for one, and no
    // control anywhere can set one. A tile reading "Paused 0" advertises a
    // switch the reader will then go looking for.
    render(<WatchSummary competitors={[watch(), watch()]} />)
    expect(screen.queryByText(/paused/i)).toBeNull()
  })

  it('splits the list by whether a scan has actually happened', () => {
    // The real third figure. `lastObservedAt` is null until a read SUCCEEDS, so
    // this is the question the card is opened to answer: has anything been read
    // yet, or is the first scan still coming.
    render(
      <WatchSummary
        competitors={[
          watch({ lastObservedAt: '2026-08-20T09:00:00.000Z' }),
          watch({ lastObservedAt: null }),
          watch({ lastObservedAt: null }),
        ]}
      />,
    )
    expect(screen.getByText('Watching').closest('div')).toHaveTextContent('3')
    expect(screen.getByText('Read once').closest('div')).toHaveTextContent('1')
    expect(screen.getByText('Waiting').closest('div')).toHaveTextContent('2')
  })

  it('says a sentence rather than three zeroes when nobody is watched', () => {
    render(<WatchSummary competitors={[]} />)
    expect(screen.queryByText('Watching')).toBeNull()
    expect(screen.getByText(/Nobody yet/)).toBeInTheDocument()
  })

  it('points "View all watches" at the list on this page, not at a route', () => {
    // The reference implied a screen that does not exist. A control that goes
    // nowhere is the impossible remedy `no-impossible-remedy.spec.ts` forbids,
    // wearing navigation chrome.
    render(<WatchSummary competitors={[watch()]} />)
    expect(screen.getByRole('link', { name: /View all watches/ })).toHaveAttribute(
      'href',
      '#radar-watch-list',
    )
  })

  it('offers no link at all when there is nothing to look at', () => {
    render(<WatchSummary competitors={[]} />)
    expect(screen.queryByRole('link', { name: /View all watches/ })).toBeNull()
  })
})
