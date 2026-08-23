import { describe, expect, test } from 'vitest'

import { landingDecision, type LandingDecision } from './landing'
import type { OnboardingStatus } from './read-onboarding-state'

/**
 * THE LANDING RULE, every case executed.
 *
 * The founder's ruling is one sentence — a new user signs in and lands in
 * onboarding, not the dashboard — and it has four cases, two of which are "do
 * nothing" and are the ones a redirect gets wrong.
 */

const ALL: OnboardingStatus[] = ['completed', 'not-started', 'no-workspace', 'unreadable']

describe('a fresh visit', () => {
  test('an account that has never onboarded is sent into the flow', () => {
    expect(landingDecision('not-started', false)).toEqual({
      kind: 'redirect',
      to: '/onboarding',
    })
  })

  test('an account that has completed onboarding gets the page it asked for', () => {
    expect(landingDecision('completed', false)).toEqual({ kind: 'through' })
  })

  /**
   * THE CLAIM THIS FILE EXISTS FOR.
   *
   * `activeBrandMemory` answers `null` for "no brain" AND for "the read failed",
   * and routing on that null walks a customer who finished onboarding weeks ago
   * back to its first screen because one query hiccupped.
   */
  test('a read that FAILED moves nobody and replaces nothing', () => {
    expect(landingDecision('unreadable', false)).toEqual({ kind: 'through' })
  })

  test('unreadable and not-started are not the same decision', () => {
    expect(landingDecision('unreadable', false)).not.toEqual(landingDecision('not-started', false))
  })

  test('unreadable and no-workspace are not the same decision', () => {
    // "We could not look" must never render "Create a workspace to get started"
    // at a founder who has three.
    expect(landingDecision('unreadable', false)).not.toEqual(landingDecision('no-workspace', false))
  })
})

describe('an account with no workspace', () => {
  /**
   * The peer's finding: /analytics told a workspace-less account to connect a
   * channel, an instruction it cannot carry out. The fix is the whole class at
   * once — that page does not render in this state, at any URL.
   */
  test('is shown the first-run screen rather than sent anywhere', () => {
    expect(landingDecision('no-workspace', false)).toEqual({ kind: 'first-run' })
  })

  test('is NOT a redirect, because there is no workspace-less URL to redirect to', () => {
    expect(landingDecision('no-workspace', false).kind).not.toBe('redirect')
  })

  test('cannot be deferred away — there is no dashboard to defer to', () => {
    expect(landingDecision('no-workspace', true)).toEqual({ kind: 'first-run' })
  })
})

describe('a visit that already pressed Save & exit', () => {
  /**
   * wt-onboard2 built `Save & exit`. A gate that bounced it back to /onboarding
   * would have deleted that feature while every test of the button still passed
   * — it would still save, still navigate, and still arrive nowhere.
   */
  test('an un-onboarded account is let through for the rest of the visit', () => {
    expect(landingDecision('not-started', true)).toEqual({ kind: 'through' })
  })

  test('the deferral changes exactly one status', () => {
    const moved = ALL.filter(
      (status) =>
        JSON.stringify(landingDecision(status, true)) !==
        JSON.stringify(landingDecision(status, false)),
    )
    expect(moved).toEqual(['not-started'])
  })
})

describe('the rule is total', () => {
  test('every status has a decision and none of them throws', () => {
    const kinds: LandingDecision['kind'][] = []
    for (const status of ALL) {
      for (const deferred of [true, false]) {
        kinds.push(landingDecision(status, deferred).kind)
      }
    }
    expect(kinds).toHaveLength(8)
    expect(kinds.every((k) => k === 'through' || k === 'redirect' || k === 'first-run')).toBe(true)
  })

  test('exactly one of the eight combinations redirects', () => {
    // Pinned as a NUMBER so widening the rule cannot happen quietly: adding a
    // status that redirects, or dropping the defer check, moves this.
    const redirects = ALL.flatMap((status) =>
      [true, false].map((deferred) => landingDecision(status, deferred)),
    ).filter((decision) => decision.kind === 'redirect')

    expect(redirects).toEqual([{ kind: 'redirect', to: '/onboarding' }])
  })

  test('the only redirect target is outside the (app) group, so nothing can loop', () => {
    const targets = ALL.flatMap((status) =>
      [true, false].map((deferred) => landingDecision(status, deferred)),
    )
      .filter((d): d is { kind: 'redirect'; to: '/onboarding' } => d.kind === 'redirect')
      .map((d) => d.to)

    // /onboarding lives in the (onboarding) route group. A target inside (app)
    // would re-enter the layout that just decided to redirect.
    expect(new Set(targets)).toEqual(new Set(['/onboarding']))
  })
})
