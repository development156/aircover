import { describe, expect, it } from 'vitest'
import type { Channel } from '@sahoda/shared'

import {
  DELIVERY_WINDOW_MINUTES,
  deliveryRangeNote,
  candidateChoices,
  formatChoiceTime,
  keepScheduleable,
  scheduleChoices,
} from './schedule-choices'
import { SCHEDULE_DELIVERY_WINDOW_MS } from './delivery-window'
import { earliestScheduleAt } from './schedule'
import { addDaysInZone, dayKey } from '@/lib/time/day-key'
import { partsInZone, zoneLabel } from '@/lib/time/zone'

/**
 * THE NINTH CLICK, AND THE PROMISE IT MAKES.
 *
 * Two different things are guarded here and they fail in opposite directions:
 *
 *  · a choice that the channels would REFUSE is a dead end — a button that
 *    cannot be pressed, which is the exact shape this lane exists to remove;
 *  · a delivery note that promises a tighter window than the cron can deliver
 *    is a small lie told to every user, every time.
 *
 * The assertions are about the CLAIM, never the wording. `docs/37` §17 and
 * `lib/inbox/emptiness.ts` set that rule: rewrite the sentence freely, keep the
 * guarantee. So nothing below matches on prose it does not have to.
 */

const IST = 'Asia/Kolkata'
const NY = 'America/New_York'

/** A Tuesday, mid-afternoon IST. Fixed, because a clock in a test is a flake. */
const NOW = new Date('2026-08-25T15:40:00+05:30')

