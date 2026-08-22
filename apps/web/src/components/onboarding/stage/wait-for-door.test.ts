import { describe, expect, it } from 'vitest'

import type { DoorOutcome } from './door-outcome'
import { DOOR_TICK_MS, DOOR_TIMED_OUT, DOOR_WAIT_TICKS, waitForDoor } from './wait-for-door'

const READ: DoorOutcome = {
  kind: 'read',
  text: 'We have poured chai on Residency Road since 2014.',
  label: 'chaiandchapters.in',
  foundName: 'Chai & Chapters',
  colors: [],
}

/** A clock that never really sleeps, so 45 seconds of waiting costs no time. */
function fakeSleep(): { sleep: (ms: number) => Promise<void>; elapsed: () => number } {
  let total = 0
  return {
    sleep: async (ms) => {
      total += ms
    },
    elapsed: () => total,
  }
}

describe('waitForDoor', () => {
  it('returns immediately when the read has already landed', async () => {
    const clock = fakeSleep()
    const outcome = await waitForDoor({ read: () => READ, sleep: clock.sleep })
    expect(outcome).toBe(READ)
    expect(clock.elapsed()).toBe(0)
  })

  it('returns the moment the read lands mid-wait', async () => {
    const clock = fakeSleep()
    let ticks = 0
    const outcome = await waitForDoor({
      read: () => (ticks++ < 3 ? ({ kind: 'reading' } as DoorOutcome) : READ),
      sleep: clock.sleep,
    })
    expect(outcome).toBe(READ)
    expect(clock.elapsed()).toBe(3 * DOOR_TICK_MS)
  })

  /**
   * THE ARM THAT NO REAL RUN REACHES.
   *
   * The read starts when the user leaves step 01 and they answer five more
   * screens before pressing Build, so in practice it has always landed. Forcing
   * it here is the only way this branch is ever executed — and an unbounded
   * version of it put a two-minute wall in front of the build with no exit.
   */
  it('gives up after the ceiling and says the build went on without the site', async () => {
    const clock = fakeSleep()
    const outcome = await waitForDoor({
      read: () => ({ kind: 'reading' }),
      sleep: clock.sleep,
    })
    expect(outcome).toBe(DOOR_TIMED_OUT)
    // 225 x 200ms = 45s, above the measured p90 of 37.0s and nowhere near the
    // 120s the first cut would have waited.
    expect(clock.elapsed()).toBe(DOOR_WAIT_TICKS * DOOR_TICK_MS)
    expect(clock.elapsed()).toBe(45_000)
  })

  it('says nothing about the page it never heard back about', async () => {
    // A timeout is not a verdict, so none of the words that would make it one.
    expect(DOOR_TIMED_OUT.message).not.toMatch(/could not read|unreadable|your site is broken/i)
    expect(DOOR_TIMED_OUT.message).toMatch(/not a verdict on your site/i)
  })

  /**
   * NOT retryable, and that is not an oversight. The brain has already been
   * built by the time this renders; a "try again" button would rerun nothing
   * that could change it — an impossible remedy.
   */
  it('offers no retry, because there is nothing left for a retry to fix', () => {
    expect(DOOR_TIMED_OUT.retryable).toBe(false)
    // And it is not fatal: the brain WAS built, so the flow must not halt.
    expect(DOOR_TIMED_OUT.fatal).toBe(false)
  })
})
