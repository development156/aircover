'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  clockTime,
  combine,
  isSameDay,
  isSameMonth,
  monthGridDays,
  monthLabel,
  shiftMonth,
  startOfDay,
  timeSlots,
  WEEKDAY_INITIALS,
} from '@/lib/posts/calendar-month'

export interface ScheduleCalendarProps {
  /** The month on screen. The caller owns it so the arrows are its business. */
  anchor: Date
  onAnchorChange: (anchor: Date) => void
  /** The pending pick, or null when nothing is chosen yet. */
  value: Date | null
  onChange: (at: Date) => void
  /** The earliest instant every selected channel will accept. */
  earliest: Date
  now: Date
}

const SLOTS = timeSlots()

/**
 * A MONTH CALENDAR, BECAUSE THE THING THAT WAS HERE WAS A DATE MASK.
 *
 * ── WHAT IT REPLACES ─────────────────────────────────────────────────────────
 * `dd/mm/yyyy, --:--` with a small glyph on the end — the one unstyled native
 * control on the screen, and the one that asks the reader to know what a
 * `datetime-local` input is. `docs/34` §1 already recorded that the journey's
 * stated goal, a first SCHEDULED post, had no control a person could find by
 * looking. The named-time chips fixed finding it; they did not give anyone a way
 * to answer "what about the Saturday after next".
 *
 * A calendar answers that by being a calendar. Six rows of seven, the adjacent
 * months dimmed but present, today ringed, the chosen day filled.
 *
 * ── NOTHING BEFORE THE CHANNELS' OWN LEAD IS SELECTABLE ──────────────────────
 * `earliest` comes from `earliestScheduleAt`, which reads
 * `scheduleMinLeadMinutes` off the Constraint Engine. A day entirely in the past
 * is disabled rather than offered and then refused: a control that accepts a
 * value it is about to reject has wasted the reader's click and taught them not
 * to trust the grid.
 *
 * The DAY is what a cell tests, not the instant. Today is still selectable at
 * 11pm even though most of it has gone, because the time row below decides the
 * instant and `validateScheduleLead` has the final word on it.
 */
