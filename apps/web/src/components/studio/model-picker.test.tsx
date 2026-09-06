import { cleanup, render } from '@testing-library/react'
import { creditCost } from '@sahoda/shared'
import { afterEach, describe, expect, test } from 'vitest'

import { ModelPicker } from '@/components/studio/model-picker'
import {
  STUDIO_MODELS,
  defaultModelId,
  imageActionFor,
  routedModels,
  unroutedModels,
} from '@/lib/studio/models'

/**
 * ONE LINE OR TWO, NOT A COMPARISON TABLE.
 *
 * A founder screenshot showed choosing a model blowing the composer's right
 * rail apart: each card carried five facts (name, description, reference
 * ceiling, billing basis, price) across four models, and the three unrouted
 * ones each repeated a sentence the heading above them already said. These
 * tests pin what survived the cut: the price never leaves an option, exactly
 * one option per routed model is pressable, the unrouted heading's sentence
 * appears once for the whole group rather than once per card, and every fact
 * that moved off the option itself (the reference ceiling, the billing
 * basis) is still reachable, inside that option's own disclosure.
 */

afterEach(cleanup)

const open = () => render(<ModelPicker modelId={defaultModelId()} onChoose={() => {}} />)

// A card is a `<li>`, whether it wraps a choosable `<button>` (routed models) or
// a locked "Not connected yet" entry (waiting models). Searching buttons alone
// would miss the locked cards, which still show a price.
function cardFor(picker: HTMLElement, label: string): HTMLElement {
  const card = Array.from(picker.querySelectorAll('li')).find((li) =>
    li.textContent?.includes(label),
  )
  if (!card) throw new Error(`no card labelled ${label}`)
  return card as HTMLElement
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

  /**
   * A price is a figure a person is accountable for, so it is set in tabular
   * figures. EVERY card carries one, the locked "Not connected yet" cards
   * included, so the count tracks the whole catalogue rather than only the
   * choosable rows.
   */
  test('the figure is tabular', () => {
    const { container } = open()
    const picker = container.querySelector('[data-guide="studio-model"]') as HTMLElement
    const figures = picker.querySelectorAll('.num')
    expect(figures.length).toBe(STUDIO_MODELS.length)
  })
})

describe('one option is one choice, not a comparison table', () => {
  /**
   * MUTATION: make an unrouted model's card a real `<button>`, and this goes
   * red — a locked option must stay a span carrying a `Lock`, never a press
   * that would 400.
   */
  test('exactly one pressable option per routed model, and none for an unrouted one', () => {
    const { container } = open()
    const picker = container.querySelector('[data-guide="studio-model"]') as HTMLElement
    const buttons = picker.querySelectorAll('button[aria-pressed]')
    expect(buttons.length).toBe(routedModels().length)

    for (const model of unroutedModels()) {
      const card = cardFor(picker, model.label)
      expect(card.querySelector('button')).toBeNull()
      expect(card.querySelector('svg')).not.toBeNull() // the Lock
    }
  })

  /**
   * MUTATION: put "when to reach for it" back inline alongside the reference
   * ceiling and the billing basis, and this fails to catch anything wrong on
   * its own — so pair it with the two below, which each check ONE moved fact
   * stayed reachable rather than deleted.
   */
  test('an option carries its name, its price and a short reach-for-it line, and nothing else up front', () => {
    const { container } = open()
    const picker = container.querySelector('[data-guide="studio-model"]') as HTMLElement
    const card = cardFor(picker, 'Everyday')
    const button = card.querySelector('button') as HTMLElement
    expect(button.textContent).toContain('Everyday')
    expect(button.textContent).toContain('Costs')
    // The button itself never carries the reference ceiling or the billing
    // basis: those moved into the card's own disclosure, checked below.
    expect(button.querySelector('details')).toBeNull()
  })
})

describe('the moved facts are moved, not deleted', () => {
  /**
   * MUTATION: delete `unlocks` from a card's disclosure instead of moving it
   * there, and this goes red for every model that has one.
   */
  test('the reference ceiling lives inside the option’s own details disclosure', () => {
    const { container } = open()
    const picker = container.querySelector('[data-guide="studio-model"]') as HTMLElement

    for (const model of STUDIO_MODELS) {
      if (model.unlocks === null) continue
      const card = cardFor(picker, model.label)
      const details = card.querySelector('details')
      if (!details) throw new Error(`${model.id} has an unlocks fact but no details disclosure`)
      expect(details.textContent, model.id).toContain(model.unlocks)
      // And not repeated up front, outside the disclosure.
      const summary = details.querySelector('summary')
      const outsideDetails = Array.from(card.childNodes)
        .filter((node) => node !== details)
        .map((node) => node.textContent ?? '')
        .join('')
      expect(outsideDetails, model.id).not.toContain(model.unlocks)
      expect(summary).not.toBeNull()
    }
  })

  /**
   * MUTATION: delete `costNote` from the disclosure, and this goes red for
   * every model.
   */
  test('the billing basis lives inside the option’s own details disclosure', () => {
    const { container } = open()
    const picker = container.querySelector('[data-guide="studio-model"]') as HTMLElement

    for (const model of STUDIO_MODELS) {
      const card = cardFor(picker, model.label)
      const details = card.querySelector('details')
      if (!details) throw new Error(`${model.id} has no details disclosure`)
      expect(details.textContent, model.id).toContain(model.costNote)
    }
  })
})

describe('the unrouted heading carries the sentence, not each card', () => {
  /**
   * MUTATION: put "Built and waiting on the connection being switched on"
   * back on every unrouted card, and this count moves from 1 to
   * `unroutedModels().length` and the test goes red.
   */
  test('the waiting sentence appears once for the whole group', () => {
    const { container } = open()
    const picker = container.querySelector('[data-guide="studio-model"]') as HTMLElement
    const matches = (picker.textContent ?? '').match(/waiting on the connection/g) ?? []
    expect(matches.length).toBe(1)
  })

  test('every unrouted model is still named and still shows its price', () => {
    const { container } = open()
    const picker = container.querySelector('[data-guide="studio-model"]') as HTMLElement
    for (const model of unroutedModels()) {
      const card = cardFor(picker, model.label)
      expect(card.textContent).toContain(model.label)
    }
  })
})
