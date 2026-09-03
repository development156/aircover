import { describe, it, expect } from 'vitest'

import {
  describeZoneRefusal,
  instantAtWallClock,
  isKnownZone,
  partsInZone,
  resolveDisplayZone,
  zoneLabel,
} from './zone'

/**
 * The zone arithmetic the scheduler needs, tested before it existed.
 *
 * ── THE DEFECT THIS SERVES ───────────────────────────────────────────────────
 * The picker built its instant on the BROWSER's clock (`d.setHours`) while every
 * screen that read it back formatted in a hardcoded `Asia/Kolkata`. MEASURED: a
 * customer in Dubai picks "tomorrow morning", the composer confirms 9:00 am, and
 * the posts list then calls the same post 10:30 am. One post, two times, both
 * shown as fact.
 *
 * A fix here is worth nothing unless the arithmetic is right, and this is
 * exactly the arithmetic that looks right and is not: an offset read once and
 * applied blindly is wrong across a DST boundary, in the direction that moves a
 * post an hour. So the cases below are mostly the awkward ones.
 */

describe('isKnownZone', () => {
  it('accepts the zones this product actually uses', () => {
    expect(isKnownZone('Asia/Kolkata')).toBe(true)
    expect(isKnownZone('Asia/Dubai')).toBe(true)
    expect(isKnownZone('America/Los_Angeles')).toBe(true)
    expect(isKnownZone('UTC')).toBe(true)
  })

  it('refuses the one-keystroke typo that a shape check would pass', () => {
    // `Asia/Kolkatta` is the exact value the database trigger exists to refuse.
    // It has the right shape and would shift every hour this product reports.
    expect(isKnownZone('Asia/Kolkatta')).toBe(false)
    expect(isKnownZone('Mars/Olympus')).toBe(false)
    expect(isKnownZone('')).toBe(false)
    expect(isKnownZone(null)).toBe(false)
    expect(isKnownZone(undefined)).toBe(false)
  })

  it('refuses an offset string, which is not a zone', () => {
    // `+05:30` is a fact about one instant, not about a place: it cannot know
    // when the rules change. Storing one would freeze a customer's clock.
    expect(isKnownZone('+05:30')).toBe(false)
    expect(isKnownZone('IST')).toBe(false)
  })
})

describe('resolveDisplayZone', () => {
  it('uses the workspace’s own zone when it has one', () => {
    expect(resolveDisplayZone('Asia/Dubai')).toEqual({ zone: 'Asia/Dubai', fromWorkspace: true })
  })

  it('falls back to the shipped default when the workspace has none', () => {
    // MEASURED 2026-08-26: 32 of 33 workspaces have no timezone. The fallback
    // is what those keep seeing, and it must equal the zone they see today, or
    // this change silently moves every existing customer's times.
    expect(resolveDisplayZone(null)).toEqual({ zone: 'Asia/Kolkata', fromWorkspace: false })
    expect(resolveDisplayZone(undefined)).toEqual({ zone: 'Asia/Kolkata', fromWorkspace: false })
    expect(resolveDisplayZone('')).toEqual({ zone: 'Asia/Kolkata', fromWorkspace: false })
  })

  it('falls back rather than throwing on a stored value it cannot use', () => {
    // A zone the runtime does not know must not take a screen down. The database
    // trigger should stop this reaching us; if it ever does, a page that renders
    // is better than a page that does not, and `fromWorkspace: false` stops the
    // label claiming the customer chose it.
    expect(resolveDisplayZone('Asia/Kolkatta')).toEqual({
      zone: 'Asia/Kolkata',
      fromWorkspace: false,
    })
  })
})

describe('zoneLabel', () => {
  const winter = new Date('2026-01-15T12:00:00.000Z')
  const summer = new Date('2026-07-15T12:00:00.000Z')

  it('names the zone the way a reader of that zone writes it', () => {
    expect(zoneLabel('Asia/Kolkata', winter)).toBe('IST')
  })

  it('moves with daylight saving, because the label is part of the claim', () => {
    // A post at 9:00 in Los Angeles is PST in January and PDT in July. A label
    // fixed at one of them is wrong for half the year — and it is the half a
    // reader is least likely to check.
    const w = zoneLabel('America/Los_Angeles', winter)
    const s = zoneLabel('America/Los_Angeles', summer)
    expect(w).not.toBe(s)
  })

  it('gives a usable label for a zone with no common abbreviation', () => {
    // Dubai has no short name in this locale; an offset is still a fact the
    // reader can act on, and is better than an empty label beside a time.
    expect(zoneLabel('Asia/Dubai', winter)).toMatch(/\S/)
  })
})

