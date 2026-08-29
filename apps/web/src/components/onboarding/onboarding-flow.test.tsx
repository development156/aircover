import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { BrandMemoryPayload } from '@sahoda/shared'

import type { Intake } from '@/lib/onboarding/intake'

import type { DoorResult } from './door-step'

const resolveOnboarding = vi.fn()
vi.mock('@/app/actions/onboarding-resolve', () => ({
  resolveOnboarding: (...args: unknown[]) => resolveOnboarding(...args),
}))
vi.mock('@/app/actions/brand-resolve', () => ({ saveBrandMemory: vi.fn() }))
vi.mock('@/app/actions/theme', () => ({ saveWorkspaceTheme: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: vi.fn() }))

// The step children are mocked so that THEIR `disabled` cannot stand in for the
// flow's own guard — which is the whole point. QA frame j1-09 caught the resolve
// control enabled mid-resolve, so the guard has to hold even when nothing on
// screen is dimmed.
vi.mock('./intake-step', () => ({
  IntakeStep: (props: {
    onContinue: (next: Intake, text: string, picked: Partial<Intake>) => void
  }) => (
    <button
      type="button"
      onClick={() =>
        props.onContinue({ model: 'local_presence', regime: 'food', locale: 'IN' }, 'bakery', {})
      }
    >
      to-door
    </button>
  ),
}))
vi.mock('./door-step', () => ({
  DoorStep: (props: { onContinue: (result: DoorResult) => void }) => (
    <button
      type="button"
      onClick={() =>
        props.onContinue({
          text: 'we bake',
          foundName: 'Bakery',
          colors: [],
          label: 'site',
          kind: 'url',
        })
      }
    >
      to-question
    </button>
  ),
}))
vi.mock('./question-step', () => ({
  QuestionStep: (props: { onResolve: (answer: string) => void }) => (
    <button type="button" onClick={() => props.onResolve('never call it handmade')}>
      resolve
    </button>
  ),
}))
vi.mock('./reveal-step', () => ({
  RevealStep: (props: { onRegenerate: () => void }) => (
    <>
      <button type="button" onClick={props.onRegenerate}>
        regen-a
      </button>
      <button type="button" onClick={props.onRegenerate}>
        regen-b
      </button>
    </>
  ),
}))

import { OnboardingFlow } from './onboarding-flow'

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

const click = (label: string) =>
  act(async () => {
    screen.getByText(label).click()
  })

function renderFlow() {
  render(
    <OnboardingFlow
      savedBrain={null}
      isFree
      cost={50}
      hasSavedTheme={false}
      workspaceName="Bakery"
    />,
  )
}

describe('OnboardingFlow charges once per press', () => {
  beforeEach(() => {
    resolveOnboarding.mockClear()
    // The intake crash buffer is `sessionStorage`, which jsdom keeps for the
    // whole FILE. Without this the first test leaves the flow parked on the
    // question step with text stashed, and the next render resumes there
    // instead of starting at intake — a leak between tests, not a product
    // behaviour. A real visit gets its own tab.
    window.sessionStorage.clear()
  })

  test('a double press dispatches ONE resolve', async () => {
    // THE MONEY: each dispatch reaches the ledger on its own, so
    // two dispatches are two charges. The mocked action must SETTLE — React 19
    // queues actions, so a never-settling one never invokes the second action
    // and the assertion below could not fail either way.
    // Fails (not ok) so the flow stays on the question step.
    resolveOnboarding.mockResolvedValue({ ok: false, kind: 'error', message: 'no' })
    renderFlow()

    await click('to-door')
    await click('to-question')
    await act(async () => {
      screen.getByText('resolve').click()
      screen.getByText('resolve').click()
    })

    expect(resolveOnboarding).toHaveBeenCalledTimes(1)
  })

  test('two Regenerate cards in one tick dispatch ONE re-resolve', async () => {
    // Six cards share one Regenerate handler, and each press is the same charge.
    resolveOnboarding.mockResolvedValue({ ok: true, kind: 'free', brain: BRAIN })
    renderFlow()

    await click('to-door')
    await click('to-question')
    await click('resolve')
    expect(resolveOnboarding).toHaveBeenCalledTimes(1)

    await act(async () => {
      screen.getByText('regen-a').click()
      screen.getByText('regen-b').click()
    })

    expect(resolveOnboarding).toHaveBeenCalledTimes(2)
  })
})
