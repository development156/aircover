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
    postIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
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

// Never resolves: the panel test only needs to see the first card start drawing.
vi.mock('@/app/actions/illustrate-post', () => ({ illustratePost: () => new Promise(() => {}) }))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

beforeEach(() => {
  state.result = {
    ok: true,
    created: 5,
    clamped: 0,
    postIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
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
    state.result = {
      ok: true,
      created: 5,
      clamped: 2,
      postIds: [],
      balanceAfter: 80,
      creditsCharged: 20,
    }

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

  /**
   * ── TWO GUARDS ON THINGS THAT ARE INVISIBLE IN REVIEW ──────────────────────
   *
   * The redesign moved "(optional)" from the label's own text into its own span,
   * and moved the field off the `Label` primitive onto a plain `<label>`. Both
   * look identical on screen and both can silently change what a screen reader
   * announces.
   *
   * ⚠ THE FIRST VERSION OF THIS TEST DID NOT CHECK WHAT ITS OWN COMMENT CLAIMED.
   * It used `getByLabelText`, and said in this comment that it asserted the
   * accessible NAME. It does not: `getByLabelText` matches the `<label>`
   * element's textContent and never runs the accessible-name algorithm. An
   * adversarial pass found two mutations it waved straight through, both of
   * which a reviewer would read as harmless: adding
   * `aria-label="Goals for the week"` to the field, and putting `aria-hidden`
   * on the "(optional)" span. Each drops "(optional)" from what a screen reader
   * actually announces while the assertion stayed green.
   *
   * `toHaveAccessibleName` runs the real algorithm, so both now fail.
   *
   * The second one exists because the character counter is a second copy of a
   * number the input already enforces. Two copies drift, and a counter that says
   * 500 beside a field that stops at 300 is a figure no query produced. It reads
   * both from the rendered DOM rather than from the constant, so importing the
   * constant into the test cannot make it pass falsely.
   */
  test('the accessible name still says the field is optional', () => {
    render(<PlanWeekPanel />)

    const field = screen.getByRole('textbox')

    expect(field).toHaveAttribute('id', 'plan-week-goals')
    expect(field).toHaveAccessibleName('Goals for the week (optional)')
  })

  test('the counter reports the ceiling the field actually enforces', () => {
    render(<PlanWeekPanel />)

    const field = screen.getByLabelText(/goals for the week/i)
    const enforced = field.getAttribute('maxlength')

    expect(enforced).toBe('500')
    expect(screen.getByText(/characters$/i).textContent).toBe(`0 / ${enforced} characters`)
  })

  test('the counter counts what was typed', async () => {
    render(<PlanWeekPanel />)

    // Leading and trailing spaces are deliberate: a counter over
    // `goals.trim().length` reports a different number from the one the field
    // enforces, and 'Monsoon' alone cannot tell the two apart.
    await userEvent.type(screen.getByRole('textbox'), '  Monsoon  ')
    expect(screen.getByText(/characters$/i).textContent).toBe('11 / 500 characters')
  })
})

describe('PlanWeekPanel · with pictures', () => {
  test('ticking the box adds the pictures to the price on the button, before the click', async () => {
    render(<PlanWeekPanel />)

    expect(screen.getByRole('button', { name: /plan my week · 20 credits/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: /also make a picture/i }))

    // 20 for the plan plus five everyday pictures at the Studio's own price.
    expect(
      screen.getByRole('button', { name: /plan my week with pictures · 50 credits/i }),
    ).toBeInTheDocument()
    expect(state.calls).toHaveLength(0)
  })

  test('unticked, no picture is asked for and the illustrator never mounts', async () => {
    render(<PlanWeekPanel />)
    await userEvent.click(screen.getByRole('button', { name: /plan my week/i }))
    expect(screen.queryByRole('region', { name: /pictures for the week/i })).toBeNull()
  })

  test('ticked, the plan lands first and then the pictures start, one card per draft', async () => {
    render(<PlanWeekPanel />)
    await userEvent.click(screen.getByRole('checkbox', { name: /also make a picture/i }))
    await userEvent.click(screen.getByRole('button', { name: /plan my week with pictures/i }))

    const region = await screen.findByRole('region', { name: /pictures for the week/i })
    expect(region.querySelectorAll('[data-illustration]')).toHaveLength(5)
    expect(region.querySelector('[data-illustration="drawing"]')).not.toBeNull()
  })
})
