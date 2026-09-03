import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  LOOP_CRON_EXPRESSION,
  LOOP_RUN_HOUR_UTC,
  LOOP_RUN_MINUTE_UTC,
  LOOP_RUN_WEEKDAY_UTC,
  LOOP_SCHEDULE_PHRASE,
  LOOP_SCHEDULE_SENTENCE,
  cycleDuration,
  formatRunMoment,
  formatStoredMoment,
  nextLoopRun,
} from './schedule'

/**
 * THE SENTENCE ON THE SCREEN AND THE CRON THAT ACTUALLY FIRES.
 *
 * The Loop page now tells a customer their week is planned every Sunday. That is
 * a promise about a machine, and the machine is configured in a file no designer
 * opens. Nothing else in this repository compares the two, so moving the cron to
 * a Monday would leave the screen saying Sunday indefinitely — wrong once a week,
 * at an hour when nobody is looking.
 *
 * This reads the deployment file itself rather than a copy of it.
 *
 * ── WHAT IT CANNOT SEE, since it reads source and is subject to its own rule ─
 *  · a weekday typed by hand in any file that does not import from
 *    `schedule.ts`. It compares the CONSTANTS to the cron; a sentence that
 *    spells "Sunday" itself is invisible here, which is why `loop-status.tsx`
 *    and `eligibility.ts` both derive their day rather than stating it.
 *  · a cron declared anywhere but `apps/web/vercel.json` — a dashboard-created
 *    schedule, or a second runner in `apps/jobs`.
 *  · whether the cron actually FIRED. It compares two declarations; the
 *    heartbeat is in Redis and no test here reaches it.
 *  · the reader's own clock. Everything here is UTC by construction.
 */

const VERCEL_JSON = resolve(import.meta.dirname, '../../../vercel.json')

interface CronEntry {
  path: string
  schedule: string
}

function loopCron(): CronEntry {
  const parsed = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as { crons?: CronEntry[] }
  const entry = parsed.crons?.find((c) => c.path === '/api/cron/loop')
  expect(entry, 'vercel.json declares no cron for /api/cron/loop').toBeTruthy()
  return entry!
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

describe('the Loop schedule the screen states', () => {
  it('matches the cron the deployment actually runs', () => {
    expect(loopCron().schedule).toBe(LOOP_CRON_EXPRESSION)
  })

  it('names the same weekday the cron fires on', () => {
    const [minute, hour, , , weekday] = loopCron().schedule.split(' ')
    expect(Number(minute)).toBe(LOOP_RUN_MINUTE_UTC)
    expect(Number(hour)).toBe(LOOP_RUN_HOUR_UTC)
    expect(Number(weekday)).toBe(LOOP_RUN_WEEKDAY_UTC)
    // The sentence a customer reads has to name that same day.
    expect(LOOP_SCHEDULE_SENTENCE).toContain(WEEKDAY_NAMES[LOOP_RUN_WEEKDAY_UTC])
    // And the mid-sentence form keeps the weekday a proper noun. A whole-string
    // lowercase took it down to "every sunday" the first time this shipped.
    expect(LOOP_SCHEDULE_PHRASE).toContain(WEEKDAY_NAMES[LOOP_RUN_WEEKDAY_UTC])
    expect(LOOP_SCHEDULE_PHRASE.startsWith('every')).toBe(true)
  })
})

describe('the next run', () => {
  it('lands on the cron weekday at the cron time, in UTC', () => {
    const next = nextLoopRun(new Date('2026-08-26T10:00:00Z')) // a Wednesday
    expect(next.getUTCDay()).toBe(LOOP_RUN_WEEKDAY_UTC)
    expect(next.getUTCHours()).toBe(LOOP_RUN_HOUR_UTC)
    expect(next.toISOString()).toBe('2026-08-30T21:00:00.000Z')
  })

  it('is later today when today is the day and the hour has not passed', () => {
    expect(nextLoopRun(new Date('2026-08-30T08:00:00Z')).toISOString()).toBe(
      '2026-08-30T21:00:00.000Z',
    )
  })

  it('is next week once the hour has passed', () => {
    expect(nextLoopRun(new Date('2026-08-30T21:30:00Z')).toISOString()).toBe(
      '2026-09-06T21:00:00.000Z',
    )
  })

  it('is next week ON the minute, never this same instant', () => {
    // A "next run" equal to now reads as a countdown to nothing.
    expect(nextLoopRun(new Date('2026-08-30T21:00:00Z')).toISOString()).toBe(
      '2026-09-06T21:00:00.000Z',
    )
  })

  it('names the zone, because the reader’s clock is not this clock', () => {
    expect(formatRunMoment(new Date('2026-08-30T21:00:00Z'))).toMatch(/30 Aug, 21:00 UTC/)
  })

  it('refuses a stored moment it cannot read, rather than printing a broken date', () => {
    expect(formatStoredMoment(null)).toBeNull()
    expect(formatStoredMoment('not a date')).toBeNull()
    expect(formatStoredMoment('2026-08-30T21:00:00Z')).toMatch(/UTC$/)
  })
})

describe('how long a cycle took', () => {
  it('reports minutes and seconds', () => {
    expect(cycleDuration('2026-08-30T21:00:00Z', '2026-08-30T21:04:12Z')).toBe('4m 12s')
  })

  it('reports seconds alone under a minute, and hours over one', () => {
    expect(cycleDuration('2026-08-30T21:00:00Z', '2026-08-30T21:00:41Z')).toBe('41s')
    expect(cycleDuration('2026-08-30T21:00:00Z', '2026-08-30T22:03:00Z')).toBe('1h 3m')
  })

  it('says nothing for a cycle that has not finished', () => {
    expect(cycleDuration('2026-08-30T21:00:00Z', null)).toBeNull()
  })

  /**
   * A NEGATIVE DURATION IS A BROKEN CLOCK, NOT A MEASUREMENT.
   * Rendering "-3m" would put a figure about the customer's own week on screen
   * that no clock produced. Nothing is the honest answer.
   */
  it('says nothing when the end precedes the start', () => {
    expect(cycleDuration('2026-08-30T21:04:00Z', '2026-08-30T21:00:00Z')).toBeNull()
  })
})
