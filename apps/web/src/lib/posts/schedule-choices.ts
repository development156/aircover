import type { Channel } from '@sahoda/shared'

import { earliestScheduleAt } from '@/lib/posts/schedule'
import {
  SWEEP_INTERVAL_MINUTES,
  SWEEP_RUNTIME_ALLOWANCE_SECONDS,
} from '@/lib/posts/delivery-window'
import { addDaysInZone } from '@/lib/time/day-key'
import { instantAtWallClock, partsInZone, zoneLabel } from '@/lib/time/zone'

/**
 * NAMED TIMES, SO SCHEDULING A POST DOES NOT REQUIRE KNOWING WHAT A DATE INPUT IS.
 *
 * ── THE DEFECT THIS CLOSES ───────────────────────────────────────────────────
 * `docs/34` §1 walked the new user's journey and counted EIGHT clicks from
 * nothing to a saved draft, identical at every width. The finding was the ninth:
 * there wasn't one. The journey's stated goal was a first *scheduled* post, and
 * the only scheduling control in the product was a bare `dd/mm/yyyy, --:--`
 * native `datetime-local` — the one unstyled control on the screen. The capture
 * recorded the "open the schedule" stop as ABSENT and the frames either side of
 * it came back with identical hashes, which is what nothing-happened looks like.
 *
 * A shop owner in Bhubaneswar meeting a marketing tool for the first time on a
 * mid-range Android is the reader this whole system is written for. A date mask
 * with a tiny calendar glyph is not a control that reader can be assumed to
 * operate, and the goal of the journey was unreachable by looking.
 *
 * ── WHY THESE ARE NOT "BEST TIME" SUGGESTIONS ────────────────────────────────
 * There is no best-time backend. `schedule-field.tsx` says so in its own header
 * and has said so since it was written, and `docs/37` §17 is categorical: never
 * render a number the product cannot prove. A chip reading "Best time · 6pm"
 * would be exactly that invention.
 *
 * So a choice here makes NO claim about being good. It names a time in words a
 * person already uses, and then PRINTS THE EXACT INSTANT IT MEANS beside the
 * name, so nothing is hidden behind the label. "Tomorrow morning · Mon 24 Aug,
 * 9:00 am" is a shortcut to a time, not advice about it. The difference is the
 * difference between a convenience and a lie.
 *
 * ── AND WHY THE PICKER SURVIVES ──────────────────────────────────────────────
 * The exact control is still there, one click behind "Pick an exact time".
 * Removing it would replace one unreachable goal with another: a person who
 * wants 4:45 pm on the 3rd has to be able to say so. The native input becomes
 * the implementation detail `docs/34` §1 recommended it become, rather than the
 * whole interface.
 *
 * ── AND THE CLOCK IS THE WORKSPACE'S ─────────────────────────────────────────
 * "Tomorrow morning" used to be built with `setHours` on the reader's own
 * device, while every screen that read the result back formatted it in the
 * workspace's zone. MEASURED: a customer in Dubai picks it, the composer
 * confirms 9:00 am, and the posts list calls the same post 10:30 am IST. Every
 * function here now takes the zone the planner draws in and builds the instant
 * a reader in THAT zone means, through `instantAtWallClock`, which owns the two
 * transition-day cases. Founder's ruling, 2026-09-06.
 */

/** Wall-clock hour, in the workspace's zone, a named part of the day means. Printed, never implied. */
const MORNING_HOUR = 9
const EVENING_HOUR = 18

/** "In an hour" lands on a round five minutes — nobody schedules for 4:37. */
const ROUND_TO_MINUTES = 5

export interface ScheduleChoice {
  /** Stable id, so a test names a choice rather than an index. */
  id: 'hour' | 'tomorrow-morning' | 'tomorrow-evening'
  /** The words. Verb-free, sentence case; the time itself is rendered separately. */
  label: string
  when: Date
}

function atZoneHour(zone: string, base: Date, dayOffset: number, hour: number): Date {
  const p = partsInZone(zone, addDaysInZone(zone, base, dayOffset))
  return instantAtWallClock(zone, { year: p.year, month: p.month, day: p.day, hour, minute: 0 })
}

function inAnHour(now: Date): Date {
  const d = new Date(now.getTime() + 3600_000)
  d.setSeconds(0, 0)
  const remainder = d.getMinutes() % ROUND_TO_MINUTES
  if (remainder !== 0) d.setMinutes(d.getMinutes() + (ROUND_TO_MINUTES - remainder))
  return d
}

/**
 * The choices this post can actually take, in the order they are offered.
 *
 * ── A CHOICE THE CHANNELS WOULD REFUSE IS NOT OFFERED ────────────────────────
 * Every candidate is filtered against `earliestScheduleAt`, which reads each
 * channel's `scheduleMinLeadMinutes` out of the Constraint Engine. Offering a
 * button and then refusing the click is the shape of dead end this lane exists
 * to remove — and the lead is a real constraint, not ours to talk past.
 *
 * The list can therefore come back EMPTY, and a caller must handle that: with a
 * long enough lead every shortcut is illegal and only the exact picker remains
 * honest. Returning a padded list would put a button on the screen that cannot
 * be pressed.
 */
