import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

/**
 * The four-column board is now behind a toggle — the DEFAULT view is the
 * rolled-up summary (SL-062 §3). Every test in the block below describes the
 * full board, so it opens it first. No assertion was weakened to make the split
 * pass: they are the same expectations, one click later.
 */
async function renderFullBoard(props: Parameters<typeof BoardView>[0]) {
  const utils = render(<BoardView {...props} />)
  await userEvent.click(screen.getByRole('button', { name: /^Show all/ }))
  return utils
}

describe('BoardView — the full board, behind Show all', () => {
  it('renders all four columns with counts, including empty ones', async () => {
    // An absent column would silently lose its cards rather than show zero.
    await renderFullBoard({ cards: CARDS })

    for (const label of ['To Do', 'In Progress', 'For Review', 'Done']) {
      expect(screen.getByRole('heading', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('filters by assignee and says how many of how many are showing', async () => {
    await renderFullBoard({ cards: CARDS })
    await userEvent.click(screen.getByRole('button', { name: 'Divas' }))

    expect(screen.getByText('Showing 1 of 4')).toBeInTheDocument()
    expect(screen.queryByText('Title SL-016')).toBeNull()
  })

  it('hides unlinked cards when a stage is selected, rather than filing them under it', async () => {
    await renderFullBoard({ cards: CARDS })
    await userEvent.click(screen.getByRole('button', { name: 'AO' }))

    expect(screen.queryByText('Title SL-036')).toBeNull()
    expect(screen.getByText('Title SL-016')).toBeInTheDocument()
  })

  it('distinguishes an empty column from one emptied by a filter', async () => {
    await renderFullBoard({ cards: CARDS })
    await userEvent.click(screen.getByRole('button', { name: /^Blocked/ }))

    expect(screen.getAllByText('Nothing here matches the filters').length).toBeGreaterThan(0)
  })

  it('disables the blocked filter when nothing is blocked, and says why', async () => {
    const unblocked = CARDS.filter((c) => !c.blocked)
    await renderFullBoard({ cards: unblocked })

    const button = screen.getByRole('button', { name: 'Blocked' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Nothing is blocked')
  })

  it('nudges past the WIP threshold without removing anything', async () => {
    // A nudge, never a block (§10). Every card must still be on screen.
    const busy = Array.from({ length: 6 }, (_, i) =>
      card({ code: `SL-1${i}0`, column: 'in_progress' }),
    )
    await renderFullBoard({ cards: busy })

    expect(screen.getByText(/6 cards in progress/)).toBeInTheDocument()
    expect(screen.getAllByText(/^Title SL-1/)).toHaveLength(6)
  })

  it('gives every card the anchor the roadmap checklist links to', async () => {
    const { container } = await renderFullBoard({ cards: CARDS })
    expect(container.querySelector('#task-SL-036')).not.toBeNull()
  })

  it('says a blocked card has no reason rather than staying silent', async () => {
    // Silence would read as "blocked for a good reason". It is not one.
    await renderFullBoard({ cards: [card({ code: 'SL-036', column: 'todo', blocked: true })] })
    expect(screen.getByText('Blocked, with no reason recorded.')).toBeInTheDocument()
  })

  it('shows a short commit sha on a done card', async () => {
    await renderFullBoard({ cards: CARDS })
    const done = screen.getByText('Title SL-001').closest('article')!
    expect(within(done).getByText('aa26599')).toBeInTheDocument()
  })

  it('labels a card with no QA run as having none, not as passing', async () => {
    await renderFullBoard({ cards: [card({ code: 'SL-016', column: 'todo' })] })
    expect(screen.getByText('No QA run recorded')).toBeInTheDocument()
  })
})

describe('write controls appear only for a seat that may write', () => {
  it('gives a viewer no move control, no archive and no add', async () => {
    // The rule: never ship a control that silently does nothing. A viewer's
    // write would be refused by app.ops_writer() with 42501, so the control is
    // absent rather than present-and-doomed.
    await renderFullBoard({ cards: CARDS, canWrite: false })

    expect(screen.queryByLabelText(/Move SL-016 to another column/)).toBeNull()
    expect(screen.queryByLabelText(/Archive SL-016/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Add a card/ })).toBeNull()
  })

  it('gives a writer all three', async () => {
    await renderFullBoard({ cards: CARDS, canWrite: true })

    expect(screen.getByLabelText(/Move SL-016 to another column/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Archive SL-016/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add a card/ })).toBeInTheDocument()
  })

  it('makes cards draggable only for a writer', async () => {
    const { rerender, container } = await renderFullBoard({ cards: CARDS, canWrite: false })
    expect(container.querySelectorAll('[draggable="true"]')).toHaveLength(0)

    rerender(<BoardView cards={CARDS} canWrite />)
    expect(container.querySelectorAll('[draggable="true"]')).toHaveLength(CARDS.length)
  })

  it('offers every column as a move target, including the one it is in', async () => {
    // The current column stays selectable so the select reads as state, not as
    // a list of "somewhere else". Choosing it is a no-op that never posts.
    await renderFullBoard({ cards: CARDS, canWrite: true })

    const select = screen.getByLabelText(/Move SL-016 to another column/)
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['To Do', 'In Progress', 'For Review', 'Done'])
    expect((select as HTMLSelectElement).value).toBe('in_progress')
  })
})

/**
 * The DEFAULT view (SL-062 §3) and the rule that outranks the rest (§5).
 *
 * The rollup arithmetic is proven in `lib/ops/rollup.test.ts`; what is proven
 * here is that the SCREEN cannot hide what the rollup found — the red line is
 * rendered on the collapsed face, and no filter or collapse can remove it.
 */
describe('the rolled-up summary is what a reader sees first', () => {
  it('defaults to stage summaries rather than to 62 cards', () => {
    render(<BoardView cards={CARDS} stageLabels={{ AO3: 'The dashboard itself' }} />)

    expect(screen.getByRole('heading', { name: 'The dashboard itself' })).toBeInTheDocument()
    // The four-column board is not on screen until asked for.
    expect(screen.queryByRole('heading', { name: 'For Review' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Show all 4 cards' })).toBeInTheDocument()
  })

  it('keeps stages collapsed, so the summary is a summary', () => {
    render(<BoardView cards={CARDS} />)
    expect(screen.queryByText('Title SL-016')).toBeNull()
  })

  it('expands one stage to its cards without leaving the summary', async () => {
    render(<BoardView cards={CARDS} stageLabels={{ AO3: 'The dashboard itself' }} />)
    await userEvent.click(screen.getByRole('button', { name: /The dashboard itself/ }))

    expect(screen.getByText('Title SL-016')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Show all/ })).toBeInTheDocument()
  })

  it('NAMES a blocked card on the collapsed face of its stage', () => {
    // §5, the rule that outranks the rest. SL-036 is blocked and has no roadmap
    // code, so it lands in "Found along the way" — and that summary must say so
    // while still collapsed.
    render(<BoardView cards={CARDS} />)

    const heading = screen.getByRole('heading', { name: 'Found along the way' })
    const summary = heading.closest('section')!
    expect(within(summary).getByText('SL-036 blocked')).toBeInTheDocument()
  })

  it('names a failing card on the collapsed face too', () => {
    render(<BoardView cards={[card({ code: 'SL-009', column: 'review', qa: 'fail' })]} />)
    expect(screen.getByText('SL-009 failing tests')).toBeInTheDocument()
  })

  it('counts the red on the board header in both views', async () => {
    render(<BoardView cards={CARDS} />)
    expect(screen.getByText('1 blocked or failing')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^Show all/ }))
    expect(screen.getByText('1 blocked or failing')).toBeInTheDocument()
  })

  it('says nothing about red when nothing is red — silence must mean clean', () => {
    render(<BoardView cards={CARDS.filter((c) => !c.blocked)} />)
    expect(screen.queryByText(/blocked or failing/)).toBeNull()
  })

  it('a filter cannot hide red from the summary, because the summary ignores filters', async () => {
    // The failure this guards: filtering the full board to one assignee, then
    // switching back to the summary, and finding a stage that now reads clean
    // because the blocked card was filtered out from underneath it.
    render(<BoardView cards={CARDS} />)
    await userEvent.click(screen.getByRole('button', { name: /^Show all/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Divas' }))
    await userEvent.click(screen.getByRole('button', { name: 'Show summary' }))

    expect(screen.getByText('SL-036 blocked')).toBeInTheDocument()
    expect(screen.getByText('1 blocked or failing')).toBeInTheDocument()
  })

  it('falls back to the roadmap code rather than an empty heading', () => {
    render(<BoardView cards={CARDS} />)
    expect(screen.getByRole('heading', { name: 'AO3' })).toBeInTheDocument()
  })
})

/**
 * The Done column is capped (SL-062 §4) — but the cap obeys §5 like everything
 * else on this page: it may hide FINISHED work, never RED work.
 */
describe('the Done column is capped without hiding anything red', () => {
  const done = (n: number) =>
    Array.from({ length: n }, (_, i) => card({ code: `SL-D${i}`, column: 'done' }))

  async function fullBoard(cards: BoardCard[]) {
    render(<BoardView cards={cards} />)
    await userEvent.click(screen.getByRole('button', { name: /^Show all/ }))
  }

  it('holds back the extra finished cards and offers them', async () => {
    await fullBoard(done(20))
    expect(screen.getByRole('button', { name: 'Show 12 more finished' })).toBeInTheDocument()
  })

  it('shows the FULL count in the column header, not the capped one', async () => {
    // A capped column reporting its capped count would understate the board.
    await fullBoard(done(20))
    const heading = screen.getByRole('heading', { name: 'Done' })
    expect(heading.parentElement!.textContent).toContain('20')
  })

  it('reveals the rest when asked', async () => {
    await fullBoard(done(20))
    await userEvent.click(screen.getByRole('button', { name: 'Show 12 more finished' }))

    expect(screen.getByText('Title SL-D19')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /more finished/ })).toBeNull()
  })

  it('NEVER caps away a blocked card, however far down the column it sits', async () => {
    const cards = [...done(19), card({ code: 'SL-STUCK', column: 'done', blocked: true })]
    await fullBoard(cards)

    expect(screen.getByText('Title SL-STUCK')).toBeInTheDocument()
  })

  it('never caps away a card whose tests failed', async () => {
    const cards = [...done(19), card({ code: 'SL-BAD', column: 'done', qa: 'fail' })]
    await fullBoard(cards)

    expect(screen.getByText('Title SL-BAD')).toBeInTheDocument()
  })

  it('does not cap a column that is already short', async () => {
    await fullBoard(done(3))
    expect(screen.queryByRole('button', { name: /more finished/ })).toBeNull()
  })

  it('caps only Done — To Do is never truncated', async () => {
    const todo = Array.from({ length: 20 }, (_, i) => card({ code: `SL-T${i}`, column: 'todo' }))
    await fullBoard(todo)

    expect(screen.getByText('Title SL-T19')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /more finished/ })).toBeNull()
  })
})

describe('a card is only draggable where something can receive it', () => {
  it('does not let a card lift in the rolled-up view, which has no drop zones', async () => {
    // The same rule this file applies to viewers, from the other direction: a
    // control that lifts under the cursor and can never land is worse than none.
    render(<BoardView cards={CARDS} canWrite stageLabels={{ AO3: 'The dashboard itself' }} />)
    await userEvent.click(screen.getByRole('button', { name: /The dashboard itself/ }))

    const card = screen.getByText('Title SL-016').closest('article')!
    expect(card.getAttribute('draggable')).toBe('false')
  })

  it('still offers the move control there, so the write is not taken away', async () => {
    // Drag is the shortcut; the select is the mechanism (see card-controls).
    render(<BoardView cards={CARDS} canWrite stageLabels={{ AO3: 'The dashboard itself' }} />)
    await userEvent.click(screen.getByRole('button', { name: /The dashboard itself/ }))

    expect(screen.getByLabelText(/Move SL-016 to another column/)).toBeInTheDocument()
  })

  it('does let a card lift on the four-column board, which does have drop zones', async () => {
    await renderFullBoard({ cards: CARDS, canWrite: true })

    const card = screen.getByText('Title SL-016').closest('article')!
    expect(card.getAttribute('draggable')).toBe('true')
  })
})

describe('a link to a card reaches it, even through two collapses', () => {
  beforeEach(() => {
    window.location.hash = ''
    // jsdom has no layout, so scrollIntoView is not implemented on elements.
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('opens the stage holding the card the URL points at', () => {
    // The hero card links to #task-SL-036 for a blocked card. By default that
    // card is inside a collapsed stage, so without this the anchor is in no DOM
    // and the browser scrolls nowhere — a link that silently does nothing.
    window.location.hash = '#task-SL-036'
    render(<BoardView cards={CARDS} />)

    expect(screen.getByText('Title SL-036')).toBeInTheDocument()
  })

  it('scrolls to the card once it exists', () => {
    window.location.hash = '#task-SL-036'
    render(<BoardView cards={CARDS} />)

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('leaves the other stages alone — it opens one, not everything', () => {
    window.location.hash = '#task-SL-036'
    render(<BoardView cards={CARDS} stageLabels={{ AO3: 'The dashboard itself' }} />)

    expect(screen.getByText('Title SL-036')).toBeInTheDocument()
    expect(screen.queryByText('Title SL-016')).toBeNull()
  })

  it('ignores a hash that is not a card anchor', () => {
    window.location.hash = '#board'
    render(<BoardView cards={CARDS} />)

    expect(screen.queryByText('Title SL-036')).toBeNull()
  })

  it('ignores a hash naming a card that is not on the board', () => {
    window.location.hash = '#task-SL-999'
    render(<BoardView cards={CARDS} />)

    expect(screen.queryByText('Title SL-036')).toBeNull()
  })
})