describe('partsInZone', () => {
  it('reads the wall clock a reader in that zone would see', () => {
    const instant = new Date('2026-09-02T03:30:00.000Z')
    expect(partsInZone('Asia/Kolkata', instant)).toEqual({
      year: 2026,
      month: 9,
      day: 2,
      hour: 9,
      minute: 0,
    })
    // The same instant, 90 minutes earlier on a Dubai clock. This pair is the
    // whole defect: one instant, two correct answers, and the product was
    // showing the wrong one to the person who chose it.
    expect(partsInZone('Asia/Dubai', instant)).toEqual({
      year: 2026,
      month: 9,
      day: 2,
      hour: 7,
      minute: 30,
    })
  })

  it('crosses the date line at midnight rather than near it', () => {
    // 23:45 UTC on the 1st is already the 2nd in India. A formatter that got
    // this wrong would file a post under the wrong day in the week grid.
    const instant = new Date('2026-09-01T23:45:00.000Z')
    expect(partsInZone('Asia/Kolkata', instant)).toMatchObject({ day: 2, hour: 5, minute: 15 })
    expect(partsInZone('America/Los_Angeles', instant)).toMatchObject({ day: 1, hour: 16 })
  })
})

describe('instantAtWallClock', () => {
  const wall = { year: 2026, month: 9, day: 2, hour: 9, minute: 0 }

  it('builds the instant a reader in that zone means by 9:00', () => {
    expect(instantAtWallClock('Asia/Kolkata', wall).toISOString()).toBe('2026-09-02T03:30:00.000Z')
    expect(instantAtWallClock('Asia/Dubai', wall).toISOString()).toBe('2026-09-02T05:00:00.000Z')
    expect(instantAtWallClock('UTC', wall).toISOString()).toBe('2026-09-02T09:00:00.000Z')
  })

  it('round-trips with partsInZone for every zone this product names', () => {
    // The property that matters: what a person picks is what they are shown.
    for (const zone of ['Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/Los_Angeles']) {
      for (const hour of [0, 9, 13, 23]) {
        const parts = { ...wall, hour }
        expect(partsInZone(zone, instantAtWallClock(zone, parts))).toEqual(parts)
      }
    }
  })

  it('is right on the day the clocks go forward', () => {
    // London, 29 March 2026: 01:00 becomes 02:00. An offset read at the START of
    // the day and applied to an evening time is an hour wrong — the classic way
    // this arithmetic passes a casual test and fails a real one.
    expect(
      instantAtWallClock('Europe/London', {
        year: 2026,
        month: 3,
        day: 29,
        hour: 20,
        minute: 0,
      }).toISOString(),
    ).toBe('2026-03-29T19:00:00.000Z')

    // The same wall clock the day before, when London is still on GMT.
    expect(
      instantAtWallClock('Europe/London', {
        year: 2026,
        month: 3,
        day: 28,
        hour: 20,
        minute: 0,
      }).toISOString(),
    ).toBe('2026-03-28T20:00:00.000Z')
  })

  it('is right on the day the clocks go back', () => {
    // Los Angeles, 25 October 2026: an evening time is PDT before the change.
    expect(
      instantAtWallClock('America/Los_Angeles', {
        year: 2026,
        month: 10,
        day: 24,
        hour: 18,
        minute: 30,
      }).toISOString(),
    ).toBe('2026-10-25T01:30:00.000Z')
  })

  it('is right for an ordinary time on a day the clocks moved', () => {
    // THE CASE THAT PROVES THE SECOND PASS. MEASURED across 21,900 wall clocks
    // in 10 zones: one pass and two disagree 29 times, and this is one of them.
    // 03:00 on 8 March in Los Angeles is a perfectly ordinary time — it exists
    // once, nothing is ambiguous — and a single-pass offset lands an hour late
    // at 04:00. A customer would see their morning post scheduled for an hour
    // they did not choose, on two days a year, in the zone most of the world's
    // scheduling software is written in.
    const taken = instantAtWallClock('America/Los_Angeles', {
      year: 2026,
      month: 3,
      day: 8,
      hour: 3,
      minute: 0,
    })
    expect(taken.toISOString()).toBe('2026-03-08T10:00:00.000Z')
    expect(partsInZone('America/Los_Angeles', taken)).toMatchObject({ hour: 3, minute: 0 })
  })

  it('is right for an ordinary time on the day the clocks went back', () => {
    // The same shape on the other transition: 02:30 exists exactly once on
    // 1 November, and one pass reads it back as 01:30.
    const taken = instantAtWallClock('America/Los_Angeles', {
      year: 2026,
      month: 11,
      day: 1,
      hour: 2,
      minute: 30,
    })
    expect(partsInZone('America/Los_Angeles', taken)).toMatchObject({ hour: 2, minute: 30 })
  })

  it('resolves a wall clock that happens twice, and says which it took', () => {
    // 01:30 on 1 November 2026 exists twice in Los Angeles. There is no correct
    // answer, only a stated one: the FIRST occurrence, the earlier instant. A
    // scheduler that silently picked the later one would publish an hour late
    // once a year with nothing to point at.
    const taken = instantAtWallClock('America/Los_Angeles', {
      year: 2026,
      month: 11,
      day: 1,
      hour: 1,
      minute: 30,
    })
    // MEASURED: both 08:30Z and 09:30Z read back as 01:30 that morning. The
    // earlier is taken, and a reader who meant the later one is an hour early
    // rather than an hour late — the direction that does not miss a slot.
    expect(taken.toISOString()).toBe('2026-11-01T08:30:00.000Z')
  })

  it('takes the first of a repeated hour in London too, not just in America', () => {
    // The same hour repeats in every zone that observes daylight saving, and
    // the arithmetic must not be tuned to one continent's transition dates.
    const taken = instantAtWallClock('Europe/London', {
      year: 2026,
      month: 10,
      day: 25,
      hour: 1,
      minute: 30,
    })
    expect(taken.toISOString()).toBe('2026-10-25T00:30:00.000Z')
  })

  it('handles a zone whose clocks move by half an hour, not a whole one', () => {
    // MEASURED: Lord Howe shifts by 30 minutes, so 01:30 on 5 April 2026 is
    // reached at both 14:30Z and 15:00Z — a repeated HALF hour. Arithmetic tuned
    // to whole-hour transitions gets this wrong, and it is the shape that never
    // appears in a test suite written against American zones.
    const taken = instantAtWallClock('Australia/Lord_Howe', {
      year: 2026,
      month: 4,
      day: 5,
      hour: 1,
      minute: 30,
    })
    expect(taken.toISOString()).toBe('2026-04-04T14:30:00.000Z')
  })

  it('does not invent a wall clock that never happens', () => {
    // 02:30 on 8 March 2026 does not exist in Los Angeles; the clock jumps 02:00
    // to 03:00. Something must come back, and the honest answer is the instant
    // the clock reaches next, not a time the customer could never have meant.
    const taken = instantAtWallClock('America/Los_Angeles', {
      year: 2026,
      month: 3,
      day: 8,
      hour: 2,
      minute: 30,
    })
    // 03:30 PDT — the same distance past the jump, which is what every calendar
    // application does and what a reader would recognise.
    expect(partsInZone('America/Los_Angeles', taken)).toMatchObject({ hour: 3, minute: 30 })
  })
})

