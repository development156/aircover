import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const setWorkspaceTimezone = vi.fn()
vi.mock('@/app/actions/workspace', () => ({
  setWorkspaceTimezone: (...args: unknown[]) => setWorkspaceTimezone(...args),
}))

import { WorkspaceTimezoneField } from './workspace-timezone-field'

const WS = '11111111-1111-4111-8111-111111111111'

/**
 * The two claims this control makes about the customer, and neither may slip.
 *
 * 1. It never stores the browser's zone on its own. That value is a fact about
 *    a DEVICE, and a founder reading this on holiday in London still runs a
 *    bakery in Pune. It is offered, and it has to be chosen.
 * 2. It says plainly that nothing on any screen changes yet. The row's
 *    disclosure lives on the page; what this file pins is that a save reports
 *    what was actually stored, including a clear.
 */
describe('WorkspaceTimezoneField', () => {
  beforeEach(() => {
    setWorkspaceTimezone.mockReset()
    setWorkspaceTimezone.mockResolvedValue({ ok: true, timezone: 'Europe/London' })
  })

  it('shows the stored zone and saves nothing until something changes', () => {
    render(<WorkspaceTimezoneField workspaceId={WS} initialTimezone="Asia/Kolkata" />)

    expect(screen.getByLabelText('Time zone')).toHaveValue('Asia/Kolkata')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(setWorkspaceTimezone).not.toHaveBeenCalled()
  })

  it('never writes the device zone on its own, however long it sits there', async () => {
    render(<WorkspaceTimezoneField workspaceId={WS} initialTimezone={null} />)

    // The device zone is OFFERED — it is in the list — and that is the whole
    // extent of it. Nothing is sent.
    await waitFor(() => expect(screen.getByLabelText('Time zone')).toHaveValue(''))
    expect(setWorkspaceTimezone).not.toHaveBeenCalled()
  })

  it('sends the chosen zone, and reports back the one that was stored', async () => {
    render(<WorkspaceTimezoneField workspaceId={WS} initialTimezone={null} />)

    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Europe/London' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(setWorkspaceTimezone).toHaveBeenCalledWith(WS, 'Europe/London'))
    expect(await screen.findByText(/Sahoda has this workspace in Europe\/London/)).toBeVisible()
  })

  it('sends null when the answer is withdrawn, not an empty string', async () => {
    // `''` would fail the CHECK-free column silently as a stored empty zone.
    // NULL is the value that means nobody has told us, and withdrawing an
    // answer has to produce it.
    setWorkspaceTimezone.mockResolvedValue({ ok: true, timezone: null })
    render(<WorkspaceTimezoneField workspaceId={WS} initialTimezone="Asia/Kolkata" />)

    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(setWorkspaceTimezone).toHaveBeenCalledWith(WS, null))
    expect(await screen.findByText(/no time zone for this workspace/)).toBeVisible()
  })

  it('keeps a stored zone this browser has never heard of, rather than blanking it', async () => {
    // The regression: a select whose options come from the runtime drops a
    // value it does not contain, and the control then reads as "Not set" over a
    // setting that is really there. One Save later it would be gone.
    render(<WorkspaceTimezoneField workspaceId={WS} initialTimezone="Antarctica/Troll" />)

    await waitFor(() => expect(screen.getByLabelText('Time zone')).toHaveValue('Antarctica/Troll'))
  })

  it('says what went wrong and keeps the edit, so nothing has to be retyped', async () => {
    setWorkspaceTimezone.mockResolvedValue({
      ok: false,
      message: 'Sahoda does not recognise the time zone Mars/Olympus.',
    })
    render(<WorkspaceTimezoneField workspaceId={WS} initialTimezone={null} />)

    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Europe/London' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/does not recognise the time zone/)).toBeVisible()
    expect(screen.getByLabelText('Time zone')).toHaveValue('Europe/London')
  })
})
