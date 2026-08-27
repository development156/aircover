import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// `ChannelTile` renders controls that call `router.refresh()`. This component
// never touches the router itself; the tiles it is handed do.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { ConnectionMarketplace, type MarketplaceSection } from './connection-marketplace'
import { ChannelTile } from './channel-tile'
import { CONNECTABLE, PLANNED } from '@/lib/connections/catalogue'

/**
 * THE BROWSE LAYER, OVER THE REAL CATALOGUE.
 *
 * Built from `CONNECTABLE` and `PLANNED` rather than from a fixture on purpose:
 * the properties worth guarding are "every channel this product has is still
 * reachable" and "no count was written down", and a fixture cannot fail either
 * one. Nothing here asserts a box size — text, roles and counts only.
 */

const sections = (): MarketplaceSection[] => [
  {
    key: 'connectable',
    name: 'Connect your channels',
    lead: 'Each card says what Sahoda can do there.',
    guide: 'connections.connect_now',
    items: CONNECTABLE.map((entry) => ({
      id: entry.id,
      label: entry.label,
      kind: entry.kind,
      blurb: entry.blurb,
      tile: <ChannelTile entry={entry} connections={[]} />,
    })),
  },
  {
    key: 'planned',
    name: 'More channels',
    lead: "Sahoda can't post to these yet.",
    guide: 'connections.coming_soon',
    items: PLANNED.map((entry) => ({
      id: entry.id,
      label: entry.label,
      kind: entry.kind,
      blurb: entry.blurb,
      tile: <ChannelTile entry={entry} connections={[]} />,
    })),
  },
]

const tiles = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-channel][data-connected]')).map((el) =>
    el.getAttribute('data-channel'),
  )

describe('what the page renders before anyone touches it', () => {
  it('shows every channel in the catalogue and nothing that is not in it', () => {
    const { container } = render(<ConnectionMarketplace sections={sections()} />)

    expect(tiles(container).sort()).toEqual(
      [...CONNECTABLE, ...PLANNED].map((entry) => entry.id).sort(),
    )
  })

  it('keeps both tour anchors', () => {
    const { container } = render(<ConnectionMarketplace sections={sections()} />)
    expect(container.querySelector('[data-guide="connections.connect_now"]')).not.toBeNull()
    expect(container.querySelector('[data-guide="connections.coming_soon"]')).not.toBeNull()
  })

  it('counts each category off the entries, never off a literal', () => {
    render(<ConnectionMarketplace sections={sections()} />)

    const all = [...CONNECTABLE, ...PLANNED]
    const nav = screen.getByRole('navigation', { name: /connection types/i })

    for (const kind of new Set(all.map((entry) => entry.kind))) {
      const expected = all.filter((entry) => entry.kind === kind).length
      // The COUNT is part of the accessible name, so this fails if the number
      // is wrong and also if it stops being announced.
      const button = within(nav).getByRole('button', {
        name: new RegExp(`^${kind}, ${expected} channels?$`),
      })
      expect(button.textContent, `${kind} shows its own count`).toContain(String(expected))
    }
    expect(
      within(nav).getByRole('button', { name: new RegExp(`^All, ${all.length} channels$`) }),
    ).toBeVisible()
  })

  it('says nothing about how many are showing until something is filtered', () => {
    render(<ConnectionMarketplace sections={sections()} />)
    expect(screen.queryByText(/showing/i)).toBeNull()
  })
})

describe('the category rail', () => {
  it('narrows to one category and marks it pressed', async () => {
    const user = userEvent.setup()
    const { container } = render(<ConnectionMarketplace sections={sections()} />)

    const social = screen.getByRole('button', { name: /^Social feed, / })
    await user.click(social)

    expect(social).toHaveAttribute('aria-pressed', 'true')
    const expected = [...CONNECTABLE, ...PLANNED]
      .filter((entry) => entry.kind === 'Social feed')
      .map((entry) => entry.id)
      .sort()
    expect(tiles(container).sort()).toEqual(expected)
  })

  it('drops a group heading rather than leaving it over nothing', async () => {
    const user = userEvent.setup()
    render(<ConnectionMarketplace sections={sections()} />)

    // Local listing is Google Business Profile alone, and it is connectable —
    // so the coming-soon group has no members and must not render its heading.
    await user.click(screen.getByRole('button', { name: /^Local listing, / }))

    expect(screen.getByRole('heading', { name: 'Connect your channels' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'More channels' })).toBeNull()
  })
})

describe('search', () => {
  it('filters by name as the person types', async () => {
    const user = userEvent.setup()
    const { container } = render(<ConnectionMarketplace sections={sections()} />)

    const total = CONNECTABLE.length + PLANNED.length

    await user.type(screen.getByRole('searchbox'), 'insta')
    expect(tiles(container)).toEqual(['instagram'])
    // The denominator comes from the catalogue, not from a number typed here.
    // It has already moved once — eight channels became fifteen on 2026-08-26 —
    // and a literal would have failed for being out of date rather than for
    // being wrong.
    expect(screen.getByText(/Showing/)).toHaveTextContent(`Showing 1 of ${total} channels.`)
  })

  it('finds a channel by its category, which is not part of its name', async () => {
    const user = userEvent.setup()
    const { container } = render(<ConnectionMarketplace sections={sections()} />)

    await user.type(screen.getByRole('searchbox'), 'broadcast')
    expect(tiles(container)).toEqual(['telegram'])
  })

  it('offers a remedy that works when nothing matches', async () => {
    const user = userEvent.setup()
    const { container } = render(<ConnectionMarketplace sections={sections()} />)

    await user.type(screen.getByRole('searchbox'), 'myspace')
    expect(tiles(container)).toEqual([])
    // The claim is about the SEARCH, and it quotes the words that failed.
    expect(screen.getByText(/matches “myspace”/)).toBeVisible()

    await user.click(screen.getByRole('button', { name: /clear search and filters/i }))
    expect(tiles(container).length).toBe(CONNECTABLE.length + PLANNED.length)
  })
})
