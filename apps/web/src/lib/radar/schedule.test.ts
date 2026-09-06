import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { SCAN_HOUR_UTC, SCAN_MINUTE_UTC, SCAN_WEEKDAY, nextScanAt, nextScanDate } from './schedule'

/**
 * ── THE GUARD THAT MATTERS IS THE LAST ONE ──────────────────────────────────
 * Every test above it checks arithmetic. The last one checks that the
 * arithmetic is about the right thing: a screen that tells a customer the next
 * read is Monday, computed from numbers nobody re-checked after the cron moved
 * to Wednesday, is exactly the confident-and-wrong figure this product refuses
 * to print. It reads `vercel.json` and refuses to agree with itself.
 */
describe('the next weekly read', () => {
  test('a Wednesday looks forward to the coming Monday', () => {
    // 2026-09-02 is a Wednesday.
    expect(nextScanDate(new Date('2026-09-02T12:00:00Z'))).toBe('2026-09-07')
  })

  test('a Monday BEFORE the pass keeps today', () => {
    expect(nextScanDate(new Date('2026-09-07T01:00:00Z'))).toBe('2026-09-07')
  })

  test('a Monday AFTER the pass moves a whole week, never into the past', () => {
    const now = new Date('2026-09-07T03:41:00Z')
    expect(nextScanDate(now)).toBe('2026-09-14')
    expect(nextScanAt(now).getTime()).toBeGreaterThan(now.getTime())
  })

  test('the exact minute of the pass has already happened', () => {
    // At 03:40:00 the cron has fired. Reporting it as still to come would tell
    // somebody to wait for a read that is already running.
    expect(nextScanDate(new Date('2026-09-07T03:40:00Z'))).toBe('2026-09-14')
  })

  test('a Sunday evening rolls to the next day and not to next week', () => {
    expect(nextScanDate(new Date('2026-09-06T23:30:00Z'))).toBe('2026-09-07')
  })

  test('it always lands on a Monday at 03:40 UTC, from any starting day', () => {
    for (let day = 1; day <= 28; day++) {
      const at = nextScanAt(new Date(Date.UTC(2026, 8, day, 17, 5)))
      expect(at.getUTCDay()).toBe(SCAN_WEEKDAY)
      expect(at.getUTCHours()).toBe(SCAN_HOUR_UTC)
      expect(at.getUTCMinutes()).toBe(SCAN_MINUTE_UTC)
    }
  })

  test('the numbers here are the cron the app actually deploys', () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons: { path: string; schedule: string }[]
    }
    const radar = config.crons.find((cron) => cron.path === '/api/cron/radar')
    expect(radar, 'no /api/cron/radar entry in vercel.json').toBeDefined()

    const [minute, hour, , , weekday] = radar!.schedule.split(' ')
    expect(Number(minute)).toBe(SCAN_MINUTE_UTC)
    expect(Number(hour)).toBe(SCAN_HOUR_UTC)
    expect(Number(weekday)).toBe(SCAN_WEEKDAY)
  })
})
