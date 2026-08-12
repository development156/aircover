import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import type { BrandMemoryPayload } from '@sahoda/shared'

import { RevealStep } from './reveal-step'

const BRAIN: BrandMemoryPayload = {
  voice: {
    descriptor: 'Warm and plain-spoken',
    formality_label: 'Relaxed professional',
    signature_phrases: ['Baked this morning', 'Nothing bought in', 'Ask the baker'],
    banned_phrases: ['artisanal'],
  },
  brand_persona: {
    archetype: 'The Caregiver',
    one_liner: 'The bakery that knows your order.',
    core_values: ['Craft', 'Honesty', 'Belonging'],
  },
  customer_persona: {
    one_liner: 'A family within two kilometres.',
    primary_pain_point: 'Nowhere nearby bakes properly.',
    primary_fear: 'Paying more for the same supermarket loaf.',
    desired_identity: 'Someone who knows where the good bread is.',
  },
  hook: {
    core_promise: 'Bread worth the walk.',
    primary_emotion: 'Comfort',
    sample_hooks: ['Out of the oven at six.', 'The Saturday loaf.', 'Ask for the crust end.'],
  },
  taboo: { red_lines: ['Never call it homemade if we did not make the base.'] },
  alignment: { signal_lock: 'strong', note: 'Tight intake.' },
}

function setup(overrides: Partial<React.ComponentProps<typeof RevealStep>> = {}) {
  const props = {
    brain: BRAIN,
    onChange: vi.fn(),
    balanceAfter: null,
    wasFree: true,
    fallbackMessage: null,
    colors: [] as string[],
    hasSavedTheme: false,
    canRegenerate: true,
    regenerateCost: 'free' as const,
    regeneratePending: false,
    regenerateError: null,
    onRegenerate: vi.fn(),
    onFinish: vi.fn(),
    saving: false,
    saveState: null,
    ...overrides,
  }
  render(<RevealStep {...props} />)
  return props
}

describe('RevealStep money surface', () => {
  test('shows no balance on the free path, and says it was free', () => {
    setup({ wasFree: true, balanceAfter: null })

    expect(screen.getByText('This one was free')).toBeInTheDocument()
    expect(screen.queryByText(/Balance:/)).not.toBeInTheDocument()
  })

  test('shows the balance a charged resolve left behind', () => {
    setup({ wasFree: false, balanceAfter: 450, regenerateCost: 50 })

    expect(screen.getByText(/Balance:/)).toHaveTextContent('450')
    expect(screen.queryByText('This one was free')).not.toBeInTheDocument()
  })

  test('never quotes a charge the server is not going to make', () => {
    // Before anything is approved a re-resolve takes the same free path the
    // first one did, because `isFirstResolve` reads `brand_memory` and it is
    // still empty. Cards reading "Uses 50 credits" would be quoting a price
    // nobody is charged.
    setup({ regenerateCost: 'free' })

    const buttons = screen.getAllByRole('button', { name: /Regenerate/ })
    expect(buttons.length).toBe(6)
    for (const button of buttons) {
      expect(button).toHaveTextContent('free')
      expect(button).not.toHaveTextContent('50')
    }
  })

  test('names the cost once regenerating is charged', () => {
    setup({ regenerateCost: 50 })

    for (const button of screen.getAllByRole('button', { name: /Regenerate/ })) {
      expect(button).toHaveTextContent('50')
      expect(button).not.toHaveTextContent('free')
    }
  })
})

describe('RevealStep regenerate guard', () => {
  test('will not resolve from a brain that was loaded rather than answered for', async () => {
    // THE BUG: /onboarding opened on a saved brain lands straight on this
    // screen with no picks, no door text and no refusal in state. Regenerate
    // posted the defaults, took the CHARGED path (a saved brain exists), spent
    // 50 credits and replaced the loaded brain with a generic one.
    const { onRegenerate } = setup({ canRegenerate: false, regenerateCost: 50 })

    const buttons = screen.getAllByRole('button', { name: /Regenerate/ })
    for (const button of buttons) expect(button).toBeDisabled()

    await userEvent.click(buttons[0]!)
    expect(onRegenerate).not.toHaveBeenCalled()

    expect(screen.getByText(/nothing to resolve from/)).toBeInTheDocument()
  })

  test('allows it when the answers were given this session', async () => {
    const { onRegenerate } = setup({ canRegenerate: true })

    await userEvent.click(screen.getAllByRole('button', { name: /Regenerate/ })[0]!)

    expect(onRegenerate).toHaveBeenCalledTimes(1)
  })

  test('blocks the spend when the balance cannot cover it', () => {
    setup({
      canRegenerate: true,
      regenerateCost: 50,
      regenerateError: {
        kind: 'insufficient',
        message: 'Not enough credits.',
        required: 50,
        available: 10,
      },
    })

    for (const button of screen.getAllByRole('button', { name: /Regenerate/ })) {
      expect(button).toBeDisabled()
    }
  })
})

describe('RevealStep colour claim', () => {
  test('claims a new colour only when one was found', () => {
    setup({ colors: ['oklch(0.6 0.15 30)'], hasSavedTheme: false })

    expect(screen.getByText(/paints the app in the colour we found/)).toBeInTheDocument()
  })

  test('says a colour is being REPLACED when the workspace already wears one', () => {
    // Start over on a themed workspace, then a URL door that yields colours:
    // `saveWorkspaceTheme` archives the active theme and installs the new one.
    // "Approving also paints the app" does not say that anything is lost.
    setup({ colors: ['oklch(0.6 0.15 30)'], hasSavedTheme: true })

    expect(screen.getByText(/replaces the colour this workspace wears/)).toBeInTheDocument()
    expect(screen.queryByText(/also paints the app/)).not.toBeInTheDocument()
  })

  test('does not tell a themed workspace we found no colour', () => {
    // On re-entry `colors` is empty because the door was never opened this
    // session. That is not the same as the workspace having no colour, and
    // saying so to a workspace wearing its own theme is simply false.
    setup({ colors: [], hasSavedTheme: true })

    expect(screen.getByText(/keeps the colour this workspace already wears/)).toBeInTheDocument()
    expect(screen.queryByText(/found no colour/)).not.toBeInTheDocument()
  })

  test('says the default is kept when there is genuinely no colour', () => {
    setup({ colors: [], hasSavedTheme: false })

    expect(screen.getByText(/found no colour/)).toBeInTheDocument()
  })
})
