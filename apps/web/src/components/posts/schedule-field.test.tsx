import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { ScheduleField } from './schedule-field'
import { toChannelSet } from '@sahoda/shared'
import { combine, longLabel } from '@/lib/posts/calendar-month'
import { addDaysInZone, dayKey } from '@/lib/time/day-key'
import { partsInZone, zoneLabel } from '@/lib/time/zone'

/**
 * ── THE FIELD SPEAKS THE WORKSPACE'S CLOCK, AND THESE SAY WHICH ─────────────
 * Every render names its zone. The assertions read days and hours back through
 * `partsInZone` in that same zone rather than through the Date getters, which
 * answer in whatever zone the test machine happens to be in — green on a
 * laptop in Kolkata and red on CI in UTC, or the reverse, for the same code.
 */
const ZONE = 'Asia/Kolkata'
const NY = 'America/New_York'

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

// Far enough ahead to clear every channel's 5-minute minimum lead.
const future = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()

/**
 * ── THE CONTROL THESE FIVE WERE WRITTEN AGAINST NO LONGER EXISTS ─────────────
 * They reached a `datetime-local` input and asserted its `.value` string. The
 * field is a month calendar now, and — the change that matters more — a pick no
 * longer commits: it waits for "Confirm schedule" instead of calling
 * `schedulePost` on the first tap.
 *
 * Every GUARANTEE below is the one its predecessor asserted, retargeted at the
 * screen that now carries it rather than deleted. What a stored time renders
 * as, that a replaced value re-syncs, that removing it returns to the picker,
 * that a pending pick is not wiped by a re-render, and that a confirmed time
 * does not bounce back into the picker. Nothing was loosened to let the new
 * field pass.
 */
