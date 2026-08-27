'use client'

import { useEffect, useState } from 'react'
import { CalendarCheck, CalendarClock, FlaskConical, Pencil, Plug, X as XIcon } from 'lucide-react'
import type { Channel, ChannelSet } from '@sahoda/shared'

import { Button } from '@/components/ui/button'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { cn } from '@/lib/utils'
import { scheduleGapNote, unconnectedFrom } from '@/lib/posts/connection-gap'
import { clockTime, longDay, startOfDay } from '@/lib/posts/calendar-month'
import { earliestScheduleAt, validateScheduleLead } from '@/lib/posts/schedule'
import { deliveryRangeNote, formatChoiceTime, scheduleChoices } from '@/lib/posts/schedule-choices'
import { scheduleFieldNote } from '@/lib/posts/schedule-status'

import { ChannelReadout } from './channel-readout'
import { ScheduleCalendar } from './schedule-calendar'

export interface ScheduleFieldProps {
  channels: ChannelSet
  /** ISO string from `posts.scheduled_at`, or null for "no schedule". */
  value: string | null
  onChange: (iso: string | null) => void
  /** Whether the dispatcher is on HERE. Server fact; false under-promises. */
  autoPublish?: boolean
  /** What the server said when the schedule was last committed. */
  error?: string | null
  /** Channels with a live connection, read on the server. Undefined means NOT KNOWN. */
  connected?: ReadonlySet<Channel>
}

const CLOCK_REFRESH_MS = 30_000

