import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AutopilotLimits } from './autopilot-limits'

/**
 * The two promises, and the three ways a control like this normally lies.
 *
 * FIRST, by showing an empty field. On a control governing autopilot, blank
 * reads as "no limit", which is the worst available reading. The current values
 * are always shown.
 *
 * SECOND, by promising a precision the schedule cannot keep. The tick runs
 * every ten minutes, so a window shorter than that closes BETWEEN ticks and the
 * post goes out on the following one. Later than the number says, never
 * earlier. The copy says "at least".
 *
 * THIRD, by treating zero as empty. A cap of 0 is a real choice — send nothing
 * on its own — and a control that swallowed it would silently restore the
 * default.
 */

const action = vi.hoisted(() => ({ setLoopSettings: vi.fn() }))
vi.mock('@/app/actions/loop-dial', () => action)

beforeEach(() => {
  action.setLoopSettings.mockResolvedValue({ ok: true })
})

afterEach(() => {
  vi.clearAllMocks()
})

function limits(over: Partial<Parameters<typeof AutopilotLimits>[0]> = {}) {
  return <AutopilotLimits dailyCap={3} cancelMinutes={30} armed={false} {...over} />
}

describe('what the reader is shown', () => {
  it('shows the figures actually in force, never a blank field', () => {
    render(limits())
    expect(screen.getByDisplayValue('3')).toBeInTheDocument()
    expect(screen.getByDisplayValue('30')).toBeInTheDocument()
  })

  it('shows a cap of zero as zero, because that is a choice and not an absence', () => {
    render(limits({ dailyCap: 0 }))
    expect(screen.getByDisplayValue('0')).toBeInTheDocument()
  })

  it('says the numbers are not yet holding anything when no channel is armed', () => {
    render(limits({ armed: false }))
    expect(screen.getByText(/nothing is set to/i)).toBeInTheDocument()
  })

  it('says they hold for every armed channel when one is', () => {
    render(limits({ armed: true }))
    expect(screen.queryByText(/nothing is set to/i)).not.toBeInTheDocument()
    expect(screen.getByText(/every channel/i)).toBeInTheDocument()
  })

  it('never promises a post goes out the moment the window closes', () => {
    // The tick is every ten minutes. "Sahoda waits at least this long" is true;
    // "your post goes out after N minutes" would be a claim the schedule cannot
    // keep for any window under ten.
    render(limits())
    expect(screen.getByText(/at least this long/i)).toBeInTheDocument()
  })

  it('says whose day the cap is counted in, because that was a deliberate decision', () => {
    render(limits())
    expect(screen.getByText(/your own day/i)).toBeInTheDocument()
  })
})

describe('saving', () => {
  it('cannot be saved until something changes', () => {
    render(limits())
    expect(screen.getByRole('button', { name: /save limits/i })).toBeDisabled()
  })

  it('sends both values, as the customer typed them', async () => {
    render(limits())

    const cap = screen.getByDisplayValue('3')
    await userEvent.clear(cap)
    await userEvent.type(cap, '5')
    await userEvent.click(screen.getByRole('button', { name: /save limits/i }))

    expect(action.setLoopSettings).toHaveBeenCalledWith({
      autopilotDailyCap: '5',
      autopilotCancelMinutes: '30',
    })
  })

  it('reports a refusal without claiming a charge, and keeps the button usable', async () => {
    action.setLoopSettings.mockResolvedValue({
      ok: false,
      message: 'Pick how many posts a day, between 0 and 20.',
    })
    render(limits())

    const cap = screen.getByDisplayValue('3')
    await userEvent.clear(cap)
    await userEvent.type(cap, '99')
    await userEvent.click(screen.getByRole('button', { name: /save limits/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/between 0 and 20/i)
    expect(alert).toHaveTextContent(/nothing was charged/i)
    expect(screen.getByRole('button', { name: /save limits/i })).toBeEnabled()
  })

  it('does not say saved when the save was refused', async () => {
    action.setLoopSettings.mockResolvedValue({ ok: false, message: 'No.' })
    render(limits())

    const cap = screen.getByDisplayValue('3')
    await userEvent.clear(cap)
    await userEvent.type(cap, '4')
    await userEvent.click(screen.getByRole('button', { name: /save limits/i }))

    await screen.findByRole('alert')
    expect(screen.queryByText(/^saved\.$/i)).not.toBeInTheDocument()
  })
})