export function ScheduleCalendar({
  anchor,
  onAnchorChange,
  value,
  onChange,
  earliest,
  now,
}: ScheduleCalendarProps) {
  const days = monthGridDays(anchor)
  const earliestDay = startOfDay(earliest)
  const chosenTime = value === null ? '09:00' : timeValue(value)

  function pickDay(day: Date) {
    const [hours, minutes] = chosenTime.split(':').map(Number)
    onChange(combine(day, hours ?? 9, minutes ?? 0))
  }

  function pickTime(next: string) {
    const [hours, minutes] = next.split(':').map(Number)
    onChange(combine(value ?? startOfDay(now), hours ?? 9, minutes ?? 0))
  }

  return (
    <div className="surface-ring space-y-3 rounded-card bg-surface p-3" data-schedule-calendar>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => onAnchorChange(shiftMonth(anchor, -1))}
          className="flex size-8 items-center justify-center rounded-sm text-muted transition-micro hover:bg-s2 hover:text-ink max-narrow:size-11"
        >
          <ChevronLeft size={16} aria-hidden />
        </button>
        {/* `aria-live` so a screen reader hears the month change rather than
            being silently moved to a different set of dates. */}
        <p aria-live="polite" className="type-h3">
          {monthLabel(anchor)}
        </p>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => onAnchorChange(shiftMonth(anchor, 1))}
          className="flex size-8 items-center justify-center rounded-sm text-muted transition-micro hover:bg-s2 hover:text-ink max-narrow:size-11"
        >
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>

      {/* aria-hidden because every cell names its own full date. A screen reader
          reading seven initials before the grid announces a header row it cannot
          navigate by, and "M T W T F S S" read aloud is not a weekday. */}
      <div aria-hidden className="grid grid-cols-7 gap-1">
        {WEEKDAY_INITIALS.map((initial, index) => (
          <span key={index} className="type-eyebrow py-1 text-center text-muted">
            {initial}
          </span>
        ))}
      </div>

      <div role="group" aria-label="Pick a date" className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const outside = !isSameMonth(day, anchor)
          const past = day.getTime() < earliestDay.getTime()
          const chosen = value !== null && isSameDay(day, value)
          const today = isSameDay(day, now)

          return (
            <button
              key={day.getTime()}
              type="button"
              data-calendar-day={chosen ? 'chosen' : undefined}
              // The FULL date, so a screen reader hears "Thursday, 27 August"
              // rather than "27" repeated six times down a column.
              aria-label={longLabel(day)}
              aria-pressed={chosen}
              disabled={past}
              onClick={() => pickDay(day)}
              className={cn(
                'type-sm flex h-9 items-center justify-center rounded-sm tabular-nums transition-micro max-narrow:h-11',
                chosen
                  ? 'bg-ink font-[550] text-white dark:bg-white dark:text-[var(--canvas)]'
                  : past
                    ? 'text-faint'
                    : outside
                      ? 'text-muted hover:bg-s2'
                      : 'text-ink hover:bg-s2',
                // A ring rather than a fill, so today and the chosen day can be
                // the same cell and still both be legible.
                today && !chosen ? 'shadow-[inset_0_0_0_1px_var(--brand)]' : null,
              )}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>

      {/* ── TWO WAYS IN, EACH WITH ITS OWN VISIBLE LABEL ────────────────────
          These were one line reading `Time [dropdown] or [08:05]`. At 390px it
          broke as `[dropdown] or` / `[08:05]`, stranding the conjunction at the
          end of a row and leaving the second control with nothing naming it —
          its only label was `aria-label`, which a sighted reader never gets.
          A conjunction is not a label. Each control now says what it is, and
          the pair stacks instead of splitting a sentence. */}
      <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="schedule-time" className="type-meta text-muted">
            Time
          </label>
          <Select
            id="schedule-time"
            value={chosenTime}
            onChange={(event) => pickTime(event.target.value)}
            className="w-full"
          >
            {/* The chosen time may be one the half-hour list does not carry —
                a stored 16:45, or an exact time typed alongside. It is added
                rather than silently snapped to the nearest slot, which would
                change a schedule the writer already set. */}
            {SLOTS.some((slot) => slot.value === chosenTime) ? null : (
              <option value={chosenTime}>{labelFor(chosenTime)}</option>
            )}
            {SLOTS.map((slot) => (
              <option key={slot.value} value={slot.value}>
                {slot.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="post-schedule" className="type-meta text-muted">
            Or an exact time
          </label>
          <input
            // `post-schedule` moved here from the `datetime-local` this
            // replaced. It is the id `e2e/date-field-theme.spec.ts` reads, and
            // that spec is about `color-scheme` on a native time control, which
            // is exactly what this still is.
            id="post-schedule"
            type="time"
            value={chosenTime}
            onChange={(event) => (event.target.value === '' ? null : pickTime(event.target.value))}
            className="type-sm h-control rounded-sm border-none bg-surface px-2 text-ink shadow-[inset_0_0_0_1px_var(--line)] transition-micro focus:shadow-[inset_0_0_0_1px_var(--brand),0_0_0_3px_var(--t50)] focus:outline-none max-narrow:min-h-[44px]"
          />
        </div>
      </div>
    </div>
  )
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** `HH:mm` from a Date, which is what both time controls speak. */
function timeValue(at: Date): string {
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`
}

function labelFor(value: string): string {
  const [hours, minutes] = value.split(':').map(Number)
  return clockTime(new Date(2000, 0, 1, hours ?? 9, minutes ?? 0))
}

/** "Thursday, 27 August" plus the year, which a grid spanning December needs. */
function longLabel(day: Date): string {
  return day.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
