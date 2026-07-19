import { describe, expect, test } from 'vitest'

import { earliestScheduleAt } from '@/lib/posts/schedule'

import { normalizeSlot, SLOT_HORIZON_DAYS } from './slots'

/**
 * The model suggests slots; this module makes them TRUE. "Your week is planned"
 * must hold even when the model returns a past time, garbage, or a date next
 * quarter — every draft lands with a real, schedulable future timestamp.
 */

const NOW = new Date('2026-07-20T06:00:00.000Z')
const CHANNELS = ['x', 'gbp'] as const

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

describe('normalizeSlot', () => {
  test('keeps a valid future slot inside the horizon, unclamped', () => {
    const raw = '2026-07-22T10:30:00.000Z'

    const slot = normalizeSlot(raw, [...CHANNELS], NOW, 0)

    expect(slot).toEqual({ scheduledAt: raw, clamped: false })
  })

  test('clamps a past slot to a deterministic future hour', () => {
    const slot = normalizeSlot('2026-07-19T10:00:00.000Z', [...CHANNELS], NOW, 0)

    expect(slot.clamped).toBe(true)
    const at = new Date(slot.scheduledAt)
    expect(at.getTime()).toBeGreaterThan(NOW.getTime())
    // Fallbacks land on a full hour — model half-slots don't leak through.
    expect(at.getUTCMinutes()).toBe(0)
    expect(at.getUTCSeconds()).toBe(0)
  })

  test('clamps garbage', () => {
    const slot = normalizeSlot('next tuesday-ish', [...CHANNELS], NOW, 0)

    expect(slot.clamped).toBe(true)
    expect(Number.isNaN(new Date(slot.scheduledAt).getTime())).toBe(false)
  })

  test('clamps a slot beyond the horizon — a "week" plan cannot schedule next quarter', () => {
    const beyond = new Date(NOW.getTime() + (SLOT_HORIZON_DAYS + 3) * DAY_MS).toISOString()

    const slot = normalizeSlot(beyond, [...CHANNELS], NOW, 0)

    expect(slot.clamped).toBe(true)
    const at = new Date(slot.scheduledAt).getTime()
    expect(at).toBeLessThanOrEqual(NOW.getTime() + SLOT_HORIZON_DAYS * DAY_MS)
  })

  test('clamps a slot inside the channel lead window', () => {
    // 1 minute out is under every channel's scheduleMinLeadMinutes.
    const tooSoon = new Date(NOW.getTime() + 60_000).toISOString()

    const slot = normalizeSlot(tooSoon, [...CHANNELS], NOW, 0)

    expect(slot.clamped).toBe(true)
    expect(new Date(slot.scheduledAt).getTime()).toBeGreaterThanOrEqual(
      earliestScheduleAt([...CHANNELS], NOW).getTime(),
    )
  })

  test('staggers fallbacks by index so five bad slots land on five different days', () => {
    const days = [0, 1, 2, 3, 4].map((index) => {
      const slot = normalizeSlot('garbage', [...CHANNELS], NOW, index)
      return new Date(slot.scheduledAt).toISOString().slice(0, 10)
    })

    expect(new Set(days).size).toBe(5)
  })

  test('every fallback respects the channel lead', () => {
    for (const index of [0, 1, 2, 3, 4]) {
      const slot = normalizeSlot('', [...CHANNELS], NOW, index)
      expect(new Date(slot.scheduledAt).getTime()).toBeGreaterThanOrEqual(
        earliestScheduleAt([...CHANNELS], NOW).getTime(),
      )
    }
  })
})
