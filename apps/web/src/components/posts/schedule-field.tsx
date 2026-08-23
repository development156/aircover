'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, FlaskConical, Plug, X as XIcon } from 'lucide-react'
import type { Channel, ChannelSet } from '@sahoda/shared'

import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { scheduleGapNote, unconnectedFrom } from '@/lib/posts/connection-gap'
import { earliestScheduleAt, validateScheduleLead } from '@/lib/posts/schedule'
import {
  deliveryRangeNote,
  formatChoiceTime,
  scheduleChoices,
  type ScheduleChoice,
} from '@/lib/posts/schedule-choices'
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
 * THE SCHEDULE PICKER — and the ninth click that did not exist.
 *
 * ── WHAT WAS HERE, AND WHY IT WAS THE WORST THING IN THE PRODUCT ─────────────
 * A bare `datetime-local`, and nothing else. `docs/34` §1 walked the new user
 * from a standing start to a saved draft in eight clicks — good — and then found
 * that the journey's stated goal, a first SCHEDULED post, had no control at all.
 * The capture recorded the "open the schedule" stop as ABSENT and the frames
 * either side of it came back with identical hashes.
 *
 * A `dd/mm/yyyy, --:--` mask with a small calendar glyph is the one unstyled
 * native control on the screen, and it asks the reader to know what a date input
 * is. The reader this system is written for is a shop owner meeting a marketing
 * tool for the first time on a mid-range Android. The goal was unreachable by
 * looking.
 *
 * ── SO THE PRIMARY AFFORDANCE IS WORDS ───────────────────────────────────────
 * Three named times, each printing the exact instant it means so the label hides
 * nothing, and "Pick an exact time" behind them for anyone who wants 4:45 pm on
 * the 3rd. The native input is now the implementation detail `docs/34` §1
 * recommended it become, rather than the whole interface. `scheduleChoices`
 * filters every candidate against the channels' own minimum lead, so a choice on
 * this screen is a choice the validator will take.
 *
 * ── SELECTION IS NOT CERTAINTY, AND THE FILL SAYS SO ─────────────────────────
 * The tempting treatment for a chosen time was `.is-committed` — §9's "it will
 * happen" rung. It is WRONG here and the reason matters: with the dispatcher off
 * nothing goes out, so a committed rung on this control would make a claim in the
 * design system's own vocabulary that the note two lines below spends a whole
 * sentence retracting. A picker's selected state is neither how real a thing is
 * nor how urgent, so it uses the ordinary selected treatment — the same ink fill
 * `ChannelPicker` uses, deliberately, so the two read as siblings and neither
 * spends orange.
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
  /** Whether the exact control has been asked for. A stored time opens it on its own. */
  const [exactOpen, setExactOpen] = useState<boolean>(false)

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
  // Empty until the clock exists. Rendering choices against a server instant
  // would offer a person times in a timezone they are not in.
  const choices = now === null ? [] : scheduleChoices(channels, now)

  const chosen = parsed !== null && !Number.isNaN(parsed.getTime()) ? parsed : null
  const matches = (choice: ScheduleChoice): boolean =>
    chosen !== null && toLocalInput(choice.when) === toLocalInput(chosen)
  /** A stored time nobody's shortcut produced. The exact control has to show it. */
  const isCustom = chosen !== null && !choices.some(matches)

  // Only when the dispatcher is actually on. With it off, nothing goes out on ANY
  // channel and the note below already says so — naming one channel there would
  // imply the others are fine, which is the opposite of the truth.
  const gap = autoPublish
    ? scheduleGapNote(
        unconnectedFrom(channels, connected).map((channel) => CHANNEL_LABELS[channel]),
        channels.some((channel) => connected?.has(channel) === true),
      )
    : null

  function commit(next: string) {
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

  function clear() {
    setExactOpen(false)
    commit('')
  }

  const showExact = exactOpen || isCustom

  return (
    <div className="space-y-2" data-guide="post-schedule">
      <Label htmlFor="post-schedule">Schedule</Label>

      {/* ── THE NAMED TIMES ──────────────────────────────────────────────────
          A group, not a list of loose buttons: a screen reader announces "When
          to post, group" and then three options, which is what this is. */}
      <div role="group" aria-label="When to post" className="flex flex-wrap gap-1.5">
        {choices.map((choice) => {
          const on = matches(choice)
          return (
            <button
              key={choice.id}
              type="button"
              data-schedule-choice={choice.id}
              aria-pressed={on}
              onClick={() => commit(toLocalInput(choice.when))}
              className={cn(
                'flex flex-col items-start rounded-full border px-3 py-1.5 text-left transition-micro max-narrow:min-h-[var(--control-h-touch)]',
                on
                  ? 'border-transparent bg-ink text-white dark:bg-white dark:text-[var(--canvas)]'
                  : 'border-line bg-surface text-ink hover:bg-s2',
              )}
            >
              {/* Two explicit spans. A bare text fragment beside another one in a
                  flex container becomes its OWN flex item — the defect that
                  rendered a button label as six unreadable pieces at 390px while
                  every box measured correctly. */}
              <span className="type-chip">{choice.label}</span>
              <span className={cn('type-meta tabular-nums', on ? 'opacity-75' : 'text-muted')}>
                {formatChoiceTime(choice.when)}
              </span>
            </button>
          )
        })}

        {showExact ? null : (
          <button
            type="button"
            data-schedule-choice="exact"
            onClick={() => setExactOpen(true)}
            className="flex items-center rounded-full border border-line bg-surface px-3 py-1.5 text-ink transition-micro hover:bg-s2 max-narrow:min-h-[var(--control-h-touch)]"
          >
            <span className="type-chip">Pick an exact time</span>
          </button>
        )}
      </div>

      {/* The native control, once it has been asked for or a stored time needs
          it. Kept mounted-on-demand rather than hidden: an input nobody can see
          is still in the tab order. */}
      {showExact ? (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              id="post-schedule"
              type="datetime-local"
              value={draft}
              error={check !== null && !check.ok}
              min={earliest !== null ? toLocalInput(earliest) : undefined}
              onChange={(event) => commit(event.target.value)}
            />
          </div>
        </div>
      ) : null}

      {/* Clearing is a real move and it needs a real control. Without one the
          only way back to "no schedule" was emptying a date mask by hand. */}
      {chosen !== null ? (
        <button
          type="button"
          data-schedule-clear
          onClick={clear}
          className="inline-flex items-center gap-1 text-muted underline underline-offset-2 transition-micro hover:text-ink"
        >
          <XIcon size={12} strokeWidth={2} aria-hidden />
          <span className="type-meta">Clear the schedule — keep this a draft</span>
        </button>
      ) : null}

      {error !== null ? (
        <p role="alert" className="type-meta text-danger">
          {error}
        </p>
      ) : check !== null && !check.ok && check.message !== undefined ? (
        <p role="alert" className="type-meta text-danger">
          {check.message} Nothing was saved.
        </p>
      ) : chosen === null ? (
        <p className="type-meta text-muted">
          {now === null
            ? 'Checking the schedule against the channel lead times…'
            : 'No schedule set. This post stays a draft.'}
        </p>
      ) : null}

      {/* Only once a time is set: with an empty field there is no promise to
          correct, and the line above already says the post stays a draft. */}
      {chosen === null ? null : (
        <p
          data-connection-gap={gap === null ? undefined : 'true'}
          className={cn(
            'flex items-start gap-1.5 type-meta',
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
              someone who does not know which of theirs those are.

              With the dispatcher LIVE and nothing to warn about, the sentence is
              now the DELIVERY RANGE rather than "at around that time": the sweep
              is a five-minute cron and every measured delivery landed 73-199 s
              after its tick, so "around" was the product declining to say a
              number it had. See `schedule-choices.ts`. */}
          <span>
            {gap ?? (autoPublish ? deliveryRangeNote(chosen) : scheduleFieldNote(autoPublish))}
          </span>
        </p>
      )}
    </div>
  )
}
