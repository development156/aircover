import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { ScheduleField } from './schedule-field'

/**
 * `draft` was seeded from `value` once and never re-synced, so restoring the
 * other version after a divergence swapped `scheduled_at` underneath the field
 * while it kept showing the pre-restore time.
 *
 * The counterweight is the second test: `handleChange` deliberately withholds
 * `onChange` for an incomplete or too-soon datetime, so draft and value
 * legitimately disagree mid-typing. A re-sync keyed on that mismatch instead of
 * on the prop changing would eat keystrokes.
 */

const input = () => screen.getByLabelText(/schedule/i) as HTMLInputElement

// Far enough ahead to clear every channel's 5-minute minimum lead.
const future = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()

describe('ScheduleField', () => {
  test('shows the stored value as local wall-clock time', () => {
    const iso = future(86_400_000)
    render(<ScheduleField channels={['x']} value={iso} onChange={vi.fn()} />)

    const expected = new Date(iso)
    expect(input().value).toMatch(
      new RegExp(
        `^${expected.getFullYear()}-.*T\\d{2}:${String(expected.getMinutes()).padStart(2, '0')}$`,
      ),
    )
  })

  test('re-syncs when the stored value is replaced underneath it', () => {
    const first = future(86_400_000)
    const second = future(172_800_000)
    const { rerender } = render(<ScheduleField channels={['x']} value={first} onChange={vi.fn()} />)
    const before = input().value

    // What `loadTheirs` does after a divergence.
    rerender(<ScheduleField channels={['x']} value={second} onChange={vi.fn()} />)

    expect(input().value).not.toBe(before)
    expect(input().value).toContain(String(new Date(second).getDate()).padStart(2, '0'))
  })

  test('clears the field when the stored value is removed', () => {
    const { rerender } = render(
      <ScheduleField channels={['x']} value={future(86_400_000)} onChange={vi.fn()} />,
    )
    rerender(<ScheduleField channels={['x']} value={null} onChange={vi.fn()} />)

    expect(input().value).toBe('')
    expect(screen.getByText(/stays a draft/i)).toBeInTheDocument()
  })

  test('does not eat keystrokes while the typed value is not yet committed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    // value stays null throughout: an incomplete datetime never reaches onChange,
    // which is exactly when a mismatch-keyed re-sync would wipe the input.
    render(<ScheduleField channels={['x']} value={null} onChange={onChange} />)

    await user.type(input(), '2030-01-01T10:30')

    expect(input().value).toBe('2030-01-01T10:30')
  })

  test('a committed edit round-trips without the field jumping', async () => {
    const user = userEvent.setup()
    let stored: string | null = null
    const onChange = vi.fn((iso: string | null) => {
      stored = iso
    })
    const { rerender } = render(
      <ScheduleField channels={['x']} value={stored} onChange={onChange} />,
    )

    await user.type(input(), '2030-01-01T10:30')
    const typed = input().value
    // Feed the committed value back the way the parent does.
    rerender(<ScheduleField channels={['x']} value={stored} onChange={onChange} />)

    expect(input().value).toBe(typed)
  })
})
