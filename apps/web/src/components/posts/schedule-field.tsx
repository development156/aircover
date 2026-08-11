'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, FlaskConical, Plug } from 'lucide-react'
import type { Channel, ChannelSet } from '@sahoda/shared'

import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { scheduleGapNote, unconnectedFrom } from '@/lib/posts/connection-gap'
import { earliestScheduleAt, validateScheduleLead } from '@/lib/posts/schedule'
import { scheduleFieldNote } from '@/lib/posts/schedule-status'

export interface ScheduleFieldProps {
  channels: ChannelSet
  /** ISO string from `posts.scheduled_at`, or null for "no schedule". */
  value: string | null
  onChange: (iso: string | null) => void
  /** Whether the dispatcher is on HERE. Server fact; false under-promises. */
  autoPublish?: boolean
  /**
   * What the server said when the schedule was last committed.
   *
   * Setting a time is a STATUS change now — it goes through
   * `release_post_for_publish` / `reschedule_post` — and those refuse a post that
   * is already going out. A picker that swallowed that would show a time the
   * database never accepted.
   */
  error?: string | null
  /**
   * Channels with a live connection, read on the server.
   *
   * ── WHY THE SCHEDULE PICKER NEEDS THIS AND NOT JUST THE PUBLISH BUTTON ──────
   * `PublishNow` has warned about unconnected channels for a while, but it only
   * exists inside the post editor. `PlannerReschedule` renders THIS component on
   * its own — no channel picker, no publish block — and `/planner` is, by that
   * file's own comment, "the screen most likely to be used for scheduling in the
   * first place". `ConnectFirstNote` is silent there by design once ANY channel is
   * connected, so a workspace with Instagram but not LinkedIn got no signal at all:
   * the post was scheduled, and the first news of the gap was a failed variant after
   * the time had passed (post f0a777cf, 2026-08-10).
   *
   * Undefined means NOT KNOWN and warns about nothing — see `unconnectedFrom`.
   */
  connected?: ReadonlySet<Channel>
}

const CLOCK_REFRESH_MS = 30_000

const pad = (value: number): string => String(value).padStart(2, '0')

/** `datetime-local` wants wall-clock time, so never `toISOString()` here. */
function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

function fromStored(iso: string | null): string {
  if (iso === null) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : toLocalInput(date)
}

/**
 * Plain schedule picker. There is no "best time" backend, so no suggestion chip
 * is offered — the only guidance shown is the channels' own minimum lead, read
 * from the Constraint Engine via `earliestScheduleAt`.
 *
 * The clock is set after mount: rendering `new Date()` during SSR would hydrate
 * against a different instant, and validating against a server clock would give
 * the user a verdict about a timezone they are not in.
 */
export function ScheduleField({
  channels,
  value,
  onChange,
  autoPublish = false,
  error = null,
  connected,
}: ScheduleFieldProps) {
  const [draft, setDraft] = useState<string>(() => fromStored(value))
  const [now, setNow] = useState<Date | null>(null)

  // Re-sync when the stored value changes underneath us — restoring the other
  // version after a divergence replaces `scheduled_at`, and without this the
  // field kept displaying the pre-restore time while the draft held the new one.
  //
  // Keyed on the VALUE prop changing, not on a draft/value mismatch: while the
  // user is typing an incomplete or too-soon datetime, `handleChange`
  // deliberately withholds `onChange`, so the two legitimately disagree and
  // resetting then would eat every keystroke. A committed edit round-trips
  // exactly (both sides are minute-precision wall clock), so this is a no-op for
  // the user's own changes.
  const [syncedValue, setSyncedValue] = useState<string | null>(value)
  if (value !== syncedValue) {
    setSyncedValue(value)
    setDraft(fromStored(value))
  }

  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), CLOCK_REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  const parsed = draft === '' ? null : new Date(draft)
  const check = now === null ? null : validateScheduleLead(channels, parsed, now)
  const earliest = now === null ? null : earliestScheduleAt(channels, now)

  // Only when the dispatcher is actually on. With it off, nothing goes out on ANY
  // channel and the note below already says so — naming one channel there would
  // imply the others are fine, which is the opposite of the truth.
  const gap = autoPublish
    ? scheduleGapNote(
        unconnectedFrom(channels, connected).map((channel) => CHANNEL_LABELS[channel]),
        channels.some((channel) => connected?.has(channel) === true),
      )
    : null

  function handleChange(next: string) {
    setDraft(next)
    if (next === '') {
      onChange(null)
      return
    }
    const date = new Date(next)
    if (Number.isNaN(date.getTime())) return
    if (now !== null && !validateScheduleLead(channels, date, now).ok) return
    onChange(date.toISOString())
  }

  return (
    <div className="space-y-1.5" data-guide="post-schedule">
      <Label htmlFor="post-schedule">Schedule</Label>
      <Input
        id="post-schedule"
        type="datetime-local"
        value={draft}
        error={check !== null && !check.ok}
        min={earliest !== null ? toLocalInput(earliest) : undefined}
        onChange={(event) => handleChange(event.target.value)}
      />
      {error !== null ? (
        <p role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      ) : check !== null && !check.ok && check.message !== undefined ? (
        <p role="alert" className="text-[12.5px] text-danger">
          {check.message} Nothing was saved.
        </p>
      ) : (
        <p className="text-[12px] text-muted">
          {draft === ''
            ? 'No schedule set — this post stays a draft.'
            : earliest !== null
              ? `Earliest for these channels: ${earliest.toLocaleString('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}`
              : 'Checking the schedule against the channel lead times…'}
        </p>
      )}

      {/* Only once a time is set: with an empty field there is no promise to
          correct, and the line above already says the post stays a draft. */}
      {draft === '' ? null : (
        <p
          data-connection-gap={gap === null ? undefined : 'true'}
          className={cn(
            'flex items-start gap-1.5 text-[12px]',
            // A named unconnected channel is a warning whether or not the rail is
            // live: it is a promise this schedule cannot keep.
            autoPublish && gap === null ? 'text-muted' : 'text-warn',
          )}
        >
          {gap !== null ? (
            <Plug size={13} strokeWidth={2} className="mt-[2px] shrink-0" aria-hidden />
          ) : autoPublish ? (
            <CalendarClock size={13} strokeWidth={2} className="mt-[2px] shrink-0" aria-hidden />
          ) : (
            <FlaskConical size={13} strokeWidth={2} className="mt-[2px] shrink-0" aria-hidden />
          )}
          {/* REPLACES the generic line rather than stacking under it. The line it
              displaces says "on every connected channel" — true, and useless to
              someone who does not know which of theirs those are. */}
          <span>{gap ?? scheduleFieldNote(autoPublish)}</span>
        </p>
      )}
    </div>
  )
}
