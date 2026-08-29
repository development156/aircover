/**
 * WHEN THE LOOP ACTUALLY RUNS — one source, read by the screen.
 *
 * ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────
 * The Loop screen never said when the weekly plan happens. A reader could pause
 * it, budget it and watch it run without ever learning that the thing runs on a
 * Sunday, which is the single fact that makes the rest of the page a schedule
 * rather than a button.
 *
 * The answer lives in `apps/web/vercel.json` as a cron expression, and a cron
 * expression is not a sentence anybody reads. So the day is stated here, once,
 * and `schedule.test.ts` reads that file and refuses to let the two drift: a
 * screen that says "Every Sunday" against a cron that fires on Monday is a lie
 * the product tells every week, and it is exactly the kind that survives,
 * because nobody is watching at 21:00 on a Sunday to notice.
 *
 * ── EVERYTHING HERE IS UTC, AND THE SCREEN SAYS SO ───────────────────────────
 * Vercel evaluates cron in UTC. A workspace timezone exists on the workspace
 * row but the SCHEDULE does not read it, so rendering "9 pm your time" would be
 * a claim about when the plan lands that nothing enforces. The zone is printed
 * beside the time rather than silently dropped.
 */

/** The cron the weekly plan runs on. Asserted against `vercel.json` by the test. */
export const LOOP_CRON_EXPRESSION = '0 21 * * 0'

/** The hour and minute that expression fires at, in UTC. */
export const LOOP_RUN_HOUR_UTC = 21
export const LOOP_RUN_MINUTE_UTC = 0

/** Day 0 in cron's day-of-week field. Sunday. */
export const LOOP_RUN_WEEKDAY_UTC = 0

/** What the screen says. Never typed a second time anywhere. */
export const LOOP_SCHEDULE_SENTENCE = 'Every Sunday'

/**
 * The same phrase mid-sentence: "…will plan your week every Sunday."
 *
 * Only the first letter drops. A `.toLowerCase()` on the whole string takes the
 * weekday down with it, which is how this line first landed as "every sunday" —
 * a proper noun in lower case reads as a typo, and a typo in a promise about
 * when the product will act is not a small thing.
 */
export const LOOP_SCHEDULE_PHRASE =
  LOOP_SCHEDULE_SENTENCE.charAt(0).toLowerCase() + LOOP_SCHEDULE_SENTENCE.slice(1)

/**
 * The next time the plan will fire, strictly after `now`.
 *
 * Strictly: on a Sunday at 21:00:00 exactly, the answer is NEXT Sunday, not this
 * second. A "next run" that is already happening reads as a countdown to nothing.
 */
export function nextLoopRun(now: Date): Date {
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      LOOP_RUN_HOUR_UTC,
      LOOP_RUN_MINUTE_UTC,
      0,
      0,
    ),
  )
  while (next.getUTCDay() !== LOOP_RUN_WEEKDAY_UTC || next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1)
  }
  return next
}

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
})

/**
 * A moment, as "25 Aug, 21:00 UTC".
 *
 * The zone is part of the string rather than a footnote, because the reader's
 * clock is not this clock and a bare "21:00" invites them to assume it is.
 */
export function formatRunMoment(when: Date): string {
  return `${DATE_TIME.format(when).replace(',', ',')} UTC`
}

/** The same, from the ISO string a cycle row stores. `null` when unparseable. */
export function formatStoredMoment(iso: string | null | undefined): string | null {
  if (!iso) return null
  const when = new Date(iso)
  return Number.isNaN(when.getTime()) ? null : formatRunMoment(when)
}

/**
 * How long a finished cycle took, as "4m 12s".
 *
 * `null` for a cycle still running, one whose end is missing, and one whose end
 * precedes its start — a negative duration is a broken clock, and printing
 * "-3m" would show the reader a measurement of their week that is not one.
 */
export function cycleDuration(startedAt: string, reportedAt: string | null): string | null {
  if (!reportedAt) return null
  const from = new Date(startedAt).getTime()
  const to = new Date(reportedAt).getTime()
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null

  const seconds = Math.round((to - from) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
