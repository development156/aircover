import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ChannelBrowser, channelMatches, type BrowseSection } from './channel-browser'

/**
 * THE BROWSE LAYER, CHECKED ON THE PROPERTY THE FOUNDER ASKED FOR.
 *
 * The instruction was "keep this too, don't hide it — I want both new cards and
 * categories". So the assertions below are about COEXISTENCE, not about the
 * filter mechanics on their own: a rail that worked perfectly while dissolving
 * the three sections would satisfy every mechanical test and fail the brief.
 *
 * Every assertion reads rendered text or a role. None reads a class name.
 */

const tile = (name: string) => <div data-testid={`tile-${name}`}>{name} card</div>

const SECTIONS: BrowseSection[] = [
  {
    name: 'Your channels',
    lead: 'Linked accounts Sahoda can reach.',
    guide: 'connections.linked',
    items: [
      {
        id: 'instagram',
        label: 'Instagram',
        short: 'Instagram',
        kind: 'Social feed',
        tile: tile('instagram'),
      },
    ],
  },
  {
    name: 'Add a channel',
    lead: 'Every one of these opens a sign-in window.',
    guide: 'connections.connect_now',
    items: [
      { id: 'x', label: 'X', short: 'X', kind: 'Social feed', tile: tile('x') },
      { id: 'youtube', label: 'YouTube', short: 'YouTube', kind: 'Video', tile: tile('youtube') },
      {
        id: 'gbp',
        label: 'Google Business Profile',
        short: 'Google Business',
        kind: 'Local listing',
        tile: tile('gbp'),
      },
    ],
  },
  {
    name: 'Not available yet',
    lead: "Sahoda can't link these today.",
    guide: 'connections.coming_soon',
    items: [
      {
        id: 'snapchat',
        label: 'Snapchat',
        short: 'Snapchat',
        kind: 'Short video',
        tile: tile('snapchat'),
      },
    ],
  },
]

const headings = (): string[] =>
  screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '')

const visibleTiles = (): string[] =>
  screen
    .queryAllByTestId(/^tile-/)
    .map((el) => el.getAttribute('data-testid')?.replace('tile-', '') ?? '')

