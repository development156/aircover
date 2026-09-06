import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { creditCost } from '@sahoda/shared'

import { WatchBoard } from './watch-board'
import { WatchCard } from './watch-card'
import { watchCards } from '@/lib/radar/cards'
import type { Competitor } from '@/lib/radar/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/actions/radar', () => ({
  addCompetitor: vi.fn(),
  removeCompetitor: vi.fn(),
}))

const NEXT_SCAN = '2026-09-07'

const watch = (over: Partial<Competitor> = {}): Competitor => ({
  id: 'comp-sunrise',
  name: 'Sunrise Bakery',
  url: 'https://example.com',
  kind: 'website',
  addedOn: '2026-08-01',
  lastObservedAt: null,
  ...over,
})

/**
 * The whole composition, exactly as `page.tsx` assembles it: the board holds the
 * state and the filter, and the cards arrive as nodes the server rendered. A
 * test that rendered the board alone would assert nothing about what a card says.
 */
function board(competitors: Competitor[], scanArmed = true) {
  const cards = watchCards({ collector: 'reading', competitors, days: [] })
  return render(
    <WatchBoard
      items={cards.map((card) => ({
        id: card.competitor.id,
        changed: card.status.claim === 'changed',
        card: <WatchCard card={card} nextScan={NEXT_SCAN} scanArmed={scanArmed} />,
      }))}
      scope={null}
      nextScan={NEXT_SCAN}
      perScan={creditCost('radar_scan')}
    />,
  )
}

/**
 * ── FOUR OF THESE CAME OFF A COMPONENT THAT NO LONGER EXISTS ────────────────
 * `watch-summary.tsx` held a three-figure tile block, the price, and a "View all
 * watches" link. The 2026-09-06 redesign retires it: the counts are the list
 * itself, and the price moved onto the form that commits the charge. The tests
 * that pinned the tiles went with it. These did NOT — each states a rule about
 * what this screen may say, and a rule does not stop applying because the
 * element carrying it moved.
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
    const figures = [...container.querySelectorAll('.num')].map((n) => n.textContent)
    expect(figures).toEqual([String(creditCost('radar_scan'))])
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

  it('states the day of the next read, and promises none when the pass is off', () => {
    board([watch()])
    expect(screen.getByText(/next check/i).textContent).toContain(NEXT_SCAN)

    board([watch()], false)
    expect(screen.getAllByText(/switched off/i).length).toBeGreaterThan(0)
  })

  /**
   * ── THE MARK IS THE PLATFORM'S OWN, NOT A STAND-IN FOR IT ─────────────────
   * The card used to draw an at-sign for Instagram and a map pin for a Google
   * listing, while the Connections screen showed the same person the real marks.
   * Asserted through `data-mark`, which `brand-marks.tsx` puts on every mark for
   * exactly this: they carry no text, no title and no accessible name, so a
   * screen that swapped one for a grey glyph would otherwise pass every
   * assertion anyone could write about it. Matching on the brand hex instead is
   * refused by `design-lint.mjs`, and rightly.
   */
  it("draws the platform's own mark for an Instagram account", () => {
    const { container } = board([watch({ kind: 'instagram', name: 'Sunrise on Instagram' })])
    expect(container.querySelector('[data-mark="instagram"]')).not.toBeNull()
  })

  it('draws no brand mark for a plain website, because a website has none', () => {
    const { container } = board([watch({ kind: 'website' })])
    expect(container.querySelector('[data-mark]')).toBeNull()
  })

  it('draws the Google mark for a Google Business Profile', () => {
    const { container } = board([watch({ kind: 'google_business' })])
    expect(container.querySelector('[data-mark="google"]')).not.toBeNull()
  })

  it('shows the filter only where the third tab can be anything but empty', () => {
    // Every business quiet: a "Changed" tab that always reads nothing is chrome
    // teaching the reader that the feature is broken.
    board([watch({ lastObservedAt: '2026-09-02T03:41:00.000Z' })])
    expect(screen.queryByRole('group', { name: /filter the watch list/i })).toBeNull()
  })
})
