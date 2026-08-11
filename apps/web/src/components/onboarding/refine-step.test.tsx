import { DEMO_FALLBACK_PAYLOAD } from '@sahoda/shared'
import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { RefineStep } from './refine-step'

/**
 * Regenerate is a 50-credit charge — the same charge as Generate, for the same
 * work. Spark treats it that way: it names the cost on the button, and when the
 * balance cannot cover it, it disables the button and prints what is needed
 * against what is held.
 *
 * Refine did half of that. The cost is on every card (`brand-card.tsx`), but a
 * failed Regenerate was a bare `toast(state.message)` — a message that vanishes,
 * carrying neither number, from the one screen where a user has already been
 * charged once and is deciding whether to spend again. Six live buttons kept
 * offering a 50-credit action to a wallet holding nothing, and pressing one was
 * the only way to find out.
 *
 * These tests assert the sentence the user reads and the state of the control,
 * not the branch that produced them.
 */

const NOOP = () => {}

function renderStep(overrides: Partial<Parameters<typeof RefineStep>[0]> = {}) {
  return render(
    <RefineStep
      brain={DEMO_FALLBACK_PAYLOAD}
      onChange={NOOP}
      fallbackMessage={null}
      balanceAfter={0}
      regenerateCost={50}
      regeneratePending={false}
      regenerateError={null}
      onRegenerate={NOOP}
      onContinue={NOOP}
      {...overrides}
    />,
  )
}

const INSUFFICIENT = {
  kind: 'insufficient' as const,
  message: 'Not enough credits.',
  required: 50,
  available: 0,
}

describe('Regenerate names its cost before the click', () => {
  test('every card says what pressing it spends', () => {
    renderStep()

    const buttons = screen.getAllByRole('button', { name: /regenerate/i })

    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) {
      expect(button).toHaveTextContent(/Regenerate · Uses 50 credits/)
    }
  })
})

describe('Regenerate with a balance that cannot pay for it', () => {
  test('states what is needed against what is held', () => {
    renderStep({ regenerateError: INSUFFICIENT })

    const alert = screen.getByRole('alert')

    expect(alert).toHaveTextContent(/this needs 50, you have 0/i)
  })

  test('says nothing was charged, because nothing was', () => {
    renderStep({ regenerateError: INSUFFICIENT })

    // The refusal happens before the hold is taken. Saying so is the difference
    // between a user who retries and one who goes looking for a refund.
    expect(screen.getByRole('alert')).toHaveTextContent(/nothing was charged/i)
  })

  test('stops offering the spend it cannot complete — on every card, not just one', () => {
    renderStep({ regenerateError: INSUFFICIENT })

    for (const button of screen.getAllByRole('button', { name: /regenerate/i })) {
      expect(button).toBeDisabled()
    }
  })

  test('leaves Continue alive — the brain they already paid for is still theirs', () => {
    renderStep({ regenerateError: INSUFFICIENT })

    expect(screen.getByRole('button', { name: /continue to theme/i })).toBeEnabled()
  })
})

describe('Regenerate that failed for some other reason', () => {
  const GENERIC = { kind: 'error' as const, message: 'That did not work — try again.' }

  test('shows the message where it persists, not only in a toast', () => {
    renderStep({ regenerateError: GENERIC })

    expect(screen.getByRole('alert')).toHaveTextContent('That did not work — try again.')
  })

  test('makes no claim about the charge, because the UI cannot see which side it failed on', () => {
    renderStep({ regenerateError: GENERIC })

    expect(screen.getByRole('alert')).not.toHaveTextContent(/nothing was charged/i)
  })

  test('keeps Regenerate pressable — a retry is the remedy here', () => {
    renderStep({ regenerateError: GENERIC })

    for (const button of screen.getAllByRole('button', { name: /regenerate/i })) {
      expect(button).toBeEnabled()
    }
  })
})

describe('Regenerate while a request is in flight', () => {
  test('is disabled, so a double-click cannot become a double charge', () => {
    renderStep({ regeneratePending: true })

    for (const button of screen.getAllByRole('button', { name: /regenerate/i })) {
      expect(button).toBeDisabled()
    }
  })
})

describe('a Refine step with nothing wrong', () => {
  test('shows no alert', () => {
    renderStep()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('offers the spend', () => {
    renderStep()

    for (const button of screen.getAllByRole('button', { name: /regenerate/i })) {
      expect(button).toBeEnabled()
    }
  })
})

describe('the mutation that would undo this', () => {
  test('an insufficient error that only disabled ONE card would still be caught', () => {
    renderStep({ regenerateError: INSUFFICIENT })

    // Six cards share one resolve. The guard is computed once in RefineStep and
    // passed to all of them; a per-card guard is how this regresses.
    const buttons = screen.getAllByRole('button', { name: /regenerate/i })

    expect(buttons.length).toBe(6)
    expect(buttons.every((button) => (button as HTMLButtonElement).disabled)).toBe(true)
  })
})

test('onRegenerate is not called on render', () => {
  const onRegenerate = vi.fn()

  renderStep({ onRegenerate })

  expect(onRegenerate).not.toHaveBeenCalled()
})