describe('the channel browse layer', () => {
  it('hides nothing until it is asked to', () => {
    render(<ChannelBrowser sections={SECTIONS} />)

    // ── THE CLAIM ────────────────────────────────────────────────────────────
    // A browse layer whose default state is anything other than "everything" is
    // a screen that has quietly lost channels. Every existing guard on this
    // route measures the unfiltered page, so this is also what keeps them
    // meaningful.
    expect(visibleTiles()).toEqual(['instagram', 'x', 'youtube', 'gbp', 'snapchat'])
    expect(headings()).toEqual(['Your channels', 'Add a channel', 'Not available yet'])
  })

  it('keeps the sections while filtering, rather than flattening them into one list', async () => {
    const user = userEvent.setup()
    render(<ChannelBrowser sections={SECTIONS} />)

    await user.click(screen.getByRole('button', { name: /^Social feed/ }))

    // ── THE CLAIM, AND IT IS THE BRIEF ───────────────────────────────────────
    // Instagram is linked and X is not. A filter that answered "show me social
    // feeds" by merging them into one grid would throw away the answer to
    // "which of mine are already live", which is this screen's first question.
    expect(visibleTiles()).toEqual(['instagram', 'x'])
    expect(headings()).toEqual(['Your channels', 'Add a channel'])

    // The tiles stay under the heading they belong to, not merely on the page.
    const linked = screen.getByRole('heading', { name: 'Your channels' }).closest('section')
    expect(linked).not.toBeNull()
    expect(within(linked as HTMLElement).getByTestId('tile-instagram')).toBeInTheDocument()
    expect(within(linked as HTMLElement).queryByTestId('tile-x')).toBeNull()
  })

  it('drops a section that has nothing left in it, and keeps its anchor with it', async () => {
    const user = userEvent.setup()
    render(<ChannelBrowser sections={SECTIONS} />)

    await user.click(screen.getByRole('button', { name: /^Video/ }))

    // An empty "Your channels" heading over nothing tells the reader they have
    // done nothing, which is not what a category filter was asked to say.
    expect(headings()).toEqual(['Add a channel'])
    expect(visibleTiles()).toEqual(['youtube'])
  })

  it('finds a channel by its full name, its short name and its category', async () => {
    const user = userEvent.setup()
    render(<ChannelBrowser sections={SECTIONS} />)
    const box = screen.getByRole('searchbox', { name: /search channels/i })

    await user.type(box, 'google')
    expect(visibleTiles()).toEqual(['gbp'])

    await user.clear(box)
    await user.type(box, 'Google Business')
    expect(visibleTiles()).toEqual(['gbp'])

    // The category is searchable too, so "video" finds YouTube without the
    // reader knowing YouTube is the answer.
    await user.clear(box)
    await user.type(box, 'video')
    expect(visibleTiles()).toEqual(['youtube', 'snapchat'])
  })

  it('builds the rail from the catalogue it was given, counts and all', () => {
    render(<ChannelBrowser sections={SECTIONS} />)

    // ── THE CLAIM ────────────────────────────────────────────────────────────
    // A hand-written category list is a second copy of `kind`, and the copy is
    // the one that drifts: a channel added under a new category would never
    // appear under it. Every category present must have a chip.
    for (const [name, count] of [
      ['Social feed', 2],
      ['Video', 1],
      ['Local listing', 1],
      ['Short video', 1],
    ] as const) {
      const chip = screen.getByRole('button', { name: new RegExp(`^${name}`) })
      expect(chip).toHaveTextContent(String(count))
    }
    expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent('5')
  })

  it('says how narrow the filter is, and only once one is on', async () => {
    const user = userEvent.setup()
    render(<ChannelBrowser sections={SECTIONS} />)

    // The reading is SPLIT by the `.num` spans that make the figures tabular, so
    // no single text node holds it. Read the PARAGRAPH's own text — and read the
    // paragraph rather than the whole body, because the rail's counts sit
    // immediately before it: the body text runs "…Video1" straight into
    // "1 of 5 channels", which defeated a `\b`-anchored match on the first try
    // and would have gone on matching the wrong digits.
    const reading = (): string =>
      screen
        .queryAllByText(
          (_c, el) => el?.tagName === 'P' && /of \d+ channels?/.test(el.textContent ?? ''),
        )
        .map((el) => (el.textContent ?? '').replace(/\s+/g, ' '))
        .join(' ')

    // A permanent "5 of 5" is a figure that never moves and so is never read.
    expect(reading()).toBe('')

    await user.click(screen.getByRole('button', { name: /^Video/ }))
    expect(reading()).toContain('1 of 5 channels')
  })

  it('offers a remedy that actually restores the cards, and never claims a lookup failed', async () => {
    const user = userEvent.setup()
    render(<ChannelBrowser sections={SECTIONS} />)

    // BOTH filters are set, and that is deliberate. The first version of this
    // test set only the search box, so "Clear filters" clearing the query and
    // leaving the category selected passed it — MEASURED, by making exactly that
    // change and watching all eleven stay green. A reset that resets one of two
    // things is the defect this exists to catch.
    await user.click(screen.getByRole('button', { name: /^Video/ }))
    await user.type(screen.getByRole('searchbox', { name: /search channels/i }), 'zzzz')
    expect(visibleTiles()).toEqual([])

    // ── THE CLAIM ────────────────────────────────────────────────────────────
    // `no-impossible-remedy.spec.ts` scans this route. Nothing was fetched and
    // nothing failed, so the empty state must not imply either — and the button
    // it offers has to genuinely work.
    expect(screen.getByText(/No channel matches that/i)).toBeInTheDocument()

    // ── THE FORBIDDEN CLAIM, NOT A FORBIDDEN WORD ────────────────────────────
    // The first draft of this line banned `/failed/` and went red on the
    // component's own sentence "nothing failed" — a guard that fired on copy
    // DENYING the thing it was written to prevent. What must never appear is a
    // claim that something was attempted and did not work, or a remedy that
    // would not help: a reload cannot widen a filter.
    const copy = (document.body.textContent ?? '').replace(/\s+/g, ' ')
    expect(copy).not.toMatch(/could ?n[o']t|unable to|went wrong|try again|reload|refresh/i)

    await user.click(screen.getAllByRole('button', { name: /clear filters/i })[0]!)
    expect(visibleTiles()).toEqual(['instagram', 'x', 'youtube', 'gbp', 'snapchat'])
    // The rail is back to All, not merely showing everything by accident.
    expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Video/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('tells a screen reader which category is on', async () => {
    const user = userEvent.setup()
    render(<ChannelBrowser sections={SECTIONS} />)

    const video = screen.getByRole('button', { name: /^Video/ })
    expect(video).toHaveAttribute('aria-pressed', 'false')
    await user.click(video)
    expect(video).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('channelMatches', () => {
  const item = {
    id: 'gbp',
    label: 'Google Business Profile',
    short: 'Google Business',
    kind: 'Local listing',
    tile: null,
  }

  it('matches an empty query, so an untouched search box hides nothing', () => {
    expect(channelMatches(item, '')).toBe(true)
    expect(channelMatches(item, '   ')).toBe(true)
  })

  it('ignores case and surrounding space, because people type both', () => {
    expect(channelMatches(item, '  GOOGLE  ')).toBe(true)
    expect(channelMatches(item, 'local listing')).toBe(true)
  })

  it('refuses a query that matches nothing on the entry', () => {
    expect(channelMatches(item, 'instagram')).toBe(false)
  })
})
