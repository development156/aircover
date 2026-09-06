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
  test('says it could not be read, in a form a screen reader reaches', () => {
    render(<CreditChip balance={{ status: 'unreadable' }} />)

    // Asserts the CLAIM, not the glyph. This used to require the literal '—',
    // which docs/26 §4 replaced with the Unreadable MARK — a broken rule, so
    // "we asked and got nothing back" is structurally distinct from "not yet
    // measured", which the same dash also used to mean.
    //
    // The new assertion is strictly stronger: a bare dash satisfied the old one
    // while being invisible to a screen reader, and a mark with no accessible
    // name cannot satisfy this one.
    expect(screen.getByText(/your credit balance could not be read/i)).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAccessibleName(/unavailable/i)
  })

  test('never renders a zero, which would stop a funded user working', () => {
    render(<CreditChip balance={{ status: 'unreadable' }} />)

    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})

test('on a phone the word "credits" is for screen readers only; the number and the accessible name stay', () => {
  // MEASURED 2026-09-05: at 390px the topbar's trailing cluster overran the
  // viewport by 35px with a workspace and no brain, and this word was 50px of
  // it. The link keeps "credits available" in its name, so nothing is lost
  // but the width.
  render(
    <CreditChip
      balance={{
        status: 'ok',
        balance: { total: 4200, held: 0, available: 4200, hasHold: false, heldNote: null },
      }}
    />,
  )
  expect(screen.getByText('credits')).toHaveClass('max-narrow:sr-only')
  expect(screen.getByRole('link')).toHaveAccessibleName(/4,200 credits available/i)
})
