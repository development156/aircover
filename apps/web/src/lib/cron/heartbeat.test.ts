/**
 * The cron heartbeat, proven in BOTH directions.
 *
 * A watchdog that has only been shown to stay quiet is not a watchdog — it is
 * indistinguishable from a function that returns `beating` unconditionally. So
 * every silence assertion here has a matching alarm assertion built from the
 * same schedule, and the mutation notes in the commit record what each one
 * catches.
 *
 * The second block pins the schedules against `apps/web/vercel.json` itself, so
 * a cron whose period changes cannot leave a stale threshold behind — the same
 * guard shape `delivery-window.test.ts` uses, and for the same reason.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

import { allHeartbeatVerdicts, CRON_SCHEDULES, heartbeatVerdict, type CronJob } from './heartbeat'

const NOW = Date.parse('2026-08-19T12:00:00.000Z')
const MINUTE = 60_000

/** `now` minus n milliseconds — a last-run stamp n ago. */
const ago = (ms: number): number => NOW - ms

describe('a job that is running', () => {
  it('is beating when it ran within its period', () => {
    const v = heartbeatVerdict('sweeps', ago(2 * MINUTE), NOW)
    expect(v.state).toBe('beating')
    expect(v.alarming).toBe(false)
    expect(v.label).toContain('2 minutes ago')
  })

  it('is beating right up to one full period', () => {
    const v = heartbeatVerdict('sweeps', ago(CRON_SCHEDULES.sweeps.periodMs), NOW)
    expect(v.state).toBe('beating')
    expect(v.alarming).toBe(false)
  })
})

describe('a job that has stopped — the alarm direction', () => {
  it('is LATE after one missed run, and does not alarm', () => {
    // Vercel documents that cron delivery can be missed. One skipped tick is
    // within the platform's stated behaviour, so it is visible but not a page.
    const v = heartbeatVerdict('sweeps', ago(CRON_SCHEDULES.sweeps.periodMs + 1000), NOW)
    expect(v.state).toBe('late')
    expect(v.alarming).toBe(false)
  })

  it('is STOPPED past the miss allowance, and DOES alarm', () => {
    const { periodMs, missesBeforeStopped } = CRON_SCHEDULES.sweeps
    const v = heartbeatVerdict('sweeps', ago(periodMs * missesBeforeStopped + 1000), NOW)
    expect(v.state).toBe('stopped')
    expect(v.alarming).toBe(true)
    expect(v.label).toMatch(/stopped/i)
    // The cadence is named, so the reader can judge the number without knowing
    // the cron expression.
    expect(v.label).toContain('every 5 minutes')
  })

  it('alarms for the daily job on its own, much longer, clock', () => {
    // The bug that started all this was a DAILY job. A single threshold shared
    // with the 5-minute sweep would have called the metrics job stopped every
    // night at 00:10, and nobody would have believed the alert by week two.
    const daily = CRON_SCHEDULES.metrics
    expect(heartbeatVerdict('metrics', ago(6 * 60 * MINUTE), NOW).state).toBe('beating')
    expect(
      heartbeatVerdict('metrics', ago(daily.periodMs * daily.missesBeforeStopped + MINUTE), NOW)
        .state,
    ).toBe('stopped')
  })
})

describe('unknown is not healthy — the rule freshness.ts already argues', () => {
  it('treats no record at all as alarming, not as fine', () => {
    // This IS the production case: /api/cron/metrics has never run, so its key
    // has never been written. A watchdog that read "no key" as "no news, good
    // news" would have stayed silent through the entire outage it exists for.
    const v = heartbeatVerdict('metrics', null, NOW)
    expect(v.state).toBe('unknown')
    expect(v.alarming).toBe(true)
    expect(v.ageMs).toBeNull()
    expect(v.label).toMatch(/cannot say/i)
  })

  it('treats an unreadable store the same way, because it cannot tell them apart', () => {
    expect(heartbeatVerdict('sweeps', Number.NaN, NOW).state).toBe('unknown')
  })

  it('refuses to read a future timestamp as the freshest possible beat', () => {
    // Clock skew is real. "It ran ten minutes from now" is not evidence of
    // health, and reading it as `beating` would make a broken clock the best
    // possible outcome — a silence that is actively earned.
    const v = heartbeatVerdict('sweeps', NOW + 10 * MINUTE, NOW)
    expect(v.state).toBe('unknown')
    expect(v.alarming).toBe(true)
    expect(v.label).toMatch(/future/i)
  })

  it('refuses an unreadable clock', () => {
    expect(heartbeatVerdict('sweeps', ago(MINUTE), Number.NaN).state).toBe('unknown')
  })
})

