import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

/**
 * THE REPLACEMENT FOR /leads's PLACE IN roadmap-honesty.spec.ts.
 *
 * ── WHY THAT SUITE NO LONGER COVERS THIS SCREEN ──────────────────────────────
 * It walks each roadmap section, requires the words "coming soon", and — for
 * `/leads` specifically — allowed NO number at all, because every figure on a
 * drawing of a pipeline would have been a claim about a business that had never
 * had an enquiry. Both doors are open now, so the screen is not a drawing and
 * the sentence "coming soon" would be false.
 *
 * Widening that suite's allow-list would have turned a guard about unbuilt
 * screens into a guard about nothing. So the property moves here, where it can
 * be stronger: not "no digits" but "every digit is a count of rows this file
 * put on the screen".
 *
 * ── WATCHED FAIL ─────────────────────────────────────────────────────────────
 * MEASURED: adding a `62% convert` line to `board.tsx` fails
 * `prints NO figure that is not a count of rows` with `["62"]`, and fails
 * nothing else in the repository.
 */

const { move } = vi.hoisted(() => ({ move: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/app/actions/leads', () => ({ setLeadStatus: move }))

import { Board } from './board'
import type { LeadView } from '@/lib/leads/read'

const HOUR = 60 * 60 * 1000

function lead(overrides: Partial<LeadView> = {}): LeadView {
  return {
    id: 'l1',
    name: 'Priya',
    email: 'priya@example.com',
    phone: null,
    message: 'Do you do birthday cakes?',
    status: 'new',
    readAt: null,
    createdAt: new Date(Date.now() - HOUR).toISOString(),
    from: 'Your site',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the pipeline', () => {
  test('shows the four stages the product uses, and not the fifth the column allows', () => {
    render(<Board leads={[lead()]} />)
    for (const name of ['New', 'Contacted', 'Won', 'Lost']) {
      expect(screen.getByRole('region', { name })).toBeTruthy()
    }
    // `qualified` is a legal status nothing writes. A column for it would be UI
    // for a state that cannot be reached.
    expect(screen.queryByRole('region', { name: 'Qualified' })).toBeNull()
  })

  test('an empty column says what would land in it, not a zero', () => {
    render(<Board leads={[lead()]} />)
    const won = screen.getByRole('region', { name: 'Won' })
    expect(won.textContent).toMatch(/bought, booked or walked in/i)
    // "Won 0" is a true count and a useless sentence.
    expect(won.textContent).not.toMatch(/\b0\b/)
  })

  test('moves a lead along the pipeline, one press at a time', () => {
    render(<Board leads={[lead()]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Contacted' }))
    expect(move).toHaveBeenCalledWith('l1', 'contacted')
  })

  test('lost is reachable from anywhere and is not the step after won', () => {
    render(<Board leads={[lead({ status: 'won' })]} />)
    const won = screen.getByRole('region', { name: 'Won' })
    expect(won.textContent).toMatch(/Lost/)
    // Nothing follows Won on the happy path.
    expect(won.querySelectorAll('button')).toHaveLength(1)
  })

  test('searches the name, the address, the number and the words', () => {
    render(
      <Board
        leads={[
          lead({ id: 'a', name: 'Priya', email: null, message: null }),
          lead({ id: 'b', name: 'Ravi', email: null, message: 'wedding cake' }),
        ]}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/search a name/i), {
      target: { value: 'wedding' },
    })
    expect(screen.queryByText('Priya')).toBeNull()
    expect(screen.getByText('Ravi')).toBeTruthy()
  })

  test('“needs a reply” is the ones nobody has answered', () => {
    render(<Board leads={[lead({ id: 'a' }), lead({ id: 'b', status: 'contacted' })]} />)
    fireEvent.click(screen.getByRole('button', { name: /needs a reply/i }))
    expect(screen.getByRole('region', { name: 'Contacted' }).textContent).toMatch(
      /clock is now on them/i,
    )
  })

  test('a lead with no name says so rather than showing a blank', () => {
    render(<Board leads={[lead({ name: null })]} />)
    expect(screen.getByText(/no name given/i)).toBeTruthy()
  })

  test('carries where each one came from, and never guesses', () => {
    render(<Board leads={[lead({ from: 'Not recorded' })]} />)
    expect(screen.getByText('Not recorded')).toBeTruthy()
  })

  test('prints NO figure that is not a count of rows', () => {
    const leads = [
      lead({ id: 'a' }),
      lead({ id: 'b' }),
      lead({ id: 'c', status: 'contacted' }),
      // A phone number is a lead's own contact detail, not a figure about the
      // business, so this case deliberately omits one — the scan would count its
      // digits and the exclusion has to be a decision rather than a gap.
    ]
    const { container } = render(<Board leads={leads} />)
    const numbers = (container.textContent ?? '').match(/\d+/g) ?? []
    // Two in New, one in Contacted. Nothing else on this screen is a number:
    // no conversion rate, no lead score, no estimated value, no "this week" total.
    expect(numbers.sort()).toEqual(['1', '2'])
  })
})