describe('the named schedule choices', () => {
  it('offers a shortcut a person can say out loud, and prints the instant it means', () => {
    const choices = scheduleChoices(IST, ['instagram'], NOW)
    expect(choices.length).toBeGreaterThan(0)
    for (const choice of choices) {
      // The label is words, never a mask. The whole defect was a control that
      // only spoke dd/mm/yyyy.
      expect(choice.label).not.toMatch(/\d/)
      // And the exact instant is renderable beside it, so the words hide nothing.
      expect(formatChoiceTime(IST, choice.when)).toMatch(/\d/)
      expect(Number.isNaN(choice.when.getTime())).toBe(false)
    }
  })

  it('never offers a time the channels would refuse', () => {
    // The one assertion that makes this a guard rather than a list. Every
    // channel's lead is read from the Constraint Engine by `earliestScheduleAt`;
    // a choice below that floor is a button whose click gets rejected.
    const sets: Channel[][] = [['instagram'], ['x'], ['linkedin'], ['instagram', 'linkedin', 'x']]
    for (const channels of sets) {
      const floor = earliestScheduleAt(channels, NOW).getTime()
      for (const choice of scheduleChoices(IST, channels, NOW)) {
        expect(choice.when.getTime()).toBeGreaterThanOrEqual(floor)
      }
    }
  })

  it('yields an empty list rather than Invalid Dates when the clock is unreadable', () => {
    expect(scheduleChoices(IST, ['instagram'], new Date(Number.NaN))).toEqual([])
  })

  describe('the floor filter, at leads no channel declares today', () => {
    /**
     * MEASURED: every channel's `scheduleMinLeadMinutes` is 5, and the soonest
     * candidate is an hour out — so through `scheduleChoices` this filter
     * removes nothing and cannot be shown to work. These exercise it directly,
     * so the behaviour is covered before a platform needs it rather than after
     * a customer's click is refused.
     */
    const candidates = candidateChoices(IST, NOW)

    it('keeps everything when the floor is below the soonest choice', () => {
      expect(keepScheduleable(candidates, new Date(NOW.getTime() + 60_000))).toHaveLength(
        candidates.length,
      )
    })

    it('drops only what sits below the floor', () => {
      // A three-hour lead outlives "in an hour" and nothing else.
      const kept = keepScheduleable(candidates, new Date(NOW.getTime() + 3 * 3600_000))
      expect(kept.map((c) => c.id)).toEqual(['tomorrow-morning', 'tomorrow-evening'])
    })

    it('returns nothing rather than padding when every choice is illegal', () => {
      // Two days of lead. The caller must then show only the exact picker, and
      // a padded list here would put an unpressable button on the screen.
      expect(keepScheduleable(candidates, new Date(NOW.getTime() + 48 * 3600_000))).toEqual([])
    })

    it('accepts a choice sitting exactly ON the floor, as the validator does', () => {
      const morning = candidates.find((c) => c.id === 'tomorrow-morning')!
      expect(keepScheduleable([morning], new Date(morning.when.getTime()))).toHaveLength(1)
    })
  })

  it('orders the choices from soonest to furthest', () => {
    const times = scheduleChoices(IST, ['instagram'], NOW).map((c) => c.when.getTime())
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('rounds "in an hour" onto a time somebody would actually say', () => {
    const hour = scheduleChoices(IST, ['instagram'], NOW).find((c) => c.id === 'hour')
    expect(hour).toBeDefined()
    expect(partsInZone(IST, hour!.when).minute % 5).toBe(0)
    expect(hour!.when.getUTCSeconds()).toBe(0)
    // And it is genuinely about an hour away, not a rounding that ate the hour.
    const away = hour!.when.getTime() - NOW.getTime()
    expect(away).toBeGreaterThanOrEqual(3600_000)
    expect(away).toBeLessThan(3600_000 + 5 * 60_000)
  })

  it('puts the named parts of the day on tomorrow, at the hour their name claims', () => {
    const choices = scheduleChoices(IST, ['instagram'], NOW)
    const morning = choices.find((c) => c.id === 'tomorrow-morning')!
    const evening = choices.find((c) => c.id === 'tomorrow-evening')!
    // The label says tomorrow; the date has to be tomorrow ON THE WORKSPACE'S
    // CALENDAR, not today+0 and not a UTC day that is tomorrow only elsewhere.
    const tomorrow = dayKey(IST, addDaysInZone(IST, NOW, 1))
    expect(dayKey(IST, morning.when)).toBe(tomorrow)
    expect(dayKey(IST, evening.when)).toBe(tomorrow)
    // "Morning" before noon and "evening" after five, or the words are wrong.
    expect(partsInZone(IST, morning.when).hour).toBeLessThan(12)
    expect(partsInZone(IST, evening.when).hour).toBeGreaterThanOrEqual(17)
  })

  it('builds "tomorrow morning" in the workspace’s zone, not the device’s', () => {
    // THE DEFECT, AS AN INSTANT. The same "now", two workspaces: the Kolkata
    // one means 03:30Z and the New York one means 13:00Z. The old `setHours`
    // gave whichever the browser happened to be in, to both.
    const now = new Date('2026-09-02T12:00:00Z')
    const ist = candidateChoices(IST, now).find((c) => c.id === 'tomorrow-morning')!
    const ny = candidateChoices(NY, now).find((c) => c.id === 'tomorrow-morning')!
    expect(ist.when.toISOString()).toBe('2026-09-03T03:30:00.000Z')
    expect(ny.when.toISOString()).toBe('2026-09-03T13:00:00.000Z')
    expect(partsInZone(NY, ny.when)).toMatchObject({ day: 3, hour: 9, minute: 0 })
  })

  it('lands on 9:00 am the morning after New York falls back', () => {
    // Saturday 31 October, afternoon. Tomorrow is the transition day and its
    // 9:00 am is EST: 14:00Z. Adding 24h to a wall clock would say 13:00Z.
    const now = new Date('2026-10-31T16:00:00-04:00')
    const morning = candidateChoices(NY, now).find((c) => c.id === 'tomorrow-morning')!
    expect(morning.when.toISOString()).toBe('2026-11-01T14:00:00.000Z')
    expect(dayKey(NY, morning.when)).toBe('2026-11-01')
  })

  it('prints the zone once beside the instant, so the words hide no clock', () => {
    // The label is whatever `zoneLabel` gives that zone (IST for Kolkata, an
    // offset for a zone this locale has no short name for). The claim here is
    // that it is THERE, it is the right zone's, and it is said once.
    const at = new Date('2026-09-03T13:00:00Z')
    expect(formatChoiceTime(NY, at).endsWith(`9:00 am ${zoneLabel(NY, at)}`)).toBe(true)
    expect(formatChoiceTime(IST, at).endsWith('6:30 pm IST')).toBe(true)
    expect(formatChoiceTime(IST, at).match(/IST/g)).toHaveLength(1)
    expect(formatChoiceTime(NY, at)).not.toMatch(/IST/)
  })
})

describe('the delivery promise', () => {
  it('states a RANGE, never a single instant', () => {
    // The lie being removed is a to-the-minute promise. A note that renders one
    // time is that promise however it is worded, so the shape is asserted: two
    // clock readings, and they differ.
    const note = deliveryRangeNote(IST, new Date('2026-08-25T18:00:00+05:30'))
    const times = note.match(/\d{1,2}:\d{2}/g) ?? []
    expect(times.length).toBeGreaterThanOrEqual(2)
    expect(new Set(times).size).toBeGreaterThanOrEqual(2)
  })

  it('promises exactly the window the product refuses to call late', () => {
    // THE LOAD-BEARING ONE. `autoPublishTruth` will not say "late" until
    // `SCHEDULE_DELIVERY_WINDOW_MS` has elapsed. If the picker promised a
    // tighter window than that, the screen would contradict itself: the post
    // would be past its promised range and still not flagged. Derived from the
    // same constant, and asserted so a change to one without the other is red.
    expect(DELIVERY_WINDOW_MINUTES * 60_000).toBeGreaterThanOrEqual(SCHEDULE_DELIVERY_WINDOW_MS)
  })

  it('is not so loose it becomes useless', () => {
    // Erring long is correct (delivery-window.ts argues why), but a range of
    // half an hour would be a different kind of unhelpful. Ceiling of the real
    // window, and nothing beyond it.
    expect(DELIVERY_WINDOW_MINUTES * 60_000 - SCHEDULE_DELIVERY_WINDOW_MS).toBeLessThan(60_000)
  })

  it('names the interval it is derived from rather than a rounded story', () => {
    // The sentence has to carry the cron period, because "around that time" was
    // the version that told the user nothing measurable.
    expect(deliveryRangeNote(IST, NOW)).toMatch(/every 5 minutes/)
  })

  it('reads the window in the workspace’s zone and names it', () => {
    const at = new Date('2026-09-03T13:00:00Z')
    expect(deliveryRangeNote(NY, at)).toContain(
      `9:00 am and 9:${String(DELIVERY_WINDOW_MINUTES).padStart(2, '0')} am ${zoneLabel(NY, at)}`,
    )
    expect(deliveryRangeNote(IST, at)).toMatch(/6:30 pm and 6:\d\d pm IST/)
    expect(deliveryRangeNote(NY, at)).not.toMatch(/IST/)
  })
})
