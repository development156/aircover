import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { PlanWeekState } from '@/lib/planner/state'

import { PlanWeekPanel } from './plan-week-panel'

const state = vi.hoisted(() => ({
  result: {
    ok: true,
    created: 5,
    clamped: 0,
    balanceAfter: 80,
    creditsCharged: 20,
  } as unknown as PlanWeekState,
  calls: [] as Array<{ goals: unknown; channels: unknown }>,
}))

vi.mock('@/app/actions/plan-week', () => ({
  planMyWeek: (goals: unknown, channels: unknown) => {
    state.calls.push({ goals, channels })
    return Promise.resolve(state.result)
  },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

beforeEach(() => {
  state.result = {
    ok: true,
    created: 5,
    clamped: 0,
    balanceAfter: 80,
    creditsCharged: 20,
  }
  state.calls = []
})

describe('PlanWeekPanel', () => {
  test('the cost is on the button BEFORE the click', () => {
    render(<PlanWeekPanel />)

    expect(screen.getByRole('button', { name: /plan my week · 20 credits/i })).toBeEnabled()
    expect(state.calls).toHaveLength(0)
  })

  test('one click sends goals and the default channels', async () => {
    render(<PlanWeekPanel />)

    await userEvent.type(screen.getByLabelText(/goals for the week/i), 'Monsoon menu launch')
    await userEvent.click(screen.getByRole('button', { name: /plan my week/i }))

    expect(state.calls).toEqual([{ goals: 'Monsoon menu launch', channels: ['x', 'gbp'] }])
  })

  test('moved times are reported, never hidden', async () => {
    state.result = { ok: true, created: 5, clamped: 2, balanceAfter: 80, creditsCharged: 20 }

    render(<PlanWeekPanel />)
    await userEvent.click(screen.getByRole('button', { name: /plan my week/i }))

    expect(await screen.findByText(/suggested times were unusable/i)).toBeInTheDocument()
  })

  test('insufficient credits shows the exact shortfall and the not-charged claim', async () => {
    state.result = { ok: false, insufficient: true, required: 20, available: 3 }

    render(<PlanWeekPanel />)
    await userEvent.click(screen.getByRole('button', { name: /plan my week/i }))

    const alert = await screen.findByText(/nothing was planned and you were not charged/i)
    expect(alert).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /top up your wallet/i })).toHaveAttribute(
      'href',
      '/wallet',
    )
  })

  test('an action failure renders the message verbatim — the action owns the charge claim', async () => {
    state.result = {
      ok: false,
      insufficient: false,
      message: 'The plan could not be saved. You were not charged. Try again.',
    }

    render(<PlanWeekPanel />)
    await userEvent.click(screen.getByRole('button', { name: /plan my week/i }))

    expect(
      await screen.findByText('The plan could not be saved. You were not charged. Try again.'),
    ).toBeInTheDocument()
  })
})
