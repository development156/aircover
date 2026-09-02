import { cleanup, render, within } from '@testing-library/react'
import { creditCost } from '@sahoda/shared'
import { afterEach, describe, expect, test } from 'vitest'

import { ModelPicker } from '@/components/studio/model-picker'
import { defaultModelId, imageActionFor, routedModels } from '@/lib/studio/models'

/**
 * THE PRICE ON THE CARD.
 *
 * Two of the three models are held at the premium price, and a person choosing
 * between them has to see that BEFORE the press, on the card, not discover it
 * on the wallet page. The number comes from the pricing file through the same
 * function the action prices the hold with, so the card and the ledger cannot
 * disagree.
 */

afterEach(cleanup)

const open = () => render(<ModelPicker modelId={defaultModelId()} onChoose={() => {}} />)

function cardFor(picker: HTMLElement, label: string): HTMLElement {
  const card = within(picker)
    .getAllByRole('button')
    .find((button) => button.textContent?.includes(label))
  if (!card) throw new Error(`no card labelled ${label}`)
  return card
}

describe('what each model costs, on its card', () => {
  /**
   * MUTATION: drop the price line from `Card` in `model-picker.tsx`, or print a
   * literal 6 on every card, and this goes red.
   */
  test('every card names its own price, from the pricing file', () => {
    const { container } = open()
    const picker = container.querySelector('[data-guide="studio-model"]') as HTMLElement

    for (const model of routedModels()) {
      const action = imageActionFor(model.id)
      if (action === null) throw new Error(`${model.id} has no price`)
      const card = cardFor(picker, model.label)
      expect(card.textContent, model.id).toMatch(
        new RegExp(`Costs\\s*${creditCost(action)}\\s*credits? a picture`),
      )
    }
  })

  test('the dear ones show the premium price and the everyday one the standard price', () => {
    const { container } = open()
    const picker = container.querySelector('[data-guide="studio-model"]') as HTMLElement

    const premium = String(creditCost('image_premium'))
    const standard = String(creditCost('image_standard'))
    expect(cardFor(picker, 'The best one').textContent).toContain(premium)
    expect(cardFor(picker, 'Words and detail').textContent).toContain(premium)
    expect(cardFor(picker, 'Everyday').textContent).toContain(standard)
    // And never the other way about: the standard card must not carry the
    // premium figure anywhere in its text.
    expect(cardFor(picker, 'Everyday').textContent).not.toContain(premium)
  })

  /** A price is a figure a person is accountable for, so it is set in tabular figures. */
  test('the figure is tabular', () => {
    const { container } = open()
    const picker = container.querySelector('[data-guide="studio-model"]') as HTMLElement
    const figures = picker.querySelectorAll('.num')
    expect(figures.length).toBe(routedModels().length)
  })
})