describe('ScheduleField — a stored time, and what happens to it', () => {
  const committed = () => document.querySelector('[data-schedule-committed]')

  test('renders a stored time as words rather than a date mask', () => {
    const iso = future(86_400_000)
    render(
      <ScheduleField zone={ZONE} channels={toChannelSet(['x'])} value={iso} onChange={vi.fn()} />,
    )

    const at = new Date(iso)
    expect(committed()).toBeTruthy()
    // The DAY and the CLOCK, both on screen. "27/08/2026, 09:00" is a value;
    // "Thursday, 27 August at 9:00 am IST" is a commitment, and that is the
    // whole reason this panel replaced the mask.
    expect(screen.getByText(new RegExp(`\\b${partsInZone(ZONE, at).day}\\b`))).toBeInTheDocument()
    expect(screen.getByText(/\bat\b.*\d.*IST/)).toBeInTheDocument()
  })

  test('re-syncs when the stored value is replaced underneath it', () => {
    const first = future(86_400_000)
    const second = future(3 * 86_400_000)
    const { rerender } = render(
      <ScheduleField zone={ZONE} channels={toChannelSet(['x'])} value={first} onChange={vi.fn()} />,
    )
    const before = committed()?.textContent ?? ''

    // What `loadTheirs` does after a divergence.
    rerender(
      <ScheduleField
        zone={ZONE}
        channels={toChannelSet(['x'])}
        value={second}
        onChange={vi.fn()}
      />,
    )

    expect(committed()?.textContent).not.toBe(before)
    expect(committed()?.textContent).toContain(String(partsInZone(ZONE, new Date(second)).day))
  })

  test('removing the stored value returns to the picker, not to a blank panel', () => {
    const { rerender } = render(
      <ScheduleField
        zone={ZONE}
        channels={toChannelSet(['x'])}
        value={future(86_400_000)}
        onChange={vi.fn()}
      />,
    )
    rerender(
      <ScheduleField zone={ZONE} channels={toChannelSet(['x'])} value={null} onChange={vi.fn()} />,
    )

    expect(committed()).toBeNull()
    // The state a person with no schedule should meet: something to pick with.
    expect(document.querySelector('[data-schedule-calendar]')).toBeTruthy()
    expect(screen.getByText(/pick a day and a time/i)).toBeInTheDocument()
  })

  test('a pending pick is not wiped by a re-render that changes nothing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(
      <ScheduleField zone={ZONE} channels={toChannelSet(['x'])} value={null} onChange={onChange} />,
    )

    await user.click(screen.getAllByRole('button', { name: /^Tomorrow morning/ })[0]!)
    const summary = document.querySelector('[data-schedule-summary]')?.textContent ?? ''
    expect(summary).toMatch(/going out/i)

    // The parent re-renders constantly while typing elsewhere on the page. A
    // re-sync keyed on a draft/value MISMATCH rather than on the prop changing
    // would throw the pick away here, which is the defect the original of this
    // test was written for.
    rerender(
      <ScheduleField zone={ZONE} channels={toChannelSet(['x'])} value={null} onChange={onChange} />,
    )

    expect(document.querySelector('[data-schedule-summary]')?.textContent).toBe(summary)
    // And nothing has been written: picking is not confirming.
    expect(onChange).not.toHaveBeenCalled()
  })

  test('a confirmed time lands in the committed panel and stays there', async () => {
    const user = userEvent.setup()
    let stored: string | null = null
    const onChange = vi.fn((iso: string | null) => {
      stored = iso
    })
    const { rerender } = render(
      <ScheduleField
        zone={ZONE}
        channels={toChannelSet(['x'])}
        value={stored}
        onChange={onChange}
      />,
    )

    await user.click(screen.getAllByRole('button', { name: /^Tomorrow morning/ })[0]!)
    await user.click(screen.getByRole('button', { name: /Confirm schedule/ }))

    expect(onChange).toHaveBeenCalledTimes(1)
    // Feed the committed value back the way the parent does.
    rerender(
      <ScheduleField
        zone={ZONE}
        channels={toChannelSet(['x'])}
        value={stored}
        onChange={onChange}
      />,
    )

    expect(committed()).toBeTruthy()
    expect(document.querySelector('[data-schedule-calendar]')).toBeNull()
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
    // Reached by picking a day on the calendar rather than by typing into the
    // date mask this replaced. Same claim, same moment in the journey: the
    // instant a reader forms the belief "this will go out then".
    const user = userEvent.setup()
    render(
      <ScheduleField zone={ZONE} channels={toChannelSet(['x'])} value={null} onChange={vi.fn()} />,
    )

    await user.click(document.querySelector('[data-schedule-choice="hour"]') as HTMLElement)

    expect(screen.getByText(NOT_LIVE)).toBeInTheDocument()
  })

  test('says it for a time restored from the server too', () => {
    render(
      <ScheduleField
        zone={ZONE}
        channels={toChannelSet(['x'])}
        value={future(86_400_000)}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText(NOT_LIVE)).toBeInTheDocument()
  })

  test('stays quiet when no time is set — there is no promise to correct', () => {
    render(
      <ScheduleField zone={ZONE} channels={toChannelSet(['x'])} value={null} onChange={vi.fn()} />,
    )

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
        zone={ZONE}
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
        zone={ZONE}
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
        zone={ZONE}
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
        zone={ZONE}
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
        zone={ZONE}
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
        zone={ZONE}
        channels={toChannelSet(['instagram', 'linkedin'])}
        value={future(86_400_000)}
        onChange={vi.fn()}
        autoPublish
      />,
    )

    expect(screen.queryByText(/isn’t connected/)).not.toBeInTheDocument()
  })
})

/**
 * THE NINTH CLICK.
 *
 * `docs/34` §1: eight clicks from nothing to a saved draft, and then no ninth —
 * the journey's stated goal was a first SCHEDULED post and the only control was
 * a bare `dd/mm/yyyy, --:--`. These assert that a person who does not know what
 * a date input is can now reach a scheduled post, and that the words on the
 * buttons are true.
 */