describe('the write gate and the read gate are the same gate', () => {
  /**
   * ── WHAT WAS MEASURED ───────────────────────────────────────────────────────
   * `actions/workspace.ts` used a local `isRealTimezone` — a bare
   * `new Intl.DateTimeFormat` try/catch — while every screen consults
   * `isKnownZone`, which also refuses an offset and anything without a `/`.
   * Six values passed the save and failed the render, so a customer set a zone,
   * saw it echoed back as saved, and every screen went on showing IST with
   * nothing saying the setting had been dropped.
   *
   * These are the six. The action now calls `isKnownZone` itself, so this file
   * is the one place the rule lives.
   */
  const STORED_THEN_IGNORED = ['IST', 'Japan', 'Singapore', 'Egypt', 'EST5EDT', '+05:30']

  it('refuses everything Intl would have let through', () => {
    for (const zone of STORED_THEN_IGNORED) {
      // Intl really does accept these — that is the whole trap.
      expect(() => new Intl.DateTimeFormat('en', { timeZone: zone })).not.toThrow()
      expect(isKnownZone(zone)).toBe(false)
    }
  })

  it('still accepts the zones a customer would actually pick', () => {
    // Without this, `isKnownZone` returning false for everything passes the above.
    for (const zone of ['Asia/Kolkata', 'UTC', 'America/New_York', 'Europe/London']) {
      expect(isKnownZone(zone)).toBe(true)
    }
  })

  it('says WHY, and never calls an ambiguous name an unrecognised one', () => {
    // "Sahoda does not recognise IST" is false. It is recognised and ambiguous,
    // and a person told it is unknown goes looking for a typo that is not there.
    expect(describeZoneRefusal('IST')).toMatch(/abbreviation/i)
    expect(describeZoneRefusal('IST')).not.toMatch(/does not recognise/i)
    expect(describeZoneRefusal('+05:30')).toMatch(/offset/i)
    // And each one names something the reader can do next.
    expect(describeZoneRefusal('IST')).toMatch(/Asia\/Kolkata/)
    expect(describeZoneRefusal('+05:30')).toMatch(/Asia\/Kolkata/)
  })
})
