import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { ConfirmAll } from './confirm-all'

/**
 * MEASURED 2026-09-06 on the wt-core preview against production: "Confirm all
 * 4" on the Customer persona card fired four sequential POSTs and wrote
 * versions 4, 5, 6 and 7 of the QA workspace's brain inside 1.1 seconds. The
 * console's "Confirm selected" wrote two fields as ONE version in the same
 * session. `brain-resolve-fields.ts` exists so a gesture is one write; this
 * button was the one caller still looping the per-field action.
 */
const confirmBrainFields = vi.hoisted(() => vi.fn())
vi.mock('@/app/actions/brain-resolve-fields', () => ({ confirmBrainFields }))

beforeEach(() => {
  vi.clearAllMocks()
  confirmBrainFields.mockResolvedValue({ ok: true, version: 2, confirmed: 2 })
})

const TARGETS = [
  { path: 'voice.how_it_sounds', value: 'warm' },
  { path: 'voice.never_say', value: ['synergy'] },
]

describe('ConfirmAll', () => {
  test('confirms every remaining guess in ONE write', async () => {
    render(<ConfirmAll targets={TARGETS} />)

    await userEvent.click(screen.getByRole('button', { name: /Confirm all/ }))

    expect(confirmBrainFields).toHaveBeenCalledTimes(1)
    expect(confirmBrainFields).toHaveBeenCalledWith(['voice.how_it_sounds', 'voice.never_say'])
  })

  test('says how many there are, so the press is not a leap', () => {
    render(<ConfirmAll targets={TARGETS} />)

    expect(screen.getByRole('button', { name: /Confirm all 2/ })).toBeInTheDocument()
  })

  test('renders nothing when the section is already fully confirmed', () => {
    const { container } = render(<ConfirmAll targets={[]} />)

    // A "Confirm all" over nothing is a button whose press records nothing.
    expect(container).toBeEmptyDOMElement()
  })

  test('a refusal is shown in the server’s words, and nothing is half-done', async () => {
    confirmBrainFields.mockResolvedValueOnce({
      ok: false,
      message: 'Could not confirm those fields.',
    })
    render(<ConfirmAll targets={TARGETS} />)

    await userEvent.click(screen.getByRole('button', { name: /Confirm all/ }))

    // One write means one outcome: there is no "1 of 2" to report any more.
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not confirm/i)
  })

  test('a throw (no network) is reported, not swallowed and not rendered as a crash', async () => {
    confirmBrainFields.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<ConfirmAll targets={TARGETS} />)

    await userEvent.click(screen.getByRole('button', { name: /Confirm all/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/connection|reach/i)
    expect(screen.getByRole('button', { name: /Confirm all 2/ })).toBeEnabled()
  })
})
