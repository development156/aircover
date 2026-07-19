import { CONSTRAINTS, type Channel } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { earliestScheduleAt, validateScheduleLead, type ScheduleCheck } from './schedule'

const NOW = new Date('2026-07-19T12:00:00.000Z')
const MINUTE = 60_000

/** Builds a Date offset from NOW so intent reads at the call site. */
const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs)

describe('CONSTRAINTS lead data', () => {
  test('pins that every channel currently declares a 5 minute lead', () => {
    // The max-lead tests below are only meaningful while these agree. If a
    // channel's lead diverges, this fails first and points at the real change.
    for (const spec of Object.values(CONSTRAINTS)) {
      expect(spec.scheduleMinLeadMinutes).toBe(5)
    }
  })
})

describe('earliestScheduleAt', () => {
  test('returns now plus the channel lead for a single channel', () => {
    expect(earliestScheduleAt(['x'], NOW).toISOString()).toBe(at(5 * MINUTE).toISOString())
  })

  test('takes the largest lead across several channels', () => {
    const channels: readonly Channel[] = ['x', 'gbp', 'linkedin', 'instagram']
    const expectedLead = Math.max(
      ...channels.map((channel) => CONSTRAINTS[channel].scheduleMinLeadMinutes),
    )

    expect(earliestScheduleAt(channels, NOW).getTime()).toBe(NOW.getTime() + expectedLead * MINUTE)
  })

  test('treats an empty channel list as no lead requirement, so now itself is the floor', () => {
    expect(earliestScheduleAt([], NOW).getTime()).toBe(NOW.getTime())
  })

  test('ignores an unrecognised channel rather than throwing on stale stored data', () => {
    // Channels arrive from DB rows typed as Channel. A row written before a
    // channel was renamed must degrade to "no extra lead", not crash the editor.
    const stale = 'facebook' as Channel

    expect(earliestScheduleAt([stale], NOW).getTime()).toBe(NOW.getTime())
    expect(earliestScheduleAt([stale, 'x'], NOW).getTime()).toBe(NOW.getTime() + 5 * MINUTE)
  })

  test('returns an invalid date when now is invalid rather than throwing', () => {
    const result = earliestScheduleAt(['x'], new Date('not a date'))

    expect(Number.isNaN(result.getTime())).toBe(true)
  })

  test('does not mutate the caller now, and returns a date the caller may mutate freely', () => {
    const now = new Date(NOW.getTime())
    const earliest = earliestScheduleAt(['x'], now)
    earliest.setFullYear(1999)

    expect(now.toISOString()).toBe(NOW.toISOString())
  })
})

describe('validateScheduleLead', () => {
  test('accepts a null scheduledAt as publish now', () => {
    const check = validateScheduleLead(['x'], null, NOW)

    expect(check.ok).toBe(true)
    expect(check.message).toBeUndefined()
  })

  test('accepts a time exactly on the 5 minute boundary', () => {
    const check = validateScheduleLead(['x'], at(5 * MINUTE), NOW)

    expect(check.ok).toBe(true)
    expect(check.message).toBeUndefined()
  })

  test('rejects a time one second under the boundary', () => {
    const check = validateScheduleLead(['x'], at(5 * MINUTE - 1000), NOW)

    expect(check.ok).toBe(false)
    expect(check.message).toMatch(/at least 5 minutes from now/i)
  })

  test('accepts a comfortably future time', () => {
    const check = validateScheduleLead(['x'], at(3 * 60 * MINUTE), NOW)

    expect(check.ok).toBe(true)
  })

  test('rejects a time in the past', () => {
    const check = validateScheduleLead(['x'], at(-MINUTE), NOW)

    expect(check.ok).toBe(false)
    expect(check.message).toMatch(/at least 5 minutes from now/i)
  })

  test('rejects an invalid scheduledAt without throwing', () => {
    const check = validateScheduleLead(['x'], new Date('nonsense'), NOW)

    expect(check.ok).toBe(false)
    expect(check.message).toMatch(/pick a (valid )?date and time/i)
  })

  test('rejects when now itself is invalid without throwing', () => {
    const check = validateScheduleLead(['x'], at(60 * MINUTE), new Date('nonsense'))

    expect(check.ok).toBe(false)
    // Pins the copy, not merely "some message". An unreadable clock must not be
    // reported as a lead-time problem: without this the guard can be deleted
    // outright and the comfortably-future time still falls through to
    // "at least 5 minutes from now", blaming the user for a broken clock.
    expect(check.message).toBe('Pick a valid date and time.')
  })

  test('refuses publish-now when now is unreadable rather than passing on an invalid floor', () => {
    // scheduledAt null is "publish now", but a verdict still needs a clock. Any
    // ok:true here would ship an Invalid Date as check.earliest.
    const check = validateScheduleLead(['x'], null, new Date('nonsense'))

    expect(check.ok).toBe(false)
    expect(check.message).toBe('Pick a valid date and time.')
  })

  test('reports a usable earliest whenever it reports ok', () => {
    const cases: readonly ScheduleCheck[] = [
      validateScheduleLead(['x'], null, NOW),
      validateScheduleLead(['x'], at(5 * MINUTE), NOW),
      validateScheduleLead([], at(1000), NOW),
      validateScheduleLead(['x'], null, new Date('nonsense')),
    ]

    for (const check of cases) {
      if (check.ok) expect(Number.isNaN(check.earliest.getTime())).toBe(false)
    }
  })

  test('reports the largest lead when several channels are selected', () => {
    const channels: readonly Channel[] = ['x', 'gbp', 'linkedin', 'instagram']
    const expectedLead = Math.max(
      ...channels.map((channel) => CONSTRAINTS[channel].scheduleMinLeadMinutes),
    )
    const check = validateScheduleLead(channels, at(MINUTE), NOW)

    expect(check.ok).toBe(false)
    expect(check.message).toMatch(new RegExp(`at least ${expectedLead} minutes from now`, 'i'))
    expect(check.earliest.getTime()).toBe(NOW.getTime() + expectedLead * MINUTE)
  })

  test('rejects a past time even with no channels selected', () => {
    const check = validateScheduleLead([], at(-MINUTE), NOW)

    expect(check.ok).toBe(false)
    expect(check.message).toMatch(/in the future/i)
  })

  test('accepts any future time when no channels are selected', () => {
    const check = validateScheduleLead([], at(1000), NOW)

    expect(check.ok).toBe(true)
  })

  test('always reports the earliest allowed time so the UI can offer it', () => {
    const check = validateScheduleLead(['x'], at(MINUTE), NOW)

    expect(check.earliest.getTime()).toBe(NOW.getTime() + 5 * MINUTE)
  })

  test('never leaks internals in its copy', () => {
    const messages = [
      validateScheduleLead(['x'], at(-MINUTE), NOW).message,
      validateScheduleLead(['x'], new Date('nonsense'), NOW).message,
      validateScheduleLead(['x'], at(60 * MINUTE), new Date('nonsense')).message,
      validateScheduleLead([], at(-MINUTE), NOW).message,
    ]

    for (const message of messages) {
      expect(message).toBeDefined()
      expect(message).not.toMatch(
        /NaN|Invalid Date|undefined|null|Error|at \w+ \(|select |scheduled_at|scheduleMinLeadMinutes/i,
      )
    }
  })

  test('writes verb-first sentence-case copy ending in a period', () => {
    const message = validateScheduleLead(['x'], at(-MINUTE), NOW).message ?? ''

    expect(message).toMatch(/^Pick /)
    expect(message.endsWith('.')).toBe(true)
  })
})
