import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { creditCost } from '@sahoda/shared'

import { WatchBoard } from './watch-board'
import { watchCards } from '@/lib/radar/cards'
import type { Competitor } from '@/lib/radar/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/actions/radar', () => ({
  addCompetitor: vi.fn(),
  removeCompetitor: vi.fn(),
}))

const watch = (over: Partial<Competitor> = {}): Competitor => ({
  id: 'comp-sunrise',
  name: 'Sunrise Bakery',
  url: 'https://example.com',
  kind: 'website',
  addedOn: '2026-08-01',
  lastObservedAt: null,
  ...over,
})

function board(competitors: Competitor[]) {
  return render(
    <WatchBoard
      cards={watchCards({ collector: 'reading', competitors, days: [] })}
      nextScan="2026-09-07"
      scanArmed
      perScan={creditCost('radar_scan')}
      scanning
    />,
  )
}

/**
 * ── THESE FOUR GUARANTEES CAME OFF A COMPONENT THAT NO LONGER EXISTS ────────
 * `watch-summary.tsx` held a three-figure tile block, the price, and a "View all
 * watches" link. The 2026-09-06 redesign retires it: the counts are the list
 * itself, and the price moved onto the form that commits the charge. The tests
 * that pinned the tiles went with it. The four below did NOT — each states a
 * rule about what this screen may say, and a rule does not stop applying because
 * the element carrying it moved.
 */
describe('the watch board', () => {
  it('prints the price this product actually charges, on the control that charges it', () => {
    // The reference showed "15 credits / scan". What a customer is charged is
    // `radar_scan` in pricing.config.json, and a screen about money that prints
    // a price nobody pays is the one defect this product may never ship.
    // ── THIS GUARD DID NOT BITE ON ITS FIRST DRAFT ──────────────────────
    // It read `toHaveTextContent(String(creditCost('radar_scan')))`, which is a
    // SUBSTRING match. The real price is 5; hardcoding the reference's 15 left
    // it green, because "15" contains "5". Exact string, both directions.
    board([])
    const price = document.querySelector('[data-credit-price="radar_scan"]')
    expect(price).not.toBeNull()
    expect(price!.textContent).toBe(String(creditCost('radar_scan')))
    expect(price!.textContent).not.toBe('15')
  })

  it('offers no Paused status, because nothing can pause a watch', () => {
    // `Competitor` has no paused flag, the store has no column for one, and no
    // control anywhere can set one. A chip reading "Paused" advertises a switch
    // the reader will then go looking for.
    board([watch(), watch({ id: 'comp-mill', name: 'The Mill House' })])
    expect(screen.queryByText(/paused/i)).toBeNull()
  })

  it('prints no figure at all about a list nobody is on', () => {
    // The retired summary drew "Watching 0 · Read 0 · Waiting 0". Three zeroes
    // are a worse sentence than the one sentence they replace, and a zero about
    // the reader's own business is the figure this product is most careful with.
    const { container } = board([])
    expect(container.querySelector('.num')?.textContent).toBe(String(creditCost('radar_scan')))
    expect(screen.queryByRole('group', { name: /filter the watch list/i })).toBeNull()
  })

  it('sends "View details" to a route that exists, per watched business', () => {
    // The reference's "View all watches" implied a screen that does not exist,
    // and a control that goes nowhere is the impossible remedy
    // `no-impossible-remedy.spec.ts` forbids, wearing navigation chrome.
    // `/radar/<id>` is a real route: app/(app)/radar/[id]/page.tsx.
    board([watch()])
    expect(screen.getByRole('link', { name: /view details/i })).toHaveAttribute(
      'href',
      '/radar/comp-sunrise',
    )
  })

  /**
   * ── THE SENTENCE THE REFERENCE PUTS ON EVERY CARD ─────────────────────────
   * "No meaningful changes detected." A business nobody has read has not been
   * found quiet. `cards.ts` derives the claim; this asserts the screen renders
   * the derivation rather than flattening it back into one line.
   */
  it('never calls an unread business quiet', () => {
    board([watch({ lastObservedAt: null })])
    expect(screen.getByText(/nothing has been read yet/i)).toBeTruthy()
    expect(screen.queryByText(/^Read, and nothing moved\.$/)).toBeNull()
  })

  it('says nothing moved only where Radar actually looked', () => {
    board([watch({ lastObservedAt: '2026-09-02T03:41:00.000Z' })])
    expect(screen.getByText(/read, and nothing moved/i)).toBeTruthy()
  })

  it('states the day of the next read, and does not promise one when the pass is off', () => {
    const competitors = [watch()]
    const { rerender } = board(competitors)
    expect(screen.getByText(/next check/i).textContent).toContain('2026-09-07')

    rerender(
      <WatchBoard
        cards={watchCards({ collector: 'reading', competitors, days: [] })}
        nextScan="2026-09-07"
        scanArmed={false}
        perScan={creditCost('radar_scan')}
        scanning
      />,
    )
    expect(screen.queryByText(/next check/i)).toBeNull()
    expect(screen.getByText(/switched off/i)).toBeTruthy()
  })
})
