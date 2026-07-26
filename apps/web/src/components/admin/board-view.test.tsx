import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { BoardView } from './board-view'
import type { BoardCard } from '@/lib/ops/board'

function card(over: Partial<BoardCard> & Pick<BoardCard, 'code' | 'column'>): BoardCard {
  return {
    title: `Title ${over.code}`,
    detail: null,
    roadmapCode: 'AO3',
    assignee: 'claude',
    blocked: false,
    blockedReason: null,
    commitSha: null,
    prRef: null,
    qa: 'none',
    ageMs: 60_000,
    movedBy: 'claude',
    ...over,
  }
}

const CARDS: BoardCard[] = [
  card({ code: 'SL-001', column: 'done', commitSha: 'aa26599aaaaaaaa', qa: 'pass' }),
  card({ code: 'SL-016', column: 'in_progress' }),
  card({ code: 'SL-017', column: 'todo', assignee: 'divas', roadmapCode: 'AO3' }),
  card({ code: 'SL-036', column: 'todo', roadmapCode: null, blocked: true }),
]

describe('BoardView', () => {
  it('renders all four columns with counts, including empty ones', () => {
    // An absent column would silently lose its cards rather than show zero.
    render(<BoardView cards={CARDS} />)

    for (const label of ['To Do', 'In Progress', 'For Review', 'Done']) {
      expect(screen.getByRole('heading', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('filters by assignee and says how many of how many are showing', async () => {
    render(<BoardView cards={CARDS} />)
    await userEvent.click(screen.getByRole('button', { name: 'Divas' }))

    expect(screen.getByText('Showing 1 of 4')).toBeInTheDocument()
    expect(screen.queryByText('Title SL-016')).toBeNull()
  })

  it('hides unlinked cards when a stage is selected, rather than filing them under it', async () => {
    render(<BoardView cards={CARDS} />)
    await userEvent.click(screen.getByRole('button', { name: 'AO' }))

    expect(screen.queryByText('Title SL-036')).toBeNull()
    expect(screen.getByText('Title SL-016')).toBeInTheDocument()
  })

  it('distinguishes an empty column from one emptied by a filter', async () => {
    render(<BoardView cards={CARDS} />)
    await userEvent.click(screen.getByRole('button', { name: /^Blocked/ }))

    expect(screen.getAllByText('Nothing here matches the filters').length).toBeGreaterThan(0)
  })

  it('disables the blocked filter when nothing is blocked, and says why', () => {
    const unblocked = CARDS.filter((c) => !c.blocked)
    render(<BoardView cards={unblocked} />)

    const button = screen.getByRole('button', { name: 'Blocked' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Nothing is blocked')
  })

  it('nudges past the WIP threshold without removing anything', async () => {
    // A nudge, never a block (§10). Every card must still be on screen.
    const busy = Array.from({ length: 6 }, (_, i) =>
      card({ code: `SL-1${i}0`, column: 'in_progress' }),
    )
    render(<BoardView cards={busy} />)

    expect(screen.getByText(/6 cards in progress/)).toBeInTheDocument()
    expect(screen.getAllByText(/^Title SL-1/)).toHaveLength(6)
  })

  it('gives every card the anchor the roadmap checklist links to', () => {
    const { container } = render(<BoardView cards={CARDS} />)
    expect(container.querySelector('#task-SL-036')).not.toBeNull()
  })

  it('says a blocked card has no reason rather than staying silent', () => {
    // Silence would read as "blocked for a good reason". It is not one.
    render(<BoardView cards={[card({ code: 'SL-036', column: 'todo', blocked: true })]} />)
    expect(screen.getByText('Blocked, with no reason recorded.')).toBeInTheDocument()
  })

  it('shows a short commit sha on a done card', () => {
    render(<BoardView cards={CARDS} />)
    const done = screen.getByText('Title SL-001').closest('article')!
    expect(within(done).getByText('aa26599')).toBeInTheDocument()
  })

  it('labels a card with no QA run as having none, not as passing', () => {
    render(<BoardView cards={[card({ code: 'SL-016', column: 'todo' })]} />)
    expect(screen.getByText('No QA run recorded')).toBeInTheDocument()
  })
})