describe('allHeartbeatVerdicts covers every declared job', () => {
  it('returns one verdict per schedule, so a new cron cannot be forgotten', () => {
    const all = allHeartbeatVerdicts({}, NOW)
    expect(all.map((v) => v.job).sort()).toEqual(Object.keys(CRON_SCHEDULES).sort())
    // Nothing supplied means nothing known means every one of them alarms.
    expect(all.every((v) => v.state === 'unknown' && v.alarming)).toBe(true)
  })

  it('reports the healthy and the stopped side by side', () => {
    const all = allHeartbeatVerdicts(
      { sweeps: ago(MINUTE), metrics: ago(5 * 24 * 60 * MINUTE) },
      NOW,
    )
    const byJob = new Map(all.map((v) => [v.job, v]))
    expect(byJob.get('sweeps')?.state).toBe('beating')
    expect(byJob.get('metrics')?.state).toBe('stopped')
  })
})

describe('the schedules match the crons that actually ship', () => {
  interface CronEntry {
    path: string
    schedule: string
  }

  const PATH_BY_JOB: Record<CronJob, string> = {
    sweeps: '/api/cron/sweeps',
    metrics: '/api/cron/metrics',
    loop: '/api/cron/loop',
    playbooks: '/api/cron/playbooks',
    brain: '/api/cron/brain',
  }

  function crons(): CronEntry[] {
    const raw = readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8')
    return (JSON.parse(raw) as { crons?: CronEntry[] }).crons ?? []
  }

  /** Period in ms for the three expression shapes this project uses, and no others. */
  function periodMs(schedule: string): number {
    const f = schedule.trim().split(/\s+/)
    if (f.length !== 5) throw new Error(`not a 5-field cron: "${schedule}"`)
    const [minute, hour, dom, month, dow] = f
    if (dom === '*' && month === '*' && dow === '*') {
      const step = /^\*\/(\d+)$/.exec(minute ?? '')
      if (step && hour === '*') return Number(step[1]) * MINUTE
      // A fixed minute AND a fixed hour is a once-a-day schedule.
      if (/^\d+$/.test(minute ?? '') && /^\d+$/.test(hour ?? '')) return 24 * 60 * MINUTE
    }
    // A fixed minute, a fixed hour and a SINGLE day of week is once a week.
    // Deliberately only a single digit: `0,3` would also be a valid cron and is
    // NOT weekly, and quietly calling it weekly would put a wrong period into
    // the heartbeat and mislabel a healthy job as stopped.
    if (
      dom === '*' &&
      month === '*' &&
      /^\d$/.test(dow ?? '') &&
      /^\d+$/.test(minute ?? '') &&
      /^\d+$/.test(hour ?? '')
    ) {
      return 7 * 24 * 60 * MINUTE
    }
    throw new Error(`unrecognised schedule: "${schedule}"`)
  }

  it('declares a heartbeat for every cron in vercel.json, and no phantom ones', () => {
    const declared = crons()
      .map((c) => c.path)
      .sort()
    const watched = Object.values(PATH_BY_JOB).sort()
    expect(
      watched,
      `apps/web/vercel.json declares [${declared.join(', ')}]; heartbeat watches [${watched.join(', ')}]`,
    ).toEqual(declared)
  })

  it('uses each cron real period, printed so a failure says what the file holds', () => {
    for (const entry of crons()) {
      const job = (Object.keys(PATH_BY_JOB) as CronJob[]).find((j) => PATH_BY_JOB[j] === entry.path)
      if (!job) continue
      const parsed = periodMs(entry.schedule)
      expect(
        CRON_SCHEDULES[job].periodMs,
        `${entry.path} is scheduled "${entry.schedule}" = ${parsed}ms, but CRON_SCHEDULES.${job}.periodMs is ${CRON_SCHEDULES[job].periodMs}`,
      ).toBe(parsed)
    }
  })

  it('has a period parser that throws rather than guessing', () => {
    expect(() => periodMs('*/5 * * *')).toThrow(/not a 5-field/)
    expect(() => periodMs('* * * * 1')).toThrow(/unrecognised/)
    expect(periodMs('*/5 * * * *')).toBe(5 * MINUTE)
    expect(periodMs('20 1 * * *')).toBe(24 * 60 * MINUTE)
  })
})
