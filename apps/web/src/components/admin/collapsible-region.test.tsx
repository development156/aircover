import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CollapseNote, CollapsibleRegion } from './collapsible-region'
import { DevRegions } from './dev-regions'
import { COLLAPSE_STORAGE_KEY_PREFIX } from '@/lib/ops/use-collapse'

beforeEach(() => {
  window.localStorage.clear()
})

describe('nothing red may be hidden by a collapse', () => {
  it('shows the red line on the header while the region is CLOSED', () => {
    // The rule that outranks the rest (SL-062 §5). A collapsed region must not
    // be quieter than an open one.
    render(
      <CollapsibleRegion
        id="board"
        title="Board"
        red="3 blocked or failing"
        open={false}
        onToggle={() => {}}
      >
        <p>the cards</p>
      </CollapsibleRegion>,
    )

    expect(screen.getByText('3 blocked or failing')).toBeInTheDocument()
    expect(screen.queryByText('the cards')).toBeNull()
  })

  it('keeps saying it when the region is open, in the same words', () => {
    render(
      <CollapsibleRegion
        id="board"
        title="Board"
        red="3 blocked or failing"
        open
        onToggle={() => {}}
      >
        <p>the cards</p>
      </CollapsibleRegion>,
    )
    expect(screen.getByText('3 blocked or failing')).toBeInTheDocument()
    expect(screen.getByText('the cards')).toBeInTheDocument()
  })

  it('says nothing when there is nothing red — silence must mean clean', () => {
    render(
      <CollapsibleRegion id="board" title="Board" open={false} onToggle={() => {}}>
        <p>the cards</p>
      </CollapsibleRegion>,
    )
    expect(screen.queryByText(/blocked or failing/)).toBeNull()
  })

  it('carries the red on the border as well as in words', () => {
    const { container } = render(
      <CollapsibleRegion id="board" title="Board" red="1 blocked" open={false} onToggle={() => {}}>
        <p>x</p>
      </CollapsibleRegion>,
    )
    expect(container.querySelector('section')!.className).toContain('border-danger')
  })
})

describe('every region starts collapsed except the hero card', () => {
  const slots = {
    strips: <p>strips content</p>,
    board: <p>board content</p>,
    changelog: <p>changelog content</p>,
    charts: <p>charts content</p>,
  }

  it('renders no region content on first paint', () => {
    render(<DevRegions adminId="user_a" {...slots} />)

    for (const text of ['strips content', 'board content', 'changelog content', 'charts content']) {
      expect(screen.queryByText(text)).toBeNull()
    }
    // But the headers are all there, so nothing is missing — only folded.
    expect(screen.getByRole('button', { name: /Board/ })).toBeInTheDocument()
  })

  it('opens one region without opening the others', async () => {
    render(<DevRegions adminId="user_a" {...slots} />)
    await userEvent.click(screen.getByRole('button', { name: /Board/ }))

    expect(screen.getByText('board content')).toBeInTheDocument()
    expect(screen.queryByText('charts content')).toBeNull()
  })

  it('still shows red on a collapsed board header', () => {
    render(<DevRegions adminId="user_a" boardRed="2 blocked or failing" {...slots} />)
    expect(screen.getByText('2 blocked or failing')).toBeInTheDocument()
    expect(screen.queryByText('board content')).toBeNull()
  })

  it('states the per-browser tradeoff on the page rather than glossing it', () => {
    render(<CollapseNote />)
    expect(screen.getByText(/remembered in this browser only/)).toBeInTheDocument()
    expect(screen.getByText(/Nothing red is ever hidden/)).toBeInTheDocument()
  })
})

describe('the choice is remembered per admin, in this browser', () => {
  const slots = {
    strips: <p>strips content</p>,
    board: <p>board content</p>,
    changelog: <p>changelog content</p>,
    charts: <p>charts content</p>,
  }

  it('writes the choice under a key naming the admin', async () => {
    render(<DevRegions adminId="user_a" {...slots} />)
    await userEvent.click(screen.getByRole('button', { name: /Board/ }))

    const raw = window.localStorage.getItem(`${COLLAPSE_STORAGE_KEY_PREFIX}user_a`)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!)).toEqual({ board: true })
  })

  it('restores it on the next visit', async () => {
    window.localStorage.setItem(
      `${COLLAPSE_STORAGE_KEY_PREFIX}user_a`,
      JSON.stringify({ board: true }),
    )
    render(<DevRegions adminId="user_a" {...slots} />)

    expect(await screen.findByText('board content')).toBeInTheDocument()
  })

  it('does not hand one admin another admin’s layout on a shared machine', () => {
    window.localStorage.setItem(
      `${COLLAPSE_STORAGE_KEY_PREFIX}user_a`,
      JSON.stringify({ board: true }),
    )
    render(<DevRegions adminId="user_b" {...slots} />)

    expect(screen.queryByText('board content')).toBeNull()
  })

  it('ignores a corrupted stored value rather than opening regions from it', () => {
    window.localStorage.setItem(`${COLLAPSE_STORAGE_KEY_PREFIX}user_a`, 'not json at all')
    render(<DevRegions adminId="user_a" {...slots} />)

    expect(screen.queryByText('board content')).toBeNull()
  })

  it('ignores stored entries that are not booleans', () => {
    // Coercing would silently open a region from somebody else's data.
    window.localStorage.setItem(
      `${COLLAPSE_STORAGE_KEY_PREFIX}user_a`,
      JSON.stringify({ board: 'yes', charts: 1 }),
    )
    render(<DevRegions adminId="user_a" {...slots} />)

    expect(screen.queryByText('board content')).toBeNull()
    expect(screen.queryByText('charts content')).toBeNull()
  })

  it('fails collapsed, not open, when storage is unavailable', async () => {
    // The safe direction: a region never flashes open with something in it.
    const original = window.localStorage.getItem
    window.localStorage.getItem = () => {
      throw new Error('storage disabled')
    }
    try {
      render(<DevRegions adminId="user_a" {...slots} />)
      expect(screen.queryByText('board content')).toBeNull()
    } finally {
      window.localStorage.getItem = original
    }
  })
})

describe('a linked card is never left behind a collapsed region', () => {
  const slots = {
    strips: <p>strips content</p>,
    board: <p>board content</p>,
    changelog: <p>changelog content</p>,
    charts: <p>charts content</p>,
  }

  afterEach(() => {
    window.location.hash = ''
  })

  it('opens the board region when the URL points at a card', () => {
    window.location.hash = '#task-SL-040'
    render(<DevRegions adminId="user_a" {...slots} />)

    expect(screen.getByText('board content')).toBeInTheDocument()
  })

  it('opens only the board — a card link is not a reason to unfold the page', () => {
    window.location.hash = '#task-SL-040'
    render(<DevRegions adminId="user_a" {...slots} />)

    expect(screen.queryByText('charts content')).toBeNull()
  })

  it('does not write the override into the stored preference', () => {
    // Following one blocked-card link must not silently re-open the board for
    // this admin forever.
    window.location.hash = '#task-SL-040'
    render(<DevRegions adminId="user_a" {...slots} />)

    expect(window.localStorage.getItem(`${COLLAPSE_STORAGE_KEY_PREFIX}user_a`)).toBeNull()
  })

  it('ignores a hash that is not a card anchor', () => {
    window.location.hash = '#changelog'
    render(<DevRegions adminId="user_a" {...slots} />)

    expect(screen.queryByText('board content')).toBeNull()
  })
})
