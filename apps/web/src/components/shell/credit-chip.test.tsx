import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { CreditChip } from './credit-chip'

/**
 * The chip carries the same three-way answer /wallet does, for the same reason.
 *
 * It used to take `number | null` and render `null` as an em dash labelled
 * "Credit balance unavailable" — which was the /wallet bug in miniature. For a
 * user with no workspace nothing is unavailable: there is no wallet yet, and
 * telling them the balance could not be read points at a fault that does not
 * exist. Consuming `BalanceRead` is what keeps the chip and the page from
 * telling the same user two different stories.
 */

const balance = (available: number) => ({
  total: available,
  held: 0,
  available,
  hasHold: false,
  heldNote: null,
})

describe('a balance we could read', () => {
  test('shows the number and says it is available', () => {
    render(<CreditChip balance={{ status: 'ok', balance: balance(4200) }} />)

    expect(screen.getByText('4,200')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAccessibleName(/4,200 credits available/i)
  })

  test('shows a real zero as zero', () => {
    // Zero is a fact here, not a failure — the em dash is reserved for "we do
    // not know", and using it for a known zero would lose that distinction.
    render(<CreditChip balance={{ status: 'ok', balance: balance(0) }} />)

    expect(screen.getByText('0')).toBeInTheDocument()
  })
})

describe('a user with no workspace', () => {
  test('is not told anything is unavailable', () => {
    render(<CreditChip balance={{ status: 'no-workspace' }} />)

    expect(screen.getByRole('link')).not.toHaveAccessibleName(/unavailable/i)
  })

  test('is not shown a number, an em dash or a zero', () => {
    // All three are claims about a balance. There is no balance to claim
    // anything about until a workspace exists.
    render(<CreditChip balance={{ status: 'no-workspace' }} />)

    expect(screen.queryByText('—')).not.toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveTextContent(/no wallet yet/i)
  })

  test('still reaches the wallet, where the create-workspace state lives', () => {
    render(<CreditChip balance={{ status: 'no-workspace' }} />)

    expect(screen.getByRole('link')).toHaveAttribute('href', '/wallet')
  })
})

describe('a balance we genuinely could not read', () => {
  test('keeps the em dash and the unavailable wording — both true here', () => {
    render(<CreditChip balance={{ status: 'unreadable' }} />)

    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAccessibleName(/unavailable/i)
  })

  test('never renders a zero, which would stop a funded user working', () => {
    render(<CreditChip balance={{ status: 'unreadable' }} />)

    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})
