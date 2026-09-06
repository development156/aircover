/**
 * WHEN THE NEXT READ ACTUALLY HAPPENS.
 *
 * ── THIS IS A FACT, WHICH IS THE ONLY REASON IT MAY BE ON THE SCREEN ────────
 * "Next check · Tomorrow" is the kind of sentence a competitor-watching tool
 * writes because it looks attentive. Here it is derivable: the weekly pass is a
 * Vercel cron at `40 3 * * 1` (apps/web/vercel.json), so the next read is the
 * next Monday 03:40 UTC and nothing about it is a guess.
 *
 * The cron expression is restated here as two numbers rather than parsed out of
 * the JSON, and `schedule.test.ts` asserts that those two numbers still match
 * what `vercel.json` actually schedules. So moving the cron without moving this
 * breaks a test rather than quietly telling every customer the wrong day.
 *
 * ── UTC, AND SAID SO ON THE SCREEN ──────────────────────────────────────────
 * A date computed here and a date computed in the reader's browser are two
 * different answers on the two evenings a week where they straddle midnight,
 * and React re-renders the mismatch. This is computed on the SERVER, in UTC,
 * and handed down as a plain string, which is the same rule the Studio's "made
 * 2 h ago" follows for the same reason.
 *
 * Pure: no I/O, no clock of its own, no database.
 */

/** Monday. `Date#getUTCDay` counts from Sunday, so Monday is 1. */
export const SCAN_WEEKDAY = 1

/** 03:40 UTC, the minute in the cron expression. */
export const SCAN_HOUR_UTC = 3
export const SCAN_MINUTE_UTC = 40

/**
 * The instant of the next weekly pass, strictly after `now`.
 *
 * Strictly after, deliberately: at 03:41 on a Monday the pass has run, and
 * telling somebody the next read is nineteen hours in the past is worse than
 * saying nothing. Seven days is then the honest answer.
 */
export function nextScanAt(now: Date): Date {
  const at = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      SCAN_HOUR_UTC,
      SCAN_MINUTE_UTC,
      0,
      0,
    ),
  )
  // Forward to the next Monday. `+ 7) % 7` keeps today when today IS Monday,
  // which is the case the following line then corrects if the hour has passed.
  at.setUTCDate(at.getUTCDate() + ((SCAN_WEEKDAY - at.getUTCDay() + 7) % 7))
  if (at.getTime() <= now.getTime()) at.setUTCDate(at.getUTCDate() + 7)
  return at
}

/** The same instant as a plain `YYYY-MM-DD`, which is what the cards render. */
export function nextScanDate(now: Date): string {
  return nextScanAt(now).toISOString().slice(0, 10)
}
