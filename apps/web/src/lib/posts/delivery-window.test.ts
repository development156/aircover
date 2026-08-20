/**
 * The delivery window, and the guard that keeps it tied to the real schedule.
 *
 * The point of the first block is that `SWEEP_INTERVAL_MINUTES` is not allowed to
 * be an opinion. It is parsed out of `apps/web/vercel.json` here, and the parsed
 * value is PRINTED into the assertion message, so a reader can see what the file
 * actually said rather than trusting that something was read. Change the cron to
 * `*&#47;1` and this fails — which is the whole reason it exists, because the
 * alternative is a seven-minute window quietly surviving a one-minute schedule.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

import {
  isPastDeliveryWindow,
  SCHEDULE_DELIVERY_WINDOW_MS,
  SWEEP_INTERVAL_MINUTES,
  SWEEP_RUNTIME_ALLOWANCE_SECONDS,
} from './delivery-window'

interface CronEntry {
  path: string
  schedule: string
}

/** Read the real deployment config — not a fixture, not a mock. */
function sweepsCron(): CronEntry {
  const raw = readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8')
  const parsed = JSON.parse(raw) as { crons?: CronEntry[] }
  const entry = parsed.crons?.find((c) => c.path === '/api/cron/sweeps')
  if (!entry) throw new Error('no /api/cron/sweeps entry in apps/web/vercel.json')
  return entry
}

/**
 * The minute field of a `*&#47;N * * * *` expression. Deliberately narrow: it
 * throws on any schedule shape it does not fully understand rather than
 * returning a number it cannot justify. A parser that guessed would be worse
 * than no parser, because the guess would keep the test green.
 */
function everyNMinutes(schedule: string): number {
  const fields = schedule.trim().split(/\s+/)
  if (fields.length !== 5) throw new Error(`not a 5-field cron: "${schedule}"`)
  const [minute, hour, dom, month, dow] = fields
  if (hour !== '*' || dom !== '*' || month !== '*' || dow !== '*') {
    throw new Error(`not an every-N-minutes schedule: "${schedule}"`)
  }
  const step = /^\*\/(\d+)$/.exec(minute ?? '')
  if (!step) throw new Error(`minute field is not */N: "${schedule}"`)
  return Number(step[1])
}

describe('the window is derived from the schedule that actually ships', () => {
  it('matches the /api/cron/sweeps entry in apps/web/vercel.json', () => {
    const entry = sweepsCron()
    const parsed = everyNMinutes(entry.schedule)

    // PRINTED, not merely compared: the message names the file's own value, so a
    // failure says what the schedule is rather than only that something differs.
    expect(
      SWEEP_INTERVAL_MINUTES,
      `apps/web/vercel.json schedules ${entry.path} as "${entry.schedule}" = every ${parsed} min, ` +
        `but SWEEP_INTERVAL_MINUTES is ${SWEEP_INTERVAL_MINUTES}. Update delivery-window.ts.`,
    ).toBe(parsed)
  })

  it('refuses to read a schedule it does not fully understand', () => {
    // The parser above is the load-bearing part of the previous test. If it
    // silently returned a default for an unfamiliar shape, the guard would pass
    // against any schedule at all.
    expect(() => everyNMinutes('0 1 * * *')).toThrow(/not an every-N-minutes/)
    expect(() => everyNMinutes('*/5 * * *')).toThrow(/not a 5-field cron/)
    expect(() => everyNMinutes('7 * * * *')).toThrow(/not \*\/N/)
    expect(everyNMinutes('*/5 * * * *')).toBe(5)
    expect(everyNMinutes('*/1 * * * *')).toBe(1)
  })

  it('adds the tick wait and the run time, and nothing else', () => {
    expect(SCHEDULE_DELIVERY_WINDOW_MS).toBe(
      (SWEEP_INTERVAL_MINUTES * 60 + SWEEP_RUNTIME_ALLOWANCE_SECONDS) * 1000,
    )
    // 5 min + 120 s = 7 min. Stated as a literal so a reader can check the sum
    // by eye without recomputing it.
    expect(SCHEDULE_DELIVERY_WINDOW_MS).toBe(420_000)
  })

  it('covers every scheduler delivery actually observed in production', () => {
    // MEASURED from post_publish_logs on 2026-08-19: the lag between
    // posts.scheduled_at and the log row, for every row whose job_run_id begins
    // "cron:". These are the deliveries the old zero-window code called LATE.
    const observedLagSeconds = [199, 73, 73, 110]
    const due = Date.parse('2026-08-10T09:00:00.000Z')

    for (const lag of observedLagSeconds) {
      expect(
        isPastDeliveryWindow(due, due + lag * 1000),
        `a healthy delivery ${lag}s after its time was called late`,
      ).toBe(false)
    }
  })
})

describe('isPastDeliveryWindow', () => {
  const due = Date.parse('2026-07-25T12:00:00.000Z')

  it('is false at the scheduled instant', () => {
    expect(isPastDeliveryWindow(due, due)).toBe(false)
  })

  it('is false one millisecond inside the window', () => {
    expect(isPastDeliveryWindow(due, due + SCHEDULE_DELIVERY_WINDOW_MS - 1)).toBe(false)
  })

  it('is false exactly AT the edge — the boundary is strict, as it was at zero', () => {
    expect(isPastDeliveryWindow(due, due + SCHEDULE_DELIVERY_WINDOW_MS)).toBe(false)
  })

  it('is true one millisecond past the edge', () => {
    expect(isPastDeliveryWindow(due, due + SCHEDULE_DELIVERY_WINDOW_MS + 1)).toBe(true)
  })

  it('is true long after', () => {
    expect(isPastDeliveryWindow(due, due + 86_400_000)).toBe(true)
  })

  it('is false for an unreadable time or an unreadable clock', () => {
    // Same floor the caller keeps: we cannot assert a time has passed when we
    // cannot read the time. Returning true here would invent a failure.
    expect(isPastDeliveryWindow(Number.NaN, due)).toBe(false)
    expect(isPastDeliveryWindow(due, Number.NaN)).toBe(false)
    expect(isPastDeliveryWindow(Number.POSITIVE_INFINITY, due)).toBe(false)
  })
})
