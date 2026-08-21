import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { CRON_SCHEDULES, type CronJob } from './heartbeat'

/**
 * THE TWO LISTS OF CRON JOBS AGREE.
 *
 * ── THIS FILE IS NEW, AND ITS ABSENCE WAS THE DEFECT ────────────────────────
 * `heartbeat.ts` carried the comment "`heartbeat-schedule.test.ts` pins both"
 * beside `CronJob`. There was no such file. Found 2026-08-22 while adding a
 * fourth job, by going to read it.
 *
 * What the missing test allowed, silently and in both directions: a route added
 * to `vercel.json` with no entry here would never be watched, so the day it
 * stopped firing nobody would be told; and an entry here with no schedule in
 * `vercel.json` would be reported as "stopped" forever, for a job that was never
 * scheduled in the first place. Neither shows up in a typecheck, a lint or any
 * other test — the two lists live in different files and different languages.
 *
 * ── AND THE PERIOD IS CHECKED AGAINST THE EXPRESSION ────────────────────────
 * Not only the names. `periodMs` is what decides whether a job is late, and a
 * schedule moved from daily to hourly with the period left at 24h would make the
 * watchdog silent for a day about a job that should have run 24 times.
 */

const CRONS: { path: string; schedule: string }[] = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../vercel.json'), 'utf8'),
).crons

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** The period a cron expression implies, for the shapes this repo actually uses. */
function periodOf(expression: string): number {
  const [minute, hour, , , weekday] = expression.split(' ')
  if (minute?.startsWith('*/')) return Number(minute.slice(2)) * MINUTE
  if (weekday !== '*') return 7 * 24 * HOUR
  if (hour !== '*') return 24 * HOUR
  return HOUR
}

describe('every scheduled cron is watched, and every watched cron is scheduled', () => {
  it('names the same jobs in vercel.json and in CRON_SCHEDULES', () => {
    const scheduled = CRONS.map((c) => c.path.replace('/api/cron/', '')).sort()
    const watched = Object.keys(CRON_SCHEDULES).sort()
    expect(scheduled).toEqual(watched)
  })

  it('gives each job the period its cron expression actually implies', () => {
    for (const cron of CRONS) {
      const job = cron.path.replace('/api/cron/', '') as CronJob
      expect(CRON_SCHEDULES[job].periodMs, `${job} (${cron.schedule})`).toBe(
        periodOf(cron.schedule),
      )
    }
  })

  it('reads the expressions it was written against', () => {
    // A guard against the parser above silently agreeing with everything: these
    // are the four shapes in the file today, and each maps to a distinct period.
    expect(periodOf('*/5 * * * *')).toBe(5 * MINUTE)
    expect(periodOf('20 1 * * *')).toBe(24 * HOUR)
    expect(periodOf('0 6 * * *')).toBe(24 * HOUR)
    expect(periodOf('0 21 * * 0')).toBe(7 * 24 * HOUR)
  })
})
