import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import type { Intake } from '@/lib/onboarding/intake'

import { QuestionStep } from './question-step'

const BAKERY: Intake = { model: 'local_presence', regime: 'food', locale: 'IN' }

function setup(overrides: Partial<React.ComponentProps<typeof QuestionStep>> = {}) {
  const props = {
    intake: BAKERY,
    isPending: false,
    isFree: true,
    cost: 50,
    attemptError: null,
    onResolve: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  }
  render(<QuestionStep {...props} />)
  return props
}

describe('QuestionStep', () => {
  test('puts a named counterparty in a specific moment', () => {
    setup()

    expect(screen.getByText('A regular who comes in every Saturday')).toBeInTheDocument()
    expect(screen.getByText(/homemade/)).toBeInTheDocument()
  })

  test('asks a different question for a different pair', () => {
    setup({ intake: { model: 'institution', regime: 'healthcare', locale: 'IN' } })

    expect(screen.getByText('A family in the third-floor waiting room')).toBeInTheDocument()
  })

  test('reads the answer back as a rule, in their own words', async () => {
    setup()

    await userEvent.type(
      screen.getByLabelText('What do you refuse to call it?'),
      "we won't call it homemade if we didn't make the base",
    )

    expect(
      screen.getByText("Never call it homemade if we didn't make the base."),
    ).toBeInTheDocument()
  })

  test('says free on the first resolve and shows no number', () => {
    // UI_RULES credits protocol: the cost lives in the label. On the free path
    // there is no charge, so there must be no credit number anywhere near it.
    setup({ isFree: true })

    const button = screen.getByRole('button', { name: /Resolve my brand/ })
    expect(button).toHaveTextContent('free')
    expect(button).not.toHaveTextContent('50')
  })

  test('names the cost once it is no longer free', () => {
    setup({ isFree: false, cost: 50 })

    const button = screen.getByRole('button', { name: /Resolve my brand/ })
    expect(button).toHaveTextContent('50 credits')
    expect(button).not.toHaveTextContent('free')
    expect(screen.queryByText(/first resolve is free/)).not.toBeInTheDocument()
  })

  test('will not resolve on a shrug', async () => {
    const { onResolve } = setup()
    const button = screen.getByRole('button', { name: /Resolve my brand/ })

    expect(button).toBeDisabled()

    await userEvent.type(screen.getByLabelText('What do you refuse to call it?'), 'nope')
    expect(button).toBeDisabled()

    await userEvent.type(
      screen.getByLabelText('What do you refuse to call it?'),
      ' we will not fake it',
    )
    expect(button).toBeEnabled()

    await userEvent.click(button)
    expect(onResolve).toHaveBeenCalledWith('nope we will not fake it')
  })

  test('disables the spend when the balance cannot cover it', () => {
    setup({
      isFree: false,
      attemptError: {
        kind: 'insufficient',
        message: 'Not enough credits.',
        required: 50,
        available: 10,
      },
    })

    expect(screen.getByRole('button', { name: /Resolve my brand/ })).toBeDisabled()
  })

  test('never asks for a policy', () => {
    setup()
    const rendered = (document.body.textContent ?? '').toLowerCase()

    // Asserted first: an empty string would satisfy every `not.toContain`
    // below and the test would pass while proving nothing.
    expect(rendered.length).toBeGreaterThan(100)

    for (const phrase of ['policy', 'guidelines', 'your values', 'tone of voice']) {
      expect(rendered).not.toContain(phrase)
    }
  })
})

/**
 * An empty required box must not read as a finished answer.
 *
 * The specimen shipped as "We will not say homemade when we did not make the
 * base." — sentence case, twelve words, terminal full stop — inside an empty
 * required field directly above a DISABLED primary button. A customer walking
 * the flow read the box as filled and the button as broken, and stopped.
 *
 * These assert the CLAIM, not the wording: the box announces itself as an
 * example, and does not present a finished sentence.
 */
describe('the answer box does not look already answered', () => {
  test('frames its specimen as an example', () => {
    setup()
    const box = screen.getByRole('textbox')

    expect(box.getAttribute('placeholder')).toMatch(/^Example: /)
  })

  test('the specimen is not a finished sentence', () => {
    setup()

    expect(screen.getByRole('textbox').getAttribute('placeholder')).not.toMatch(/\.$/)
  })

  test('the box is still genuinely empty — a specimen is never pre-filled', () => {
    setup()

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('')
  })
})
