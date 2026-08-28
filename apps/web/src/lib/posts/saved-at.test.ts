import { describe, expect, test } from 'vitest'

import { formatSavedAt } from './saved-at'

/**
 * WHEN A POST WAS LAST SAVED.
 *
 * The boundary is the whole of this file's risk, so it is tested from both
 * sides rather than in the middle. `now` is fixed at an instant chosen so the
 * India-time rendering crosses no day boundary by accident.
 */
const NOW = new Date('2026-08-28T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

const MINUTE = 60_000
const HOUR = 60 * MINUTE

describe('the saved line on a post', () => {
  test('counts in hours right up to and including 24', () => {
    expect(formatSavedAt(ago(5 * HOUR), NOW)).toBe('5 hours ago')
    expect(formatSavedAt(ago(1 * HOUR), NOW)).toBe('1 hour ago')

    // 24 was given as an example of the RELATIVE wording, so it belongs inside
    // the relative form and the switch happens past it. Off by one here and the
    // day-old post reads as a date while the brief says hours.
    expect(formatSavedAt(ago(24 * HOUR), NOW)).toBe('24 hours ago')
  })

  test('switches at the real 24 hours, not at a rounded one', () => {
    // ── THE DEFECT THIS PINS ────────────────────────────────────────────────
    // The first version compared the ROUNDED hour count, `Math.round(minutes /
    // 60) <= 24`. COMPUTED: 23h40m, 24h00m and 24h29m all round to 24, so a post
    // saved a full twenty-nine minutes past the boundary still read "Saved 24
    // hours ago" — the stated rule and the code disagreeing, silently, in a
    // window nobody would think to look at.
    expect(formatSavedAt(ago(24 * HOUR + 1 * MINUTE), NOW)).toBe('27/08/2026, 5:29 pm IST')
    expect(formatSavedAt(ago(24 * HOUR + 29 * MINUTE), NOW)).toBe('27/08/2026, 5:01 pm IST')
  })

  test('names the moment once it is over 24 hours', () => {
    // 20 days — the case on the screen that prompted this. "20 days ago" is a
    // number the reader has to convert back into a date before it is useful.
    expect(formatSavedAt('2026-08-08T13:00:00.000Z', NOW)).toBe('08/08/2026, 6:30 pm IST')
  })

  test('writes the date day-first and the time in 12-hour with am or pm', () => {
    // 06:30 UTC is 12:00 India time — a midday case, so a broken 12-hour
    // conversion shows up as "0:00" or "12:00 am" rather than passing by luck.
    expect(formatSavedAt('2026-07-26T06:30:00.000Z', NOW)).toBe('26/07/2026, 12:00 pm IST')
    // And an early-morning one, where a 24-hour clock would print "06:30".
    expect(formatSavedAt('2026-07-26T01:00:00.000Z', NOW)).toBe('26/07/2026, 6:30 am IST')

    // Midnight is the classic 12-hour trap: a naive conversion prints "0:00 am"
    // or "24:00". MEASURED against this repo's own ICU, it is "12:00 am".
    expect(formatSavedAt('2026-07-25T18:30:00.000Z', NOW)).toBe('26/07/2026, 12:00 am IST')
    // And the minute before it, so a day-boundary slip shows as the wrong DATE.
    expect(formatSavedAt('2026-07-26T18:29:00.000Z', NOW)).toBe('26/07/2026, 11:59 pm IST')
  })

  test('keeps minutes below the hour, because “0 hours ago” answers nothing', () => {
    // The freshest post on the screen is the one most likely to be read, and
    // hours alone would render it as zero.
    expect(formatSavedAt(ago(43 * MINUTE), NOW)).toBe('43 minutes ago')
    expect(formatSavedAt(ago(1 * MINUTE), NOW)).toBe('1 minute ago')
    expect(formatSavedAt(ago(10_000), NOW)).toBe('just now')

    // ── 20 TO 59 SECONDS WAS UNGUARDED, AND IT IS THE SAME DEFECT AGAIN ─────
    // The tests probed 10s and 60s and nothing between, so lowering the "just
    // now" threshold to 20s left all of them green while a post saved 25
    // seconds ago rendered "Saved 0 minutes ago" — the exact "0 hours ago
    // answers nothing" failure this file exists to prevent, one scale down, on
    // the freshest post on the screen.
    expect(formatSavedAt(ago(25_000), NOW)).toBe('just now')
    expect(formatSavedAt(ago(59_000), NOW)).toBe('just now')
  })

  test('rounds to the nearer unit rather than truncating', () => {
    // `Math.floor` in place of `Math.round` passed every other test here and
    // renders a post saved fifty-nine minutes and forty-five seconds ago as "59
    // minutes ago" — true to the second and wrong to a reader, who is holding
    // "about an hour". Rounding is what makes the two branches meet cleanly:
    // 59m29s is still minutes, 59m30s is already an hour.
    expect(formatSavedAt(ago(59 * MINUTE + 45_000), NOW)).toBe('1 hour ago')
    expect(formatSavedAt(ago(59 * MINUTE + 29_000), NOW)).toBe('59 minutes ago')
  })

  test('says nothing at all when there is no usable timestamp', () => {
    // Null, not a placeholder and not today's date. A card with no readable
    // saved time renders no saved line, which is the honest "we cannot say".
    expect(formatSavedAt(null, NOW)).toBeNull()
    expect(formatSavedAt('not a date', NOW)).toBeNull()
  })

  test('never counts backwards when a row is written by a clock running ahead', () => {
    // Two servers, one a little fast, is enough to produce this. "Saved in -1
    // minutes" is the kind of nonsense that reaches a screenshot. Tested at half
    // an hour ahead, not thirty seconds: any negative falls under the "just now"
    // threshold, so a small skew would pass on arithmetic alone and prove
    // nothing about a large one.
    expect(formatSavedAt(new Date(NOW.getTime() + 30 * MINUTE).toISOString(), NOW)).toBe('just now')
  })
})