export function scheduleChoices(
  zone: string,
  channels: readonly Channel[],
  now: Date,
): ScheduleChoice[] {
  if (Number.isNaN(now.getTime())) return []
  const floor = earliestScheduleAt(channels, now)
  if (Number.isNaN(floor.getTime())) return []
  return keepScheduleable(candidateChoices(zone, now), floor)
}

/** The three, before the floor is applied. Exported for the guard, not for callers. */
export function candidateChoices(zone: string, now: Date): ScheduleChoice[] {
  return [
    { id: 'hour', label: 'In an hour', when: inAnHour(now) },
    {
      id: 'tomorrow-morning',
      label: 'Tomorrow morning',
      when: atZoneHour(zone, now, 1, MORNING_HOUR),
    },
    {
      id: 'tomorrow-evening',
      label: 'Tomorrow evening',
      when: atZoneHour(zone, now, 1, EVENING_HOUR),
    },
  ]
}

/**
 * Drop any choice the channels would refuse.
 *
 * ── WHY THIS IS A SEPARATE FUNCTION, AND WHAT THAT ADMITS ────────────────────
 * MEASURED 2026-08-23: every channel in `CONSTRAINTS` declares
 * `scheduleMinLeadMinutes: 5` — one shared constant, four call sites. The
 * closest candidate is an hour away, so with today's constants **this filter
 * never removes anything**. It is therefore untestable through
 * `scheduleChoices`, and an untested filter in the path of "can this button be
 * pressed" is exactly the dead code that wears a confident comment.
 *
 * Splitting it out lets the guard hand it an arbitrary floor and prove the
 * arithmetic at boundaries no channel currently reaches — so the day a platform
 * declares a two-hour lead, the behaviour is already correct and already
 * covered rather than being discovered by a customer whose click was refused.
 */
export function keepScheduleable(
  candidates: readonly ScheduleChoice[],
  floor: Date,
): ScheduleChoice[] {
  if (Number.isNaN(floor.getTime())) return []
  // `>=`, matching `validateScheduleLead` exactly. A choice landing ON the floor
  // is legal there, and an off-by-one between the two would offer a button the
  // validator accepts (or refuse one it would have taken).
  return candidates.filter((choice) => choice.when.getTime() >= floor.getTime())
}

/**
 * The whole delivery window, in minutes, rounded UP to the minute a person reads.
 *
 * Derived from `delivery-window.ts` rather than restated: that module already
 * owns the cron period and the measured batch runtime, and it is guarded by a
 * test that parses `apps/web/vercel.json`. A second literal here would be the
 * number that goes stale when the cron changes.
 */
export const DELIVERY_WINDOW_MINUTES = Math.ceil(
  SWEEP_INTERVAL_MINUTES + SWEEP_RUNTIME_ALLOWANCE_SECONDS / 60,
)

/** One formatter per zone and shape; the zone is a per-workspace fact, not a constant. */
const CACHE = new Map<string, Intl.DateTimeFormat>()

function formatter(zone: string, shape: 'time' | 'day-time'): Intl.DateTimeFormat {
  const key = `${zone}|${shape}`
  let f = CACHE.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(
      'en-IN',
      shape === 'time'
        ? { timeZone: zone, hour: 'numeric', minute: '2-digit' }
        : {
            timeZone: zone,
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
          },
    )
    CACHE.set(key, f)
  }
  return f
}

/**
 * "Mon 24 Aug, 9:00 am IST" — the exact instant a named choice means, with the
 * zone said once, because the whole defect was a time with no zone beside it.
 */
export function formatChoiceTime(zone: string, when: Date): string {
  return `${formatter(zone, 'day-time').format(when)} ${zoneLabel(zone, when)}`
}

/**
 * WHAT ACTUALLY HAPPENS AT THAT TIME, stated as a RANGE rather than an instant.
 *
 * ── THE SMALL LIE THIS REMOVES ───────────────────────────────────────────────
 * Publishing runs on a Vercel cron at `*&#47;5 * * * *`, and every scheduler
 * delivery MEASURED in production landed 73-199 s after its scheduled time. A
 * picker that takes a to-the-minute time and says nothing has quietly promised
 * to-the-minute publishing to every user, every time, on a system that cannot
 * deliver it. The row copy already had an allowance for this
 * (`delivery-window.ts`) and the field's own note already said "at around that
 * time" — but "around" is not a quantity, and a person planning a lunch-hour
 * post deserves to know whether around means seconds or an hour.
 *
 * So the range is printed. It is the same arithmetic the "is this post late?"
 * check uses, which is the point: the screen promises exactly the window the
 * product refuses to call late.
 *
 * Only for a LIVE dispatcher. With it off nothing goes out at all and
 * `scheduleFieldNote` already says so — a delivery range there would be a
 * promise about a rail that is not running.
 */
export function deliveryRangeNote(zone: string, when: Date): string {
  const end = new Date(when.getTime() + DELIVERY_WINDOW_MINUTES * 60_000)
  const time = formatter(zone, 'time')
  return `Goes out between ${time.format(when)} and ${time.format(end)} ${zoneLabel(zone, when)}. Sahoda checks every ${SWEEP_INTERVAL_MINUTES} minutes, so it is not to the second.`
}
