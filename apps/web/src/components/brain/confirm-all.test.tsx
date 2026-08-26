import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { ConfirmAll } from './confirm-all'

const confirmBrainField = vi.hoisted(() => vi.fn())
vi.mock('@/app/actions/brand-field', () => ({ confirmBrainField }))

beforeEach(() => {
  vi.clearAllMocks()
  confirmBrainField.mockResolvedValue({ ok: true, version: 2, unchanged: false })
})

const TARGETS = [
  { path: 'voice.how_it_sounds', value: 'warm' },
  { path: 'voice.never_say', value: ['synergy'] },
]

describe('ConfirmAll', () => {
  test('confirms every remaining guess, each with its own value', async () => {
    render(<ConfirmAll targets={TARGETS} />)

    await userEvent.click(screen.getByRole('button', { name: /Confirm all/ }))

    expect(confirmBrainField).toHaveBeenCalledTimes(2)
    expect(confirmBrainField).toHaveBeenCalledWith('voice.how_it_sounds', 'warm')
    expect(confirmBrainField).toHaveBeenCalledWith('voice.never_say', ['synergy'])
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

  test('reports a partial failure instead of leaving the counts to be compared', async () => {
    confirmBrainField
      .mockResolvedValueOnce({ ok: true, version: 2, unchanged: false })
      .mockResolvedValueOnce({ ok: false, message: 'nope' })
    render(<ConfirmAll targets={TARGETS} />)

    await userEvent.click(screen.getByRole('button', { name: /Confirm all/ }))

    // The CLAIM, not the wording: one did not land, and the rest did.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('1 of 2')
    expect(alert).toHaveTextContent(/rest were/i)
  })

  test('counts a throw as a failure rather than as a success', async () => {
    confirmBrainField.mockRejectedValue(new Error('network'))
    render(<ConfirmAll targets={TARGETS} />)

    await userEvent.click(screen.getByRole('button', { name: /Confirm all/ }))

    // A rejected promise and an `ok: false` read the same to the person: still
    // a guess. Asserting the sentence, because a swallowed throw would leave
    // this silent and the marks unchanged.
    expect(await screen.findByRole('alert')).toHaveTextContent('2 of 2')
  })
})
