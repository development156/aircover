import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { ScheduleField } from './schedule-field'
import { toChannelSet } from '@sahoda/shared'

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
    render(<ScheduleField channels={toChannelSet(['x'])} value={iso} onChange={vi.fn()} />)

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
    const { rerender } = render(
      <ScheduleField channels={toChannelSet(['x'])} value={first} onChange={vi.fn()} />,
    )
    const before = input().value

    // What `loadTheirs` does after a divergence.
    rerender(<ScheduleField channels={toChannelSet(['x'])} value={second} onChange={vi.fn()} />)

    expect(input().value).not.toBe(before)
    expect(input().value).toContain(String(new Date(second).getDate()).padStart(2, '0'))
  })

  test('clears the field when the stored value is removed', () => {
    const { rerender } = render(
      <ScheduleField
        channels={toChannelSet(['x'])}
        value={future(86_400_000)}
        onChange={vi.fn()}
      />,
    )
    rerender(<ScheduleField channels={toChannelSet(['x'])} value={null} onChange={vi.fn()} />)

    expect(input().value).toBe('')
    expect(screen.getByText(/stays a draft/i)).toBeInTheDocument()
  })

  test('does not eat keystrokes while the typed value is not yet committed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    // value stays null throughout: an incomplete datetime never reaches onChange,
    // which is exactly when a mismatch-keyed re-sync would wipe the input.
    render(<ScheduleField channels={toChannelSet(['x'])} value={null} onChange={onChange} />)

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
      <ScheduleField channels={toChannelSet(['x'])} value={stored} onChange={onChange} />,
    )

    await user.type(input(), '2030-01-01T10:30')
    const typed = input().value
    // Feed the committed value back the way the parent does.
    rerender(<ScheduleField channels={toChannelSet(['x'])} value={stored} onChange={onChange} />)

    expect(input().value).toBe(typed)
  })
})

/**
 * Picking a time is the moment the writer forms the belief "this will go out
 * then". Nothing dispatches a scheduled publish — no cron, no trigger, no
 * dependency on @sahoda/jobs from apps/web — so the belief has to be corrected
 * where it is formed, not only later on the list screens.
 */
describe('what setting a time actually does', () => {
  const NOT_LIVE = /auto-publish isn't live yet/i

  test('says a time does not publish the post', async () => {
    const user = userEvent.setup()
    render(<ScheduleField channels={toChannelSet(['x'])} value={null} onChange={vi.fn()} />)

    await user.type(input(), '2030-01-01T10:30')

    expect(screen.getByText(NOT_LIVE)).toBeInTheDocument()
  })

  test('says it for a time restored from the server too', () => {
    render(
      <ScheduleField
        channels={toChannelSet(['x'])}
        value={future(86_400_000)}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText(NOT_LIVE)).toBeInTheDocument()
  })

  test('stays quiet when no time is set — there is no promise to correct', () => {
    render(<ScheduleField channels={toChannelSet(['x'])} value={null} onChange={vi.fn()} />)

    expect(screen.queryByText(NOT_LIVE)).not.toBeInTheDocument()
  })
})

/**
 * The warning post f0a777cf never got.
 *
 * That post was scheduled for both Instagram and LinkedIn. Instagram published;
 * LinkedIn failed at CONNECTION_UNAVAILABLE thirty seconds later, because the
 * workspace had no LinkedIn connection and never had one. The editor DID say so —
 * `PublishNow` renders an unconnected-channel block — but `PlannerReschedule`
 * renders this component alone, with no picker and no publish panel, and
 * `ConnectFirstNote` is silent by design once any one channel is connected. So on
 * `/planner` the schedule was set with nothing on screen mentioning it.
 *
 * The note REPLACES the generic line rather than stacking under it: the line it
 * displaces says "on every connected channel", which is true and useless to
 * someone who does not know which of theirs those are.
 */
describe('ScheduleField warns about a channel that cannot receive the post', () => {
  const connected = new Set<'instagram'>(['instagram'])

  test('names the unconnected channel once a time is set', () => {
    render(
      <ScheduleField
        channels={toChannelSet(['instagram', 'linkedin'])}
        value={future(86_400_000)}
        onChange={vi.fn()}
        autoPublish
        connected={connected}
      />,
    )

    expect(screen.getByText(/LinkedIn isn’t connected/)).toBeInTheDocument()
    // The vague line it replaces must be gone, not merely joined.
    expect(screen.queryByText(/on every connected channel/)).not.toBeInTheDocument()
  })

  test('says nothing goes out when no picked channel is connected', () => {
    render(
      <ScheduleField
        channels={toChannelSet(['linkedin'])}
        value={future(86_400_000)}
        onChange={vi.fn()}
        autoPublish
        connected={connected}
      />,
    )

    expect(screen.getByText(/Nothing goes out at that time/)).toBeInTheDocument()
  })

  test('a duplicated channel cannot turn "nothing goes out" into "it goes out"', () => {
    // `post.channels` is a text[] off the row, not a set, and the planner passes it
    // straight through. Counting names against `channels.length` would read
    // 1-of-2 here and promise the post goes out somewhere.
    render(
      <ScheduleField
        channels={toChannelSet(['linkedin', 'linkedin'])}
        value={future(86_400_000)}
        onChange={vi.fn()}
        autoPublish
        connected={connected}
      />,
    )

    expect(screen.getByText(/Nothing goes out at that time/)).toBeInTheDocument()
    // ...and it names that channel ONCE. The list is the part the reader acts on:
    // "LinkedIn and LinkedIn" reads as two separate accounts to go and reconnect.
    expect(screen.getByText(/LinkedIn isn’t connected/)).toBeInTheDocument()
  })

  test('stays quiet with no time set — there is no promise to correct yet', () => {
    render(
      <ScheduleField
        channels={toChannelSet(['instagram', 'linkedin'])}
        value={null}
        onChange={vi.fn()}
        autoPublish
        connected={connected}
      />,
    )

    expect(screen.queryByText(/isn’t connected/)).not.toBeInTheDocument()
  })

  test('stays quiet when the dispatcher is off — nothing goes out on ANY channel', () => {
    // Naming one channel here would imply the others are fine, which is the
    // opposite of the truth. The existing note already says nothing auto-posts.
    render(
      <ScheduleField
        channels={toChannelSet(['instagram', 'linkedin'])}
        value={future(86_400_000)}
        onChange={vi.fn()}
        connected={connected}
      />,
    )

    expect(screen.queryByText(/isn’t connected/)).not.toBeInTheDocument()
    // ASCII apostrophe on purpose: `SCHEDULE_FIELD_NOTE` uses one, while the copy
    // in `connection-gap.ts` uses the typographic `’`. A regex that assumes either
    // one everywhere passes vacuously against the other.
    expect(screen.getByText(/isn't live yet/)).toBeInTheDocument()
  })

  test('stays quiet when the connection state was not read at all', () => {
    render(
      <ScheduleField
        channels={toChannelSet(['instagram', 'linkedin'])}
        value={future(86_400_000)}
        onChange={vi.fn()}
        autoPublish
      />,
    )

    expect(screen.queryByText(/isn’t connected/)).not.toBeInTheDocument()
  })
})
