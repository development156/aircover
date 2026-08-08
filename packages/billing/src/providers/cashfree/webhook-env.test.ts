import { describe, it, expect } from 'vitest'
import { loadCashfreeWebhookEnv, resolveCashfreeWebhookSecret } from './webhook-env'

/**
 * These tests pin a decision that reads like a bug and is not one.
 *
 * The task this module was written for asserted that Cashfree issues a webhook secret
 * separately from the API secret key, and that the two being byte-identical means nobody
 * set it. Cashfree's own signature-verification documentation says the opposite: the HMAC
 * key IS the merchant PG secret key. So "identical" is the correct configuration, and a
 * guard rejecting it would 503 every real payment confirmation.
 *
 * The first test below exists to stop that guard from being added back by someone who
 * reaches the same wrong conclusion from the variable names alone.
 */
describe('resolveCashfreeWebhookSecret', () => {
  it('falls back to CASHFREE_SECRET_KEY — which is the documented signing key', () => {
    expect(resolveCashfreeWebhookSecret({ CASHFREE_SECRET_KEY: 'cfsk_live_abc' })).toBe(
      'cfsk_live_abc',
    )
  })

  it('accepts a webhook secret identical to the API secret key rather than treating it as unset', () => {
    const same = 'cfsk_test_same_value'
    expect(
      resolveCashfreeWebhookSecret({ CASHFREE_WEBHOOK_SECRET: same, CASHFREE_SECRET_KEY: same }),
    ).toBe(same)
  })

  it('prefers an explicit override, for an account that does issue a per-endpoint secret', () => {
    expect(
      resolveCashfreeWebhookSecret({
        CASHFREE_WEBHOOK_SECRET: 'per-endpoint',
        CASHFREE_SECRET_KEY: 'api-key',
      }),
    ).toBe('per-endpoint')
  })

  it('treats an empty override as absent rather than as a secret of ""', () => {
    expect(
      resolveCashfreeWebhookSecret({ CASHFREE_WEBHOOK_SECRET: '', CASHFREE_SECRET_KEY: 'api-key' }),
    ).toBe('api-key')
  })

  it('returns the empty string when neither is set, so the caller must fail closed', () => {
    expect(resolveCashfreeWebhookSecret({})).toBe('')
  })
})

describe('loadCashfreeWebhookEnv', () => {
  it('derives the mode from CASHFREE_ENV instead of inheriting the parser default', () => {
    expect(loadCashfreeWebhookEnv({ CASHFREE_SECRET_KEY: 'k', CASHFREE_ENV: 'live' })).toEqual({
      secretKey: 'k',
      mode: 'live',
    })
    expect(loadCashfreeWebhookEnv({ CASHFREE_SECRET_KEY: 'k', CASHFREE_ENV: 'sandbox' })).toEqual({
      secretKey: 'k',
      mode: 'sandbox',
    })
  })

  it('is unconfigured when no secret is available', () => {
    expect(loadCashfreeWebhookEnv({ CASHFREE_ENV: 'sandbox' })).toBeNull()
  })

  /**
   * The label rides onto every ledger entry's meta. Defaulting it either way is a lie about
   * money — 'sandbox' on a real charge, or 'live' on a simulated one — so an unset or
   * misspelled value configures nothing at all.
   */
  it('is unconfigured when CASHFREE_ENV is missing or not exactly sandbox/live', () => {
    expect(loadCashfreeWebhookEnv({ CASHFREE_SECRET_KEY: 'k' })).toBeNull()
    expect(
      loadCashfreeWebhookEnv({ CASHFREE_SECRET_KEY: 'k', CASHFREE_ENV: 'production' }),
    ).toBeNull()
    expect(loadCashfreeWebhookEnv({ CASHFREE_SECRET_KEY: 'k', CASHFREE_ENV: 'Live' })).toBeNull()
    expect(
      loadCashfreeWebhookEnv({ CASHFREE_SECRET_KEY: 'k', CASHFREE_ENV: ' sandbox' }),
    ).toBeNull()
  })

  /**
   * The receiver makes no outbound call, so it must not inherit the provider's outbound
   * credential requirement: a missing CASHFREE_APP_ID would otherwise take down inbound
   * confirmation of money that has already left a customer's account.
   */
  it('does not require CASHFREE_APP_ID', () => {
    expect(
      loadCashfreeWebhookEnv({ CASHFREE_SECRET_KEY: 'k', CASHFREE_ENV: 'sandbox' }),
    ).not.toBeNull()
  })
})
