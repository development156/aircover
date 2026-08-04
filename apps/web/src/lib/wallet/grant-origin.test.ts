import { describe, expect, test } from 'vitest'
import { PlanIdSchema, type LedgerEntry } from '@sahoda/shared'

import { grantOrigin } from './grant-origin'

/**
 * Where a GRANT came from — and, more to the point, what we can PROVE about it.
 *
 * The wallet used to answer this from `action_type` alone: `signup_grant` meant
 * welcome credits and everything else meant "Plan credits · Included with your
 * plan." Both halves were wrong on real data.
 *
 * `credit_ledger` seq 5374 in the dev workspace is an engineer's manual top-up,
 * written during a verification run with `action_type: 'signup_grant'` and
 * `idempotency_key: 'manual-verify-topup:…'`. The wallet told the account owner
 * those credits were "Included free when you signed up." Nobody signed up for
 * them. And the fallback claimed a plan for every other GRANT — including any
 * written by hand, by an admin, or by a correction.
 *
 * `action_type` is free text with no CHECK behind it, so it cannot carry this
 * weight. The idempotency key can: `bootstrap_workspace` and `applyPlanGrant`
 * each construct one to a fixed shape (`signupGrantKey` / `monthlyGrantKey` in
 * @sahoda/shared), and the key is UNIQUE, so nothing can forge one by accident.
 *
 * The rule: claim the plan only with proof, and degrade to a weaker true
 * statement otherwise — never the other way round.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'

function grant(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: WORKSPACE,
    seq: 42,
    entry_type: 'GRANT',
    amount: 100,
    balance_after: 100,
    action_type: null,
    object_ref: null,
    model_tier: null,
    cogs_usd_est: null,
    idempotency_key: `grant:signup:${WORKSPACE}`,
    settles_entry_id: null,
    hold_expires_at: null,
    actor: 'user_2abcDEF',
    meta: null,
    created_at: '2026-07-19T10:00:00.000Z',
    ...overrides,
  }
}

describe('the signup grant', () => {
  test('is proven by the key bootstrap_workspace writes', () => {
    expect(grantOrigin(grant())).toBe('signup')
  })

  test('is not claimed on action_type alone', () => {
    // Exactly seq 5374: an engineer's manual top-up wearing `signup_grant`.
    // Telling that account owner the credits came free with their signup is a
    // fabricated origin for real money.
    const real = grant({
      action_type: 'signup_grant',
      idempotency_key: 'manual-verify-topup:c12b271a:20260724-1',
      actor: 'claude-verification',
    })

    expect(grantOrigin(real)).toBe('manual')
  })

  test('is not claimed when the key belongs to another workspace', () => {
    // The key is unique ledger-wide, so a foreign workspace id in it means the
    // row is not this workspace's signup grant whatever else it looks like.
    const foreign = grant({ idempotency_key: 'grant:signup:99999999-9999-4999-8999-999999999999' })

    expect(grantOrigin(foreign)).not.toBe('signup')
  })
})

describe('a plan grant', () => {
  test.each(PlanIdSchema.options)('is proven for the %s plan by key and provider actor', (plan) => {
    // Both are written by applyPlanGrant in one call, so they always co-occur.
    const entry = grant({
      idempotency_key: `grant:${plan}:2026-07:${WORKSPACE}`,
      actor: 'provider:cashfree',
    })

    expect(grantOrigin(entry)).toBe('plan')
  })

  test.each([
    ['an unknown plan id', `grant:enterprise:2026-07:${WORKSPACE}`],
    ['no billing period', `grant:starter:${WORKSPACE}`],
    ['a malformed period', `grant:starter:July-2026:${WORKSPACE}`],
    ['a foreign workspace', 'grant:starter:2026-07:99999999-9999-4999-8999-999999999999'],
    ['a key that merely starts the same way', `grant:starter:2026-07:${WORKSPACE}:extra`],
  ])('is not claimed for a key with %s', (_label, key) => {
    expect(grantOrigin(grant({ idempotency_key: key, actor: 'provider:cashfree' }))).not.toBe(
      'plan',
    )
  })

  test('is not claimed without the provider actor that writes it', () => {
    // Anything hand-writing a plan-shaped key is not the billing webhook. The
    // safe direction is to lose the plan claim, not to grant it on half a match.
    const entry = grant({
      idempotency_key: `grant:starter:2026-07:${WORKSPACE}`,
      actor: 'claude-verification',
    })

    expect(grantOrigin(entry)).not.toBe('plan')
  })
})

describe('a grant that is part of a correction', () => {
  test('is named as one, whatever else it looks like', () => {
    const entry = grant({
      idempotency_key: 'ledger-correction:2026-07-25:relabel-seq-5374:reissue',
      actor: 'claude-ledger-correction',
      meta: { correction: '2026-07-25-relabel-manual-grant', replaces_seq: 5374 },
    })

    expect(grantOrigin(entry)).toBe('correction')
  })

  test('outranks the plan claim even on a plan-shaped key', () => {
    // A correction re-issuing a plan grant is still a correction: it is the
    // more specific and the more useful thing to tell someone reading a row
    // that exists only because an earlier one was wrong.
    const entry = grant({
      idempotency_key: `grant:starter:2026-07:${WORKSPACE}`,
      actor: 'provider:cashfree',
      meta: { correction: 'c-1' },
    })

    expect(grantOrigin(entry)).toBe('correction')
  })
})

describe('a grant nobody can account for', () => {
  test.each([
    ['no actor at all', null],
    ['a blank actor', '   '],
  ])('with %s is unknown, never plan', (_label, actor) => {
    const entry = grant({ idempotency_key: 'imported:legacy:0001', actor })

    expect(grantOrigin(entry)).toBe('unknown')
  })

  test('with an actor is manual — someone with service-role access wrote it', () => {
    const entry = grant({ idempotency_key: 'imported:legacy:0001', actor: 'ops_jane' })

    expect(grantOrigin(entry)).toBe('manual')
  })

  test('written by an internal job is manual, not a plan grant', () => {
    const entry = grant({
      idempotency_key: 'makegood:incident-2026-07-24:ws-1',
      actor: 'job:makegood',
    })

    expect(grantOrigin(entry)).toBe('manual')
  })
})

describe('the plan claim is never the fallback', () => {
  const keys = [
    'manual-verify-topup:c12b271a:20260724-1',
    'imported:legacy:0001',
    '',
    'grant:signup:not-a-uuid',
    `grant::2026-07:${WORKSPACE}`,
    'grant:starter:2026-07:',
    'x'.repeat(300),
  ]

  test.each(keys)('key %j never yields the plan claim on its own', (key) => {
    for (const actor of [null, '   ', 'ops_jane', 'provider:cashfree', 'job:makegood']) {
      expect(grantOrigin(grant({ idempotency_key: key, actor }))).not.toBe('plan')
    }
  })
})
