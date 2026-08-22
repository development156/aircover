import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { IntakeStep } from './intake-step'

function setup(onContinue = vi.fn()) {
  render(<IntakeStep initialText="" initialOverrides={{}} onContinue={onContinue} />)
  return { onContinue, box: screen.getByLabelText('In your words') }
}

describe('IntakeStep', () => {
  test('reads the picks out of what they type and says them back', async () => {
    const { box } = setup()

    await userEvent.type(box, 'I run a bakery in Pune')

    expect(screen.getByText("You're a local presence in food, in India.")).toBeInTheDocument()
  })

  test('claims nothing about you before you have written anything', async () => {
    // MEASURED 2026-08-22 on a fresh account: with the box untouched this screen
    // asserted in bold "You're a service business in everyday consumer goods and
    // services, in India." while saying, one line below, "We could not read any
    // of this from your words". Two sentences, two lines apart, an empty box,
    // and only one of them true.
    //
    // Asserted by the CLAIM, not by the wording: the read-back always opens
    // "You're a ...", so this stays correct if the sentence is rewritten, and
    // fails again the moment anything asserts a conclusion over an empty input.
    setup()

    expect(screen.queryByText(/^You're a /)).not.toBeInTheDocument()
    expect(screen.queryByText(/could not read any of this/i)).not.toBeInTheDocument()
    expect(screen.getByText(/reads it back here/i)).toBeInTheDocument()
  })

  test('says it back as soon as there is something to say it about', async () => {
    const { box } = setup()

    await userEvent.type(box, 'I run a bakery in Pune')

    expect(screen.getByText(/^You're a /)).toBeInTheDocument()
    expect(screen.queryByText(/reads it back here/i)).not.toBeInTheDocument()
  })

  test('marks a pick it guessed, and stops marking it once read', async () => {
    const { box } = setup()

    // Nothing typed: all three are defaults and must say so.
    expect(screen.getAllByText('guessed')).toHaveLength(3)

    await userEvent.type(box, 'I run a bakery in Pune')

    expect(screen.queryByText('guessed')).not.toBeInTheDocument()
  })

  test('keeps a hand-picked value when they keep typing', async () => {
    // The bug this exists to stop is the single most infuriating thing a form
    // that "helps" can do: the user corrects a field, adds another word, and
    // watches their correction get overwritten.
    const { box } = setup()
    await userEvent.type(box, 'I run a bakery')

    await userEvent.click(screen.getByLabelText('Beauty and wellness'))
    expect(screen.getByLabelText('Beauty and wellness')).toBeChecked()

    await userEvent.type(box, ' in Pune with a wood-fired oven')

    expect(screen.getByLabelText('Beauty and wellness')).toBeChecked()
    expect(screen.getByLabelText('Food and drink')).not.toBeChecked()
    // The field they did NOT touch still tracks the text.
    expect(screen.getByLabelText('India')).toBeChecked()
  })

  test('hands the effective picks to the next screen, overrides included', async () => {
    const { box, onContinue } = setup()
    await userEvent.type(box, 'I run a bakery in Pune')
    await userEvent.click(screen.getByLabelText('Beauty and wellness'))

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(onContinue).toHaveBeenCalledWith(
      { model: 'local_presence', regime: 'beauty', locale: 'IN' },
      'I run a bakery in Pune',
      { regime: 'beauty' },
    )
  })

  test('every pick is reachable by keyboard', async () => {
    setup()

    // Native radios: focusing the group and arrowing must move the selection.
    const first = screen.getByLabelText('A place people come to')
    first.focus()
    expect(first).toHaveFocus()

    await userEvent.keyboard('{ArrowRight}')

    expect(screen.getByLabelText('Work done for a client')).toBeChecked()
  })

  test('can continue without typing anything at all', async () => {
    // Blanks never block (FSD M1). The defaults are honest and labelled.
    const { onContinue } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(onContinue).toHaveBeenCalledWith(
      { model: 'service', regime: 'consumer', locale: 'IN' },
      '',
      {},
    )
  })
})
