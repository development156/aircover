import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { TabooCard } from './taboo-card'

/**
 * The card used to be titled "Red lines — the Loop will refuse these".
 *
 * Nothing refuses anything. Red lines are part of the brand context the mesh
 * prepends to every model call, so they SHAPE what Sahoda writes; there is no
 * enforcement gate anywhere in the pipeline. Promising one would have a user
 * trust a guarantee the product cannot keep, and trust it precisely where the
 * cost of being wrong is highest — legal claims, medical claims, competitor
 * attacks. That is the no-fake-success rule applied to copy.
 */
function renderCard() {
  render(
    <TabooCard
      value={{ red_lines: ['No false urgency'] }}
      onChange={vi.fn()}
      regenerateCost={50}
      onRegenerate={vi.fn()}
      regenerateDisabled={false}
    />,
  )
}

describe('TabooCard copy', () => {
  test('claims influence, not enforcement', () => {
    renderCard()

    expect(screen.getByText('Red lines, what Sahoda steers away from')).toBeInTheDocument()
    expect(screen.getByText(/shape every caption Sahoda writes/)).toBeInTheDocument()
  })

  test('never says anything refuses or blocks a post', () => {
    renderCard()

    // The whole card, not just the title: the promise must not reappear in a
    // helper line the next time this copy is edited.
    const card = screen.getByText(/steers away from/).closest('div')!.parentElement!
    expect(card.textContent).not.toMatch(/refuse|reject|block|prevent|enforce/i)
  })

  test('says plainly that a human still reviews the output', () => {
    renderCard()
    expect(screen.getByText(/keep reviewing posts before they go live/i)).toBeInTheDocument()
  })

  test('still shows the resolve cost on Regenerate, in the label', () => {
    // Unchanged by the copy fix, and pinned here because this card is the one
    // place both claims meet: what red lines do, and what re-running them costs.
    renderCard()
    expect(screen.getByRole('button', { name: /Regenerate · Uses 50 credits/ })).toBeInTheDocument()
  })
})
