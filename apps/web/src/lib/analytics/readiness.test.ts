import { describe, expect, test } from 'vitest'

import { analyticsReadiness } from './readiness'
import type { AccountAnalytics } from './account-insights'

/**
 * These assert the CLAIM and the FORBIDDEN claim, never the wording — the
 * discipline `lib/inbox/emptiness.ts` set and CLAUDE.md makes standing. Every
 * sentence in `readiness.ts` can be rewritten and these stay green; what cannot
 * change is which situation gets a remedy, which gets none, and which gets told
 * that something failed.
 */

const READY_EMPTY: AccountAnalytics = {
  kind: 'ready',
  followers: [],
  gained: [],
  lost: [],
  insights: [],
  followerLagHours: 24,
  insightsLagHours: 48,
  nothingReported: true,
}

const READY_WITH_NUMBERS: AccountAnalytics = {
  ...READY_EMPTY,
  insights: [{ label: 'Reach', value: 12 }],
  nothingReported: false,
}

describe('a page with a number on it stops explaining itself', () => {
  test('one measured row is enough', () => {
    const r = analyticsReadiness({
      account: { kind: 'not-connected' },
      hasPublished: true,
      measuredRows: 1,
    })
    expect(r.kind).toBe('measuring')
  })

  test('so is one account insight, with nothing published', () => {
    const r = analyticsReadiness({
      account: READY_WITH_NUMBERS,
      hasPublished: false,
      measuredRows: 0,
    })
    expect(r.kind).toBe('measuring')
  })
})

describe('a remedy is offered only where one can work', () => {
  test('a missing publishing key gets NO remedy — connecting cannot add one', () => {
    const r = analyticsReadiness({
      account: { kind: 'not-configured' },
      hasPublished: true,
      measuredRows: 0,
    })
    expect(r.kind).toBe('blocked')
    if (r.kind !== 'blocked') return
    expect(r.remedy).toBeNull()
    expect(r.second).toBeNull()
    // And it must not claim the customer's accounts are the problem.
    expect(`${r.headline} ${r.detail}`).not.toMatch(/connect/i)
  })

  test('a failed read offers a refresh in words, and no button that reloads nothing', () => {
    const r = analyticsReadiness({
      account: { kind: 'unreadable' },
      hasPublished: true,
      measuredRows: 0,
    })
    expect(r.kind).toBe('blocked')
    if (r.kind !== 'blocked') return
    expect(r.remedy).toBeNull()
    expect(r.detail).toMatch(/refresh/i)
  })

  test('nothing connected leads with connecting, and names writing as the second door', () => {
    const r = analyticsReadiness({
      account: { kind: 'not-connected' },
      hasPublished: false,
      measuredRows: 0,
    })
    expect(r.kind).toBe('blocked')
    if (r.kind !== 'blocked') return
    expect(r.remedy?.href).toBe('/connections')
    expect(r.second?.href).toBe('/posts/new')
  })

  /**
   * A post that already went out does not need writing again, so the second
   * door closes. Offering it would be busywork dressed as a next step.
   */
  test('once something has published, connecting is the ONLY door left', () => {
    const r = analyticsReadiness({
      account: { kind: 'not-connected' },
      hasPublished: true,
      measuredRows: 0,
    })
    expect(r.kind).toBe('blocked')
    if (r.kind !== 'blocked') return
    expect(r.remedy?.href).toBe('/connections')
    expect(r.second).toBeNull()
  })

  test('an expired connection says reconnect, never connect', () => {
    const r = analyticsReadiness({
      account: { kind: 'reconnect' },
      hasPublished: true,
      measuredRows: 0,
    })
    expect(r.kind).toBe('blocked')
    if (r.kind !== 'blocked') return
    expect(r.remedy?.label).toMatch(/reconnect/i)
  })
})

describe('waiting is not a failure and is not offered a fix', () => {
  test('connected and published, nothing back yet', () => {
    const r = analyticsReadiness({
      account: READY_EMPTY,
      hasPublished: true,
      measuredRows: 0,
    })
    expect(r.kind).toBe('waiting')
    if (r.kind !== 'waiting') return
    // The forbidden claims: nothing failed, and nothing is zero.
    expect(`${r.headline} ${r.detail}`).not.toMatch(/could ?n[o']?t|failed|error|try again/i)
    expect(`${r.headline} ${r.detail}`).not.toMatch(/\b0\b|\bzero\b/i)
  })

  test('connected but nothing published is a BLOCKED state with a door, not a wait', () => {
    const r = analyticsReadiness({
      account: READY_EMPTY,
      hasPublished: false,
      measuredRows: 0,
    })
    expect(r.kind).toBe('blocked')
    if (r.kind !== 'blocked') return
    expect(r.remedy?.href).toBe('/posts/new')
  })
})

describe('no state ever claims a failure that did not happen', () => {
  const NEVER_FAILED: AccountAnalytics[] = [
    { kind: 'not-connected' },
    { kind: 'reconnect' },
    READY_EMPTY,
  ]

  test.each(NEVER_FAILED.map((a) => [a.kind, a] as const))(
    '%s does not borrow the failure vocabulary',
    (_kind, account) => {
      for (const hasPublished of [true, false]) {
        const r = analyticsReadiness({ account, hasPublished, measuredRows: 0 })
        if (r.kind === 'measuring') continue
        // The detector `e2e/no-impossible-remedy.spec.ts` uses, applied at the
        // source: "reload" / "try again" / "couldn't read" can only be true of a
        // transient failure, and none of these three is one.
        expect(`${r.headline} ${r.detail}`).not.toMatch(
          /\breload\b|\btry again\b|could ?n[o']?t (read|check|load|reach)/i,
        )
      }
    },
  )
})