function parsed(iso: string | null): Date | null {
  if (iso === null) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * WHEN THE POST GOES OUT — chosen, then CONFIRMED.
 *
 * ── THE CHANGE THAT MATTERS IS NOT THE CALENDAR ──────────────────────────────
 * Pressing a time used to schedule the post. Immediately, silently, on one tap:
 * `onChange` ran `schedulePost`, which calls `release_post_for_publish` and
 * moves the row out of `draft`. A person exploring "what does tomorrow morning
 * look like" had committed their post to a queue, and the only sign was a note
 * further down the page.
 *
 * Now a pick is a PICK. It lives here until "Confirm schedule" is pressed, and
 * nothing reaches the database before that. "Save as draft" is the other half of
 * the same sentence and it is a real control rather than the absence of one.
 *
 * ── AND ONCE IT IS CONFIRMED, THE PANEL SAYS SO ──────────────────────────────
 * A scheduled post shows what it is committed to, in words, with the two things
 * a person then wants: change it, or take it back. That state used to be a
 * populated date mask, which is a form, not an answer.
 */
export function ScheduleField({
  channels,
  value,
  onChange,
  autoPublish = false,
  error = null,
  connected,
}: ScheduleFieldProps) {
  const [now, setNow] = useState<Date | null>(null)
  /** The pending pick. Nothing here has reached the database. */
  const [pending, setPending] = useState<Date | null>(null)
  const [anchor, setAnchor] = useState<Date | null>(null)
  /** True while re-picking a time the post is already committed to. */
  const [editing, setEditing] = useState(false)

  // The clock is set after mount: rendering `new Date()` during SSR would
  // hydrate against a different instant, and validating against a server clock
  // would give the reader a verdict about a timezone they are not in.
  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), CLOCK_REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  const committed = parsed(value)

  // A confirmed schedule closes the editor. Keyed on the value so a schedule
  // restored from elsewhere (a divergence resolution) lands in the same state.
  const [syncedValue, setSyncedValue] = useState<string | null>(value)
  if (value !== syncedValue) {
    setSyncedValue(value)
    setPending(null)
    setEditing(false)
  }

  if (now === null) {
    return (
      <div className="space-y-2" data-guide="post-schedule">
        <p className="type-meta text-muted">Checking the times each channel will accept…</p>
      </div>
    )
  }

  const earliest = earliestScheduleAt(channels, now)
  const choices = scheduleChoices(channels, now)
  const check = pending === null ? null : validateScheduleLead(channels, pending, now)
  const unconnectedLabels = unconnectedFrom(channels, connected).map(
    (channel) => CHANNEL_LABELS[channel],
  )
  /**
   * ── ONLY WHEN THE DISPATCHER IS ACTUALLY ON ─────────────────────────────────
   * With it off, nothing goes out on ANY channel and `scheduleFieldNote` already
   * says so. Naming one channel there would imply the others are fine, which is
   * the opposite of the truth. This guard was dropped in the rewrite and
   * `schedule-field.test.tsx` caught it.
   */
  const gap = autoPublish
    ? scheduleGapNote(
        unconnectedLabels,
        channels.some((channel) => connected?.has(channel) === true),
      )
    : null

  /**
   * What the reader is promised about `at`, in order of what outranks what.
   *
   * A channel that cannot receive the post is a promise this schedule cannot
   * keep at all, so it replaces the timing note rather than sitting under it.
   * With the rail live and nothing to warn about, the sentence is the DELIVERY
   * RANGE rather than "at around that time": the sweep is a five-minute cron and
   * every measured delivery landed 73-199s after its tick, so "around" was the
   * product declining to say a number it had.
   */
  const promise = (at: Date): string =>
    gap ?? (autoPublish ? deliveryRangeNote(at) : scheduleFieldNote(autoPublish))

  function choose(at: Date) {
    setPending(at)
    setAnchor(startOfDay(at))
  }

  // ── ALREADY SCHEDULED, AND NOT BEING CHANGED ──────────────────────────────
  if (committed !== null && !editing) {
    return (
      <div className="space-y-3" data-guide="post-schedule" data-schedule-committed>
        <div className="surface-ring flex flex-wrap items-start gap-3 rounded-card bg-ok-bg p-3">
          <CalendarCheck
            size={18}
            strokeWidth={1.8}
            className="mt-0.5 shrink-0 text-ok"
            aria-hidden
          />
          <div className="space-y-0.5">
            <p className="type-eyebrow text-ok">Scheduled</p>
            <p className="type-h3 text-ink">
              {longDay(committed)} at {clockTime(committed)}
            </p>
            <p className="type-meta text-muted">{promise(committed)}</p>
          </div>
        </div>

        <ChannelReadout channels={channels} connected={connected} />

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setEditing(true)
              setPending(committed)
              setAnchor(startOfDay(committed))
            }}
          >
            <Pencil aria-hidden />
            Change the time
          </Button>
          <Button variant="ghost" data-schedule-clear onClick={() => onChange(null)}>
            <XIcon aria-hidden />
            Clear the schedule, keep this a draft
          </Button>
        </div>

        {error !== null ? (
          <p role="alert" className="type-meta text-danger">
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  // ── PICKING ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3" data-guide="post-schedule">
      <div role="group" aria-label="When to post" className="flex flex-wrap gap-1.5">
        {choices.map((choice) => {
          const on = pending !== null && pending.getTime() === choice.when.getTime()
          return (
            <button
              key={choice.id}
              type="button"
              data-schedule-choice={choice.id}
              aria-pressed={on}
              onClick={() => choose(choice.when)}
              className={cn(
                'flex flex-col items-start rounded-full border px-3 py-1.5 text-left transition-micro max-narrow:min-h-[var(--control-h-touch)]',
                on
                  ? 'border-transparent bg-ink text-white dark:bg-white dark:text-[var(--canvas)]'
                  : 'border-line bg-surface text-ink hover:bg-s2',
              )}
            >
              {/* Two explicit spans. A bare text fragment beside another one in a
                  flex container becomes its OWN flex item, which rendered a label
                  as six unreadable pieces at 390px. */}
              <span className="type-chip">{choice.label}</span>
              <span className={cn('type-meta tabular-nums', on ? 'opacity-75' : 'text-muted')}>
                {formatChoiceTime(choice.when)}
              </span>
            </button>
          )
        })}
      </div>

      <ScheduleCalendar
        anchor={anchor ?? startOfDay(now)}
        onAnchorChange={setAnchor}
        value={pending}
        onChange={choose}
        earliest={earliest}
        now={now}
      />

      {/* THE SENTENCE THE READER IS ABOUT TO AGREE TO. Written out in full,
          because "27/08/2026, 09:00" is a value and "Thursday, 27 August at
          9:00 am" is a commitment. */}
      <div className="surface-ring space-y-1 rounded-sm bg-s2 p-3" data-schedule-summary>
        {pending === null ? (
          <p className="type-sm text-muted">Pick a day and a time, then confirm it below.</p>
        ) : (
          <>
            <p className="type-eyebrow text-muted">Going out</p>
            <p className="type-h3 text-ink">
              {longDay(pending)} at {clockTime(pending)}
            </p>
          </>
        )}
      </div>

      <ChannelReadout channels={channels} connected={connected} />

      {error !== null ? (
        <p role="alert" className="type-meta text-danger">
          {error}
        </p>
      ) : check !== null && !check.ok && check.message !== undefined ? (
        <p role="alert" className="type-meta text-danger">
          {check.message} Nothing was saved.
        </p>
      ) : null}

      {pending !== null && (check?.ok ?? false) ? (
        <p className="flex items-start gap-1.5 type-meta text-muted">
          {gap !== null ? (
            <Plug size={13} strokeWidth={2} className="mt-[2px] shrink-0 text-warn" aria-hidden />
          ) : autoPublish ? (
            <CalendarClock size={13} strokeWidth={2} className="mt-[2px] shrink-0" aria-hidden />
          ) : (
            <FlaskConical size={13} strokeWidth={2} className="mt-[2px] shrink-0" aria-hidden />
          )}
          <span className={gap === null ? undefined : 'text-warn'}>{promise(pending)}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {/* THE COMMIT. Orange with ink on it — founder's ruling, recorded in
            REQUESTS §31: the button that does the irreversible thing is the one
            that should be impossible to miss. */}
        <Button
          data-schedule-confirm
          disabled={pending === null || !(check?.ok ?? false)}
          onClick={() => pending !== null && onChange(pending.toISOString())}
        >
          <CalendarCheck aria-hidden />
          Confirm schedule
        </Button>
        <Button
          variant="secondary"
          data-schedule-draft
          onClick={() => {
            setPending(null)
            setEditing(false)
            if (committed !== null) onChange(null)
          }}
        >
          Save as draft
        </Button>
      </div>
    </div>
  )
}
