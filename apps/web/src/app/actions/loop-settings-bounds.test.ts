import { describe, expect, it } from 'vitest'

import {
  MAX_AUTOPILOT_CANCEL_MINUTES,
  MAX_AUTOPILOT_DAILY_CAP,
  MIN_AUTOPILOT_CANCEL_MINUTES,
  MIN_AUTOPILOT_DAILY_CAP,
  DEFAULT_AUTOPILOT_CANCEL_MINUTES,
  DEFAULT_AUTOPILOT_DAILY_CAP,
} from '@sahoda/shared'

/**
 * THE BOUNDS, PINNED AGAINST THE MIGRATION THAT ACTUALLY ENFORCES THEM.
 *
 * `setLoopSettings` checks these before the write so a value past the end reads
 * as a sentence rather than as a constraint violation — the same reason the
 * weekly budget is bounded twice. That only works while the two agree, and
 * nothing but this file notices when they stop.
 *
 * The migration is read as TEXT rather than imported, because it is SQL and the
 * numbers in it are the ones Postgres will actually apply. A constant that
 * drifts from its CHECK produces the exact defect the double-bounding exists to
 * prevent: a form that accepts a number the database then refuses, and a
 * customer who reads a Postgres error.
 */

const MIGRATION = new URL(
  '../../../../../packages/db/supabase/migrations/20260828120000_loop_autopilot_l3.sql',
  import.meta.url,
)

async function sql(): Promise<string> {
  const { readFile } = await import('node:fs/promises')
  return readFile(MIGRATION, 'utf8')
}

describe('the daily cap', () => {
  it('is bounded by the same numbers the column checks', async () => {
    const text = await sql()
    expect(text).toContain(
      `check (autopilot_daily_cap >= ${MIN_AUTOPILOT_DAILY_CAP} and autopilot_daily_cap <= ${MAX_AUTOPILOT_DAILY_CAP})`,
    )
  })

  it('defaults to the column default, not to a second opinion', async () => {
    const text = await sql()
    expect(text).toContain(
      `autopilot_daily_cap int not null default ${DEFAULT_AUTOPILOT_DAILY_CAP}`,
    )
  })

  it('allows zero, which is a real choice and not an absent value', () => {
    // A cap of 0 means autopilot announces nothing. A lower bound of 1 would
    // quietly remove the ability to say "never, but keep the setting".
    expect(MIN_AUTOPILOT_DAILY_CAP).toBe(0)
  })
})

describe('the cancel window', () => {
  it('is bounded by the same numbers the column checks', async () => {
    const text = await sql()
    expect(text).toContain(
      `check (autopilot_cancel_minutes >= ${MIN_AUTOPILOT_CANCEL_MINUTES} and autopilot_cancel_minutes <= ${MAX_AUTOPILOT_CANCEL_MINUTES})`,
    )
  })

  it('defaults to the column default', async () => {
    const text = await sql()
    expect(text).toContain(
      `autopilot_cancel_minutes int not null default ${DEFAULT_AUTOPILOT_CANCEL_MINUTES}`,
    )
  })

  it('never allows zero, because a window of zero is autopilot with no cancel', () => {
    expect(MIN_AUTOPILOT_CANCEL_MINUTES).toBeGreaterThan(0)
  })

  it('is capped at a day, beyond which a cancel window is just a delay', () => {
    expect(MAX_AUTOPILOT_CANCEL_MINUTES).toBe(24 * 60)
  })
})

describe('the two are not interchangeable', () => {
  it('has different defaults, so a swap in the action would be visible', () => {
    // Both are `number`, so TypeScript cannot tell them apart. Different
    // defaults are what make a swapped pair detectable at all — the same
    // reasoning as the cap-and-window swap guarded in store.test.ts.
    expect(DEFAULT_AUTOPILOT_DAILY_CAP).not.toBe(DEFAULT_AUTOPILOT_CANCEL_MINUTES)
  })

  it('has non-overlapping valid ranges at the low end', () => {
    // A cap of 0 is valid; a window of 0 is not. So a value of 0 arriving in
    // the wrong field is refused rather than silently accepted.
    expect(MIN_AUTOPILOT_DAILY_CAP).toBeLessThan(MIN_AUTOPILOT_CANCEL_MINUTES)
  })
})
