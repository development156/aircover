import { describe, expect, test } from 'vitest'

import { landingRedirect } from './landing'
import type { OnboardingStatus } from './read-onboarding-state'

/**
 * THE LANDING RULE, every case executed.
 *
 * The founder's ruling is one sentence — a new user signs in and lands in
 * onboarding, not the dashboard — and it has five cases, two of which are
 * "do nothing" and are the ones a redirect gets wrong.
 */

const ALL: OnboardingStatus[] = ['completed', 'not-started', 'no-workspace', 'unreadable']

describe('a fresh visit', () => {
  test('an account that has never onboarded is sent to onboarding', () => {
    expect(landingRedirect('not-started', false)).toBe('/onboarding')
  })

  test('an account with no workspace at all is sent to onboarding, where the remedy is', () => {
    // The peer's finding: /analytics told a workspace-less account to connect a
    // channel. This is the fix for the whole class — that page is unreachable in
    // that state rather than individually re-worded.
    expect(landingRedirect('no-workspace', false)).toBe('/onboarding')
  })

  test('an account that has completed onboarding is left on the dashboard', () => {
    expect(landingRedirect('completed', false)).toBeNull()
  })

  /**
   * THE CLAIM THIS FILE EXISTS FOR.
   *
   * `activeBrandMemory` answers `null` for "no brain" AND for "the read failed",
   * and routing on that null walks a customer who finished onboarding weeks ago
   * back to its first screen because one query hiccupped. `read-onboarding-state`
   * keeps the two apart; this asserts the decision honours the distinction.
   */
  test('a read that FAILED moves nobody', () => {
    expect(landingRedirect('unreadable', false)).toBeNull()
  })

  test('unreadable and not-started are not the same answer', () => {
    expect(landingRedirect('unreadable', false)).not.toBe(landingRedirect('not-started', false))
  })
})

describe('a visit that already pressed Save & exit', () => {
  /**
   * wt-onboard2 built `Save & exit`. A gate that bounced it back to /onboarding
   * would have deleted that feature while every test of the button still passed
   * — it would still save, still navigate, and still arrive nowhere.
   */
  test.each(ALL)('%s is left alone once the visit has deferred', (status) => {
    expect(landingRedirect(status, true)).toBeNull()
  })
})

describe('the rule is total', () => {
  test('every status has a decision and none of them throws', () => {
    for (const status of ALL) {
      for (const deferred of [true, false]) {
        const target = landingRedirect(status, deferred)
        expect(target === null || target === '/onboarding').toBe(true)
      }
    }
  })

  test('only two of the eight combinations redirect', () => {
    // Pinned as a NUMBER so widening the rule cannot happen quietly: adding a
    // status that redirects, or dropping the defer check, moves this.
    const redirects = ALL.flatMap((status) =>
      [true, false].map((deferred) => landingRedirect(status, deferred)),
    ).filter((target) => target !== null)

    expect(redirects).toEqual(['/onboarding', '/onboarding'])
  })
})
