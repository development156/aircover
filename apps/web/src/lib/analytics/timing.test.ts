import { describe, it, expect } from 'vitest'

import type { Channel } from '@sahoda/shared'

import {
  localSlotOf,
  timingGrid,
  bestSlotSentence,
  shadeOf,
  slotLabel,
  MIN_SLOT_POSTS,
  DAY_PARTS,
  WEEKDAYS,
  type TimedPost,
  type Slot,
  type Weekday,
  type DayPartId,
} from './timing'

/** Add `n` whole days to a `YYYY-MM-DD` string, staying inside the same format. */
function addDays(date: string, n: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + n * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * One post published at `publishedAt` (a full ISO instant), carrying a single
 * reading at `age` days after its UTC calendar date, worth `value`.
 */
function timedPost(
  id: string,
  publishedAt: string,
  age: number,
  value: number,
  channel: Channel = 'instagram',
): TimedPost {
  const publishedOn = publishedAt.slice(0, 10)
  return {
    postId: id,
    channel,
    publishedAt,
    aged: {
      postId: id,
      publishedOn,
      readings: [{ measuredOn: addDays(publishedOn, age), value }],
    },
  }
}

describe('localSlotOf — bucketed by the WORKSPACE clock, not UTC', () => {
  /**
   * THE DECISIVE CASE. 2026-08-24T20:00:00Z is Monday evening in UTC (hour 20,
   * inside the 17-21 evening band) but +5:30 rolls it to 01:30 on Tuesday —
   * a different weekday AND a different day part. If the zone argument were
   * ignored, or a UTC default silently substituted, this instant would read as
   * "Monday evening" everywhere and a Bhubaneswar shop would be told its
   * evenings are best when it actually posted at 1:30am.
   */
  it('reads a different weekday and a different day part in Asia/Kolkata than in UTC', () => {
    const at = '2026-08-24T20:00:00Z'
    const inUtc = localSlotOf(at, 'UTC')
    const inKolkata = localSlotOf(at, 'Asia/Kolkata')
    expect(inUtc).toEqual({ weekday: 'Monday', part: 'evening' })
    expect(inKolkata).toEqual({ weekday: 'Tuesday', part: 'night' })
  })

  it('returns null for an unparseable instant rather than defaulting', () => {
    expect(localSlotOf('not-an-instant', 'UTC')).toBeNull()
  })

  it('returns null for an invalid time zone name rather than defaulting to UTC', () => {
    expect(localSlotOf('2026-08-24T20:00:00Z', 'Not/AZone')).toBeNull()
  })

  describe('the night band wraps midnight (22 -> 4)', () => {
    it('23:00 lands in night', () => {
      expect(localSlotOf('2026-08-24T23:00:00Z', 'UTC')).toEqual({
        weekday: 'Monday',
        part: 'night',
      })
    })

    it('02:00 lands in night', () => {
      expect(localSlotOf('2026-08-25T02:00:00Z', 'UTC')).toEqual({
        weekday: 'Tuesday',
        part: 'night',
      })
    })

    /**
     * Midnight itself, and the hour-24 normalisation `Intl` can produce for it
     * in some engines. Without the `% 24`, a literal 24 falls outside every
     * band (each of which tops out at 21 or 4) and midnight posts would be
     * silently dropped from the grid rather than counted as night.
     */
    it('does not drop midnight — hour 0 lands in night', () => {
      expect(localSlotOf('2026-08-24T00:00:00Z', 'UTC')).toEqual({
        weekday: 'Monday',
        part: 'night',
      })
    })
  })

  /**
   * Every hour of the day must land in exactly one part. A gap between the
   * bands (an hour nobody claims) would silently drop every post published
   * in it from the grid, with no error to say so.
   */
  it('every hour 0..23 lands in exactly one day part', () => {
    for (let hour = 0; hour < 24; hour++) {
      const iso = `2026-08-24T${String(hour).padStart(2, '0')}:00:00Z`
      const slot = localSlotOf(iso, 'UTC')
      expect(slot).not.toBeNull()
      const matchingParts = DAY_PARTS.filter((part) => {
        const wraps = part.fromHour > part.toHour
        return wraps
          ? hour >= part.fromHour || hour <= part.toHour
          : hour >= part.fromHour && hour <= part.toHour
      })
      expect(matchingParts).toHaveLength(1)
      expect(slot?.part).toBe(matchingParts[0]?.id)
    }
  })
})

describe('timingGrid — the honest-empty paths', () => {
  it('says no-history for no posts at all', () => {
    expect(timingGrid([], 7, 'UTC')).toEqual({ kind: 'none', reason: 'no-history' })
  })

  it('says no-common-age when no post carries a reading at the requested age', () => {
    // Posts exist and have readings, but none at age 7 — the age actually asked for.
    const posts = [
      timedPost('a', '2026-08-24T07:00:00Z', 3, 500),
      timedPost('b', '2026-08-25T13:00:00Z', 5, 500),
    ]
    expect(timingGrid(posts, 7, 'UTC')).toEqual({ kind: 'none', reason: 'no-common-age' })
  })
})

describe('timingGrid — the grid has no holes', () => {
  it('emits a cell for every weekday x day part (7 x 4 = 28), including empty ones', () => {
    // One lone post: only one cell has data, but all 28 must still be present.
    const posts = [timedPost('a', '2026-08-24T07:00:00Z', 7, 500)]
    const grid = timingGrid(posts, 7, 'UTC')
    if (grid.kind !== 'ready') throw new Error('expected a ready grid')
    expect(grid.slots).toHaveLength(WEEKDAYS.length * DAY_PARTS.length)
    for (const weekday of WEEKDAYS) {
      for (const part of DAY_PARTS) {
        expect(grid.slots.some((slot) => slot.weekday === weekday && slot.part === part.id)).toBe(
          true,
        )
      }
    }
  })
})

describe('timingGrid — the anti-fabrication floor', () => {
  /**
   * Two posts in one slot, one short of MIN_SLOT_POSTS. `average` must be
   * null, not a number computed from too few posts — a cell shaded from two
   * posts recommends a time nobody has tested.
   */
  it('a cell below MIN_SLOT_POSTS has average null, and still states its post count', () => {
    expect(MIN_SLOT_POSTS).toBe(3)
    const posts = [
      timedPost('a', '2026-08-03T07:00:00Z', 7, 100), // Monday morning
      timedPost('b', '2026-08-10T07:00:00Z', 7, 200), // Monday morning
    ]
    const grid = timingGrid(posts, 7, 'UTC')
    if (grid.kind !== 'ready') throw new Error('expected a ready grid')
    const cell = grid.slots.find((s) => s.weekday === 'Monday' && s.part === 'morning')
    expect(cell?.posts).toBe(2)
    expect(cell?.average).toBeNull()
    expect(typeof cell?.average).not.toBe('number')
  })
})

describe('timingGrid — every reading is taken at the requested age, and only that age', () => {
  /**
   * A post carries a reading at age 30 far larger than its age-7 reading. If
   * the grid pulled from any available reading rather than the exact
   * requested age, this post would inflate its slot. It must contribute
   * nothing at age 7 beyond its own age-7 value.
   */
  it('a reading at a different age contributes nothing to the requested-age average', () => {
    const decoyAge = 30
    const posts = [
      timedPost('a', '2026-08-03T07:00:00Z', 7, 100), // Monday morning, age 7
      timedPost('b', '2026-08-10T07:00:00Z', 7, 100), // Monday morning, age 7
      timedPost('c', '2026-08-17T07:00:00Z', 7, 100), // Monday morning, age 7
      // Same slot, same post id space, but its only reading is at age 30 —
      // must be excluded entirely, not averaged in at some other value.
      timedPost('d', '2026-08-24T07:00:00Z', decoyAge, 999_999),
    ]
    const grid = timingGrid(posts, 7, 'UTC')
    if (grid.kind !== 'ready') throw new Error('expected a ready grid')
    const cell = grid.slots.find((s) => s.weekday === 'Monday' && s.part === 'morning')
    expect(cell?.posts).toBe(3)
    expect(cell?.average).toBe(100)
  })
})

describe('timingGrid — the age confound', () => {
  /**
   * THE AGE CONFOUND. Every post here performs IDENTICALLY when read at the
   * shared age (100, at age 7) — but one slot's posts were published weeks
   * before the other's. A heatmap built from raw running totals would show
   * the older slot ahead purely because its posts have had longer to
   * accumulate, and `best` would report a lift that is really just publish
   * date. This is the exact defect that shipped in week-report.ts and was
   * only caught by audit: every reading here is taken at one shared age, so
   * the two slots must come out EQUAL and `best` must NOT be a lift.
   */
  it('a slot with older posts does not win on age alone — best is not a lift', () => {
    const posts = [
      // Monday morning — the OLDER slot, published in early August.
      timedPost('a', '2026-08-03T07:00:00Z', 7, 100),
      timedPost('b', '2026-08-10T07:00:00Z', 7, 100),
      timedPost('c', '2026-08-17T07:00:00Z', 7, 100),
      // Tuesday afternoon — the RECENT slot, published a week later each time.
      timedPost('d', '2026-08-04T13:00:00Z', 7, 100),
      timedPost('e', '2026-08-11T13:00:00Z', 7, 100),
      timedPost('f', '2026-08-18T13:00:00Z', 7, 100),
    ]
    const grid = timingGrid(posts, 7, 'UTC')
    if (grid.kind !== 'ready') throw new Error('expected a ready grid')
    expect(grid.best.kind).not.toBe('lift')
  })
})

describe('bestSlotSentence', () => {
  it('is null whenever best is not a lift', () => {
    const notReady = { kind: 'none', reason: 'no-history' } as const
    expect(bestSlotSentence(notReady)).toBeNull()

    const posts = [timedPost('a', '2026-08-24T07:00:00Z', 7, 500)]
    const readyNoLift = timingGrid(posts, 7, 'UTC')
    expect(bestSlotSentence(readyNoLift)).toBeNull()
  })

  it('names the winning slot when best clears every gate', () => {
    // Wednesday evening: strong and well-supported, spread across distinct weeks.
    const leader = [
      timedPost('a', '2026-08-05T18:00:00Z', 7, 50),
      timedPost('b', '2026-08-12T18:00:00Z', 7, 50),
      timedPost('c', '2026-08-19T18:00:00Z', 7, 50),
    ]
    // Friday morning: weaker runner-up, same spread.
    const runnerUp = [
      timedPost('d', '2026-08-07T07:00:00Z', 7, 20),
      timedPost('e', '2026-08-14T07:00:00Z', 7, 20),
      timedPost('f', '2026-08-21T07:00:00Z', 7, 20),
    ]
    const grid = timingGrid([...leader, ...runnerUp], 7, 'UTC')
    if (grid.kind !== 'ready') throw new Error('expected a ready grid')
    expect(grid.best.kind).toBe('lift')
    const sentence = bestSlotSentence(grid)
    expect(sentence).not.toBeNull()
    expect(sentence).toContain(slotLabel('Wednesday', 'evening'))
  })
})

describe('shadeOf', () => {
  const weekday: Weekday = 'Monday'
  const part: DayPartId = 'morning'

  function slot(average: number | null, posts = MIN_SLOT_POSTS): Slot {
    return { weekday, part, posts, average }
  }

  it('returns null for a cell with no average', () => {
    const slots = [slot(null), slot(200)]
    expect(shadeOf(slots[0] as Slot, slots)).toBeNull()
  })

  it('is greater than 1 for an above-average cell', () => {
    const slots = [slot(300), slot(100)]
    expect(shadeOf(slots[0] as Slot, slots)).toBeGreaterThan(1)
  })

  it('is less than 1 for a below-average cell', () => {
    const slots = [slot(300), slot(100)]
    expect(shadeOf(slots[1] as Slot, slots)).toBeLessThan(1)
  })
})