describe('scheduling without knowing what a date input is', () => {
  test('offers named times before it offers a date mask', () => {
    render(
      <ScheduleField zone={ZONE} channels={toChannelSet(['x'])} value={null} onChange={vi.fn()} />,
    )

    // The named choices are present...
    const named = screen.getAllByRole('button', { pressed: false })
    expect(named.length).toBeGreaterThan(1)
    // ...and the date mask is NOT, until it is asked for. That ordering IS the
    // fix: the mask being the first and only control was the defect.
    expect(screen.queryByLabelText(/schedule/i)).toBeNull()
  })

  test('a named choice commits the exact instant its own label prints', async () => {
    // THE ASSERTION THAT MAKES THE LABEL HONEST. A button reading "Tomorrow
    // morning · Mon 24 Aug, 9:00 am" that committed some other time would be a
    // lie told in the most trustworthy-looking place on the screen.
    const user = userEvent.setup()
    let stored: string | null = null
    render(
      <ScheduleField
        zone={ZONE}
        channels={toChannelSet(['x'])}
        value={null}
        onChange={(iso) => {
          stored = iso
        }}
      />,
    )

    const button = document.querySelector('[data-schedule-choice="tomorrow-morning"]')
    expect(button).not.toBeNull()
    const printed = button!.textContent ?? ''
    await user.click(button as HTMLElement)
    // Picking is no longer committing: the instant only reaches the parent once
    // "Confirm schedule" is pressed. The label's honesty is unchanged and is
    // still what this asserts.
    expect(stored).toBeNull()
    await user.click(screen.getByRole('button', { name: /Confirm schedule/ }))

    expect(stored).not.toBeNull()
    const committed = new Date(stored as unknown as string)
    // The label prints a day and a time; the committed instant has to BE them,
    // read in the zone the label was printed in.
    const wall = partsInZone(ZONE, committed)
    expect(printed).toContain(String(wall.day))
    expect(wall.hour).toBe(9)
    expect(wall.minute).toBe(0)
  })

  test('the chosen time reads as chosen, and to a screen reader too', async () => {
    const user = userEvent.setup()
    render(
      <ScheduleField zone={ZONE} channels={toChannelSet(['x'])} value={null} onChange={vi.fn()} />,
    )

    const button = document.querySelector(
      '[data-schedule-choice="tomorrow-evening"]',
    ) as HTMLElement
    expect(button.getAttribute('aria-pressed')).toBe('false')
    await user.click(button)
    // Re-queried: the click re-renders. `aria-pressed` rather than a colour,
    // because a selected state carried only by a fill is a state a screen
    // reader cannot report.
    expect(
      document
        .querySelector('[data-schedule-choice="tomorrow-evening"]')!
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  test('a named choice raises the same correction the date mask does', async () => {
    // The "nothing will actually publish this" sentence was attached to the
    // input. A new path to the same state that skipped it would reintroduce the
    // promise this product refuses to make.
    const user = userEvent.setup()
    render(
      <ScheduleField zone={ZONE} channels={toChannelSet(['x'])} value={null} onChange={vi.fn()} />,
    )

    await user.click(document.querySelector('[data-schedule-choice="hour"]') as HTMLElement)

    expect(screen.getByText(/auto-publish isn't live yet/i)).toBeInTheDocument()
  })

  test('there is a way back to no schedule that is not emptying a date mask', async () => {
    const user = userEvent.setup()
    let stored: string | null = null
    const { rerender } = render(
      <ScheduleField
        zone={ZONE}
        channels={toChannelSet(['x'])}
        value={null}
        onChange={(iso) => {
          stored = iso
        }}
      />,
    )
    await user.click(document.querySelector('[data-schedule-choice="hour"]') as HTMLElement)
    await user.click(screen.getByRole('button', { name: /Confirm schedule/ }))
    expect(stored).not.toBeNull()

    rerender(
      <ScheduleField
        zone={ZONE}
        channels={toChannelSet(['x'])}
        value={stored}
        onChange={(iso) => {
          stored = iso
        }}
      />,
    )
    await user.click(document.querySelector('[data-schedule-clear]') as HTMLElement)

    expect(stored).toBeNull()
  })
})

/**
 * THE LATENCY, STATED.
 *
 * Publishing is a five-minute cron and every measured delivery landed 73-199 s
 * after its tick. A picker that takes a to-the-minute time and says only "at
 * around that time" has declined to say a number it has.
 */
describe('what the picker promises about when it goes out', () => {
  const connected = new Set<'x'>(['x'])

  test('names a window rather than an instant, once the dispatcher is live', async () => {
    const user = userEvent.setup()
    render(
      <ScheduleField
        zone={ZONE}
        channels={toChannelSet(['x'])}
        value={null}
        onChange={vi.fn()}
        autoPublish
        connected={connected}
      />,
    )
    await user.click(
      document.querySelector('[data-schedule-choice="tomorrow-morning"]') as HTMLElement,
    )

    // Two clock readings in the promise, and they differ: that is what a window
    // is. Asserted as a shape, never as prose — rewrite the sentence freely.
    const note = screen.getByText(/goes out between/i).textContent ?? ''
    const times = note.match(/\d{1,2}:\d{2}/g) ?? []
    expect(new Set(times).size).toBeGreaterThanOrEqual(2)
  })

  test('promises no window at all while the dispatcher is off', async () => {
    // With it off nothing goes out, and a delivery range there would be a
    // promise about a rail that is not running.
    const user = userEvent.setup()
    render(
      <ScheduleField
        zone={ZONE}
        channels={toChannelSet(['x'])}
        value={null}
        onChange={vi.fn()}
        connected={connected}
      />,
    )
    await user.click(
      document.querySelector('[data-schedule-choice="tomorrow-morning"]') as HTMLElement,
    )

    expect(screen.queryByText(/goes out between/i)).not.toBeInTheDocument()
    expect(screen.getByText(/auto-publish isn't live yet/i)).toBeInTheDocument()
  })

  test('an unconnected channel still outranks the delivery window', async () => {
    // Order of claims: a channel that cannot receive the post is a promise this
    // schedule cannot keep at all, so it replaces the timing note rather than
    // sitting under it.
    const user = userEvent.setup()
    render(
      <ScheduleField
        zone={ZONE}
        channels={toChannelSet(['x', 'linkedin'])}
        value={null}
        onChange={vi.fn()}
        autoPublish
        connected={connected}
      />,
    )
    await user.click(
      document.querySelector('[data-schedule-choice="tomorrow-morning"]') as HTMLElement,
    )

    expect(screen.getByText(/LinkedIn isn’t connected/)).toBeInTheDocument()
    expect(screen.queryByText(/goes out between/i)).not.toBeInTheDocument()
  })
})

/**
 * THE CALENDAR, THE CONFIRM, AND THE DRAFT.
 *
 * Three things the field could not do before: show a month, wait to be
 * confirmed, and offer a way to stop without leaving a schedule behind.
 */
describe('picking a day, and only then committing it', () => {
  const dayCells = () => document.querySelectorAll('[data-schedule-calendar] [aria-pressed]')

  test('renders a full month grid rather than a date mask', () => {
    render(
      <ScheduleField zone={ZONE} channels={toChannelSet(['x'])} value={null} onChange={vi.fn()} />,
    )

    // Six rows of seven, always, so the panel does not change height between
    // months. The number is the point: a ragged grid is not a calendar.
    expect(dayCells()).toHaveLength(42)
  })

  test('a day before the channels own lead cannot be pressed', () => {
    render(
      <ScheduleField zone={ZONE} channels={toChannelSet(['x'])} value={null} onChange={vi.fn()} />,
    )

    const yesterday = addDaysInZone(ZONE, new Date(), -1)
    const cell = screen.getByRole('button', { name: longLabel(ZONE, yesterday) })

    // Disabled, not merely styled: a control that accepts a value it is about
    // to refuse has wasted the click and taught the reader not to trust the grid.
    expect(cell).toBeDisabled()
  })

  test('picking a day writes nothing until Confirm schedule is pressed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ScheduleField zone={ZONE} channels={toChannelSet(['x'])} value={null} onChange={onChange} />,
    )

    const soon = addDaysInZone(ZONE, new Date(), 3)
    await user.click(screen.getByRole('button', { name: longLabel(ZONE, soon) }))

    // THE CHANGE THAT MATTERS. A pick used to run `schedulePost`, which moves
    // the row out of `draft`, on one tap. A person exploring "what does Friday
    // look like" had committed their post to a queue.
    expect(onChange).not.toHaveBeenCalled()
    expect(document.querySelector('[data-schedule-summary]')?.textContent).toMatch(/going out/i)

    await user.click(screen.getByRole('button', { name: /Confirm schedule/ }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const committedAt = new Date(onChange.mock.calls[0]![0] as string)
    expect(dayKey(ZONE, committedAt)).toBe(dayKey(ZONE, soon))
  })

  test('Confirm schedule cannot be pressed before there is anything to confirm', () => {
    render(
      <ScheduleField zone={ZONE} channels={toChannelSet(['x'])} value={null} onChange={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: /Confirm schedule/ })).toBeDisabled()
  })

  test('Save as draft takes back a schedule that was already confirmed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ScheduleField
        zone={ZONE}
        channels={toChannelSet(['x'])}
        value={future(86_400_000)}
        onChange={onChange}
      />,
    )

    // From the committed panel, the way back is named and visible rather than
    // being "empty the date mask by hand".
    await user.click(screen.getByRole('button', { name: /Change the time/ }))
    await user.click(screen.getByRole('button', { name: /Save as draft/ }))

    expect(onChange).toHaveBeenCalledWith(null)
  })
})

describe('what the reader is told about where it is going', () => {
  test('names every channel the post is going to, with its own verdict', () => {
    render(
      <ScheduleField
        zone={ZONE}
        channels={toChannelSet(['x', 'linkedin'])}
        value={null}
        onChange={vi.fn()}
        connected={new Set(['x'] as const)}
      />,
    )

    const readout = document.querySelector('[data-channel-readout]')
    expect(readout).toBeTruthy()
    expect(readout?.querySelector('[data-channel-status="x"]')?.textContent).toMatch(/connected/i)
    // Not a sentence the reader has to parse into a list: LinkedIn gets its own
    // row and its own way out.
    expect(readout?.querySelector('[data-channel-status="linkedin"]')?.textContent).toMatch(
      /connect it/i,
    )
  })

  test('an unread connection state says so, rather than claiming a channel is off', () => {
    // `connected === undefined` means the read did not happen. A red cross there
    // would send someone to reconnect an account that is fine.
    render(
      <ScheduleField
        zone={ZONE}
        channels={toChannelSet(['linkedin'])}
        value={null}
        onChange={vi.fn()}
      />,
    )

    const status = document.querySelector('[data-channel-status="linkedin"]')?.textContent ?? ''
    expect(status).toMatch(/not checked/i)
    expect(status).not.toMatch(/connect it/i)
  })
})

/**
 * THE WORKSPACE'S ZONE, NOT THE DEVICE'S.
 *
 * MEASURED before this change: a customer in Dubai picks "tomorrow morning",
 * the composer confirms 9:00 am, and the posts list calls the same post
 * 10:30 am IST. The field built its instant with `setHours` on the browser,
 * and every screen read it back in the workspace's zone. These render the same
 * field for a New York workspace and prove the instant it commits is New
 * York's 9:00 — and that the sentence the reader agreed to says so.
 */
describe('a New York workspace, on any device', () => {
  test('"tomorrow morning" commits 9:00 am New York time, on New York’s tomorrow', async () => {
    const user = userEvent.setup()
    let stored: string | null = null
    render(
      <ScheduleField
        zone={NY}
        channels={toChannelSet(['x'])}
        value={null}
        onChange={(iso) => {
          stored = iso
        }}
      />,
    )

    await user.click(
      document.querySelector('[data-schedule-choice="tomorrow-morning"]') as HTMLElement,
    )
    await user.click(screen.getByRole('button', { name: /Confirm schedule/ }))

    expect(stored).not.toBeNull()
    const committed = new Date(stored as unknown as string)
    expect(partsInZone(NY, committed)).toMatchObject({ hour: 9, minute: 0 })
    expect(dayKey(NY, committed)).toBe(dayKey(NY, addDaysInZone(NY, new Date(), 1)))
    // And it is NOT Kolkata's 9:00: the two are nine and a half hours apart
    // (or ten and a half in winter), never the same instant.
    expect(partsInZone(ZONE, committed).hour).not.toBe(9)
  })

  test('the sentence the reader agrees to names the zone it was built in', async () => {
    const user = userEvent.setup()
    render(
      <ScheduleField zone={NY} channels={toChannelSet(['x'])} value={null} onChange={vi.fn()} />,
    )

    await user.click(
      document.querySelector('[data-schedule-choice="tomorrow-morning"]') as HTMLElement,
    )

    const summary = document.querySelector('[data-schedule-summary]')?.textContent ?? ''
    // The zone's own label, read at the instant the chip means (tomorrow, 9:00
    // New York), so it is right on either side of daylight saving; never IST,
    // and never a bare clock.
    const label = zoneLabel(NY, combine(NY, addDaysInZone(NY, new Date(), 1), 9, 0))
    expect(summary).toContain(`at 9:00 am ${label}`)
    expect(summary).not.toMatch(/IST/)
    // The chip printed the same clock and the same zone the sentence did.
    const chip =
      document.querySelector('[data-schedule-choice="tomorrow-morning"]')?.textContent ?? ''
    expect(chip).toContain(`9:00 am ${label}`)
  })

  test('a stored instant is read back in New York, not in Kolkata', () => {
    // 2026-09-02T20:00-04:00: Wednesday evening in New York, Thursday morning
    // in Kolkata. The committed panel must say Wednesday.
    render(
      <ScheduleField
        zone={NY}
        channels={toChannelSet(['x'])}
        value="2026-09-02T20:00:00-04:00"
        onChange={vi.fn()}
      />,
    )
    const at = new Date('2026-09-02T20:00:00-04:00')
    const panel = document.querySelector('[data-schedule-committed]')?.textContent ?? ''
    expect(panel).toMatch(new RegExp(`Wednesday,? 2 September at 8:00 pm ${zoneLabel(NY, at)}`))
    expect(panel).not.toMatch(/Thursday/)
  })
})
