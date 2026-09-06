import { describe, expect, test } from 'vitest'

import { received } from './received'

/**
 * "RECEIVED" IS TWO ANSWERS TO TWO QUESTIONS, AND A THIRD ANSWER IS SILENCE.
 *
 * The date is for the person ringing somebody back; the age is for the person
 * scanning a board for whoever has been left waiting. A stamp that will not
 * parse produces neither, because a wrong date on this line is the one a shop
 * owner would use to decide nobody has been ignored.
 */

const NOW = new Date('2026-09-08T09:00:00.000Z')

describe('the date, in the workspace’s own zone', () => {
  test('reads as a person would say it', () => {
    expect(received('2026-01-06T09:42:00.000Z', NOW, 'Asia/Kolkata').when).toBe(
      'Tue 6 Jan, 3:12 pm',
    )
  })

  test('a workspace in another zone gets its own clock, not ours', () => {
    // The same instant. 3:12 pm in Kolkata is 5:42 am in New York, and a shop
    // owner there must not be told their customer wrote in the afternoon.
    const there = received('2026-01-06T09:42:00.000Z', NOW, 'America/New_York')
    expect(there.when).toBe('Tue 6 Jan, 4:42 am')
    expect(there.zoneIsFallback).toBe(false)
  })

  test('a workspace with no zone falls back and says the fallback was not chosen', () => {
    const fallback = received('2026-01-06T09:42:00.000Z', NOW, null)
    expect(fallback.zone).toBe('Asia/Kolkata')
    expect(fallback.zoneIsFallback).toBe(true)
  })

  test('a stored zone the runtime cannot use falls back rather than throwing', () => {
    // A screen that renders beats a screen that does not.
    expect(received('2026-01-06T09:42:00.000Z', NOW, 'Asia/Kolkatta').zone).toBe('Asia/Kolkata')
  })
})

describe('the age', () => {
  test('says how long somebody has been waiting', () => {
    expect(received('2026-09-06T09:00:00.000Z', NOW, 'Asia/Kolkata').age).toBe('2 days ago')
    expect(received('2026-09-07T09:00:00.000Z', NOW, 'Asia/Kolkata').age).toBe('yesterday')
    expect(received('2026-09-08T06:00:00.000Z', NOW, 'Asia/Kolkata').age).toBe('3 hours ago')
  })
})

describe('a stamp that will not parse', () => {
  test('produces no date and no age rather than today’s', () => {
    const broken = received('not a date', NOW, 'Asia/Kolkata')
    expect(broken.when).toBeNull()
    expect(broken.age).toBeNull()
  })
})
