import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { parseCashfreeTimestampMs, verifyCashfreeSignature } from './signature'

/**
 * THE UNIT OF `x-webhook-timestamp`.
 *
 * This file exists because the rest of the suite could not have caught this. Every other
 * fixture in the repository signs with `String(date.getTime())` — milliseconds — and the
 * implementation assumed milliseconds. Test and code encoded the SAME assumption, so they
 * agreed with each other perfectly while both being unverified against Cashfree.
 *
 * The reason it hides so well: the HMAC concatenates the timestamp as a string, so the
 * signature verifies identically whichever unit it is. Only the freshness window reads it as
 * a number. If Cashfree sends seconds (as Stripe and Razorpay both do) and we read them as
 * milliseconds, every genuine delivery lands ~55 years in the past, blows the ±5 minute
 * window, and is rejected as a stale replay — payments taken, credits never granted, and the
 * whole test suite still green.
 *
 * The fix is to accept both, which is safe under either hypothesis. These tests pin that.
 */

const SECRET = 'cf-test-secret'
const NOW = new Date('2026-08-08T12:00:00.000Z')

const MS = String(NOW.getTime()) // 1786579200000
const SECONDS = String(Math.floor(NOW.getTime() / 1000)) // 1786579200

/** The header is signed VERBATIM — whatever string arrived, not a normalized number. */
const sign = (raw: string, ts: string, secret = SECRET): string =>
  createHmac('sha256', secret)
    .update(ts + raw)
    .digest('base64')

const BODY = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK' })

describe('parseCashfreeTimestampMs', () => {
  it('reads an epoch-milliseconds header as-is', () => {
    expect(parseCashfreeTimestampMs(MS)).toBe(NOW.getTime())
  })

  it('scales an epoch-seconds header up to milliseconds', () => {
    expect(parseCashfreeTimestampMs(SECONDS)).toBe(NOW.getTime())
  })

  /**
   * The two ranges are twelve orders of magnitude apart, so the split point is not a value
   * any real timestamp sits near — there is no ambiguous input an attacker could use to
   * widen the replay window.
   */
  it('splits at 1e12 — seconds do not reach it until the year 33658', () => {
    expect(parseCashfreeTimestampMs('999999999999')).toBe(999999999999 * 1000)
    expect(parseCashfreeTimestampMs('1000000000000')).toBe(1000000000000)
  })

  it('rejects a missing or non-numeric header rather than defaulting it', () => {
    expect(parseCashfreeTimestampMs(undefined)).toBeNull()
    expect(parseCashfreeTimestampMs('')).toBeNull()
    expect(parseCashfreeTimestampMs('not-a-number')).toBeNull()
    expect(parseCashfreeTimestampMs('NaN')).toBeNull()
  })
})

describe('verifyCashfreeSignature — accepts either unit on the wire', () => {
  it('verifies a delivery timestamped in MILLISECONDS', () => {
    expect(
      verifyCashfreeSignature({
        rawBody: BODY,
        signature: sign(BODY, MS),
        timestamp: MS,
        secretKey: SECRET,
        now: NOW,
      }),
    ).toBe(true)
  })

  /** The case that had no coverage anywhere in the repo, and the one that would 401 in prod. */
  it('verifies a delivery timestamped in SECONDS', () => {
    expect(
      verifyCashfreeSignature({
        rawBody: BODY,
        signature: sign(BODY, SECONDS),
        timestamp: SECONDS,
        secretKey: SECRET,
        now: NOW,
      }),
    ).toBe(true)
  })

  it('still rejects a STALE seconds timestamp — the window is not weakened by accepting both', () => {
    const stale = String(Math.floor(NOW.getTime() / 1000) - 6 * 60)
    expect(
      verifyCashfreeSignature({
        rawBody: BODY,
        signature: sign(BODY, stale),
        timestamp: stale,
        secretKey: SECRET,
        now: NOW,
      }),
    ).toBe(false)
  })

  it('still rejects a FUTURE seconds timestamp beyond the tolerance', () => {
    const ahead = String(Math.floor(NOW.getTime() / 1000) + 6 * 60)
    expect(
      verifyCashfreeSignature({
        rawBody: BODY,
        signature: sign(BODY, ahead),
        timestamp: ahead,
        secretKey: SECRET,
        now: NOW,
      }),
    ).toBe(false)
  })

  /**
   * The HMAC must keep using the header EXACTLY as received. If normalization leaked into
   * the signed string, a seconds-stamped delivery would be hashed over the milliseconds
   * spelling and fail — which is the very bug this change exists to prevent, reintroduced
   * one layer down.
   */
  it('signs the header verbatim, not the normalized value', () => {
    expect(
      verifyCashfreeSignature({
        rawBody: BODY,
        // Signed as milliseconds, but DELIVERED as seconds: the strings differ, so this
        // must not verify.
        signature: sign(BODY, MS),
        timestamp: SECONDS,
        secretKey: SECRET,
        now: NOW,
      }),
    ).toBe(false)
  })
})
