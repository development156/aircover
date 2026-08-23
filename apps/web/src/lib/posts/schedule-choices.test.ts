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

/** A Tuesday, mid-afternoon IST. Fixed, because a clock in a test is a flake. */
const NOW = new Date('2026-08-25T15:40:00+05:30')

describe('the named schedule choices', () => {
  it('offers a shortcut a person can say out loud, and prints the instant it means', () => {
    const choices = scheduleChoices(['instagram'], NOW)
    expect(choices.length).toBeGreaterThan(0)
    for (const choice of choices) {
      // The label is words, never a mask. The whole defect was a control that
      // only spoke dd/mm/yyyy.
      expect(choice.label).not.toMatch(/\d/)
      // And the exact instant is renderable beside it, so the words hide nothing.
      expect(formatChoiceTime(choice.when)).toMatch(/\d/)
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
      for (const choice of scheduleChoices(channels, NOW)) {
        expect(choice.when.getTime()).toBeGreaterThanOrEqual(floor)
      }
    }
  })

  it('yields an empty list rather than Invalid Dates when the clock is unreadable', () => {
    expect(scheduleChoices(['instagram'], new Date(Number.NaN))).toEqual([])
  })

  describe('the floor filter, at leads no channel declares today', () => {
    /**
     * MEASURED: every channel's `scheduleMinLeadMinutes` is 5, and the soonest
     * candidate is an hour out — so through `scheduleChoices` this filter
     * removes nothing and cannot be shown to work. These exercise it directly,
     * so the behaviour is covered before a platform needs it rather than after
     * a customer's click is refused.
     */
    const candidates = candidateChoices(NOW)

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
    const times = scheduleChoices(['instagram'], NOW).map((c) => c.when.getTime())
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('rounds "in an hour" onto a time somebody would actually say', () => {
    const hour = scheduleChoices(['instagram'], NOW).find((c) => c.id === 'hour')
    expect(hour).toBeDefined()
    expect(hour!.when.getMinutes() % 5).toBe(0)
    expect(hour!.when.getSeconds()).toBe(0)
    // And it is genuinely about an hour away, not a rounding that ate the hour.
    const away = hour!.when.getTime() - NOW.getTime()
    expect(away).toBeGreaterThanOrEqual(3600_000)
    expect(away).toBeLessThan(3600_000 + 5 * 60_000)
  })

  it('puts the named parts of the day on tomorrow, at the hour their name claims', () => {
    const choices = scheduleChoices(['instagram'], NOW)
    const morning = choices.find((c) => c.id === 'tomorrow-morning')!
    const evening = choices.find((c) => c.id === 'tomorrow-evening')!
    // The label says tomorrow; the date has to be tomorrow, not today+0 and not
    // a UTC day that is tomorrow only in another timezone.
    expect(morning.when.getDate()).toBe(NOW.getDate() + 1)
    expect(evening.when.getDate()).toBe(NOW.getDate() + 1)
    // "Morning" before noon and "evening" after five, or the words are wrong.
    expect(morning.when.getHours()).toBeLessThan(12)
    expect(evening.when.getHours()).toBeGreaterThanOrEqual(17)
  })
})

describe('the delivery promise', () => {
  it('states a RANGE, never a single instant', () => {
    // The lie being removed is a to-the-minute promise. A note that renders one
    // time is that promise however it is worded, so the shape is asserted: two
    // clock readings, and they differ.
    const note = deliveryRangeNote(new Date('2026-08-25T18:00:00+05:30'))
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
    expect(deliveryRangeNote(NOW)).toMatch(/every 5 minutes/)
  })
})
