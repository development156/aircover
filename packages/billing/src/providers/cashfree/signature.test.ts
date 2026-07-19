import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyCashfreeSignature } from './signature'

const SECRET = 'test_secret_key'
const BODY = '{"data":{"order":{"order_id":"o1"}},"type":"PAYMENT_SUCCESS_WEBHOOK"}'
const TS = '1617695238078'

/**
 * An INDEPENDENT implementation of the documented algorithm, written straight from the spec:
 *
 *   signedPayload   := $timestamp.$payload      (PHP concatenation — no literal dot)
 *   expectedSignature := Base64Encode(HMACSHA256($signedPayload, $merchantSecretKey))
 *
 * Computing it here rather than pasting a constant means these tests fail if the adapter
 * drifts to a different scheme (e.g. the dead pre-2022 ksort form, or hex instead of base64).
 */
const sign = (body: string, ts: string, secret = SECRET): string =>
  createHmac('sha256', secret)
    .update(ts + body)
    .digest('base64')

/** Fixed clock just inside the freshness window for the fixed TS above. */
const at = (ts: string, offsetMs = 0): Date => new Date(Number(ts) + offsetMs)

describe('verifyCashfreeSignature — the documented algorithm', () => {
  it('accepts a signature computed as base64(HMAC-SHA256(secret, timestamp + rawBody))', () => {
    const ok = verifyCashfreeSignature({
      rawBody: BODY,
      signature: sign(BODY, TS),
      timestamp: TS,
      secretKey: SECRET,
      now: at(TS),
    })

    expect(ok).toBe(true)
  })

  it('rejects a tampered body', () => {
    const ok = verifyCashfreeSignature({
      rawBody: BODY.replace('o1', 'o2'),
      signature: sign(BODY, TS),
      timestamp: TS,
      secretKey: SECRET,
      now: at(TS),
    })

    expect(ok).toBe(false)
  })

  it('rejects a signature bound to a different timestamp', () => {
    const ok = verifyCashfreeSignature({
      rawBody: BODY,
      signature: sign(BODY, '1617695239000'),
      timestamp: TS,
      secretKey: SECRET,
      now: at(TS),
    })

    expect(ok).toBe(false)
  })

  it('rejects a signature made with a different secret', () => {
    const ok = verifyCashfreeSignature({
      rawBody: BODY,
      signature: sign(BODY, TS, 'other_secret'),
      timestamp: TS,
      secretKey: SECRET,
      now: at(TS),
    })

    expect(ok).toBe(false)
  })

  /**
   * The concatenation order is timestamp-then-body with NO separator. Body-then-timestamp is
   * the most likely mis-implementation and must not verify.
   */
  it('rejects the reversed concatenation order', () => {
    const reversed = createHmac('sha256', SECRET)
      .update(BODY + TS)
      .digest('base64')

    expect(
      verifyCashfreeSignature({
        rawBody: BODY,
        signature: reversed,
        timestamp: TS,
        secretKey: SECRET,
        now: at(TS),
      }),
    ).toBe(false)
  })

  it('rejects a hex-encoded digest (the encoding must be base64)', () => {
    const hex = createHmac('sha256', SECRET)
      .update(TS + BODY)
      .digest('hex')

    expect(
      verifyCashfreeSignature({
        rawBody: BODY,
        signature: hex,
        timestamp: TS,
        secretKey: SECRET,
        now: at(TS),
      }),
    ).toBe(false)
  })

  it.each([
    ['an empty signature', ''],
    ['garbage', 'not-a-signature'],
    ['a truncated signature', sign(BODY, TS).slice(0, 10)],
  ])('rejects %s without throwing', (_l, signature) => {
    expect(() =>
      verifyCashfreeSignature({
        rawBody: BODY,
        signature,
        timestamp: TS,
        secretKey: SECRET,
        now: at(TS),
      }),
    ).not.toThrow()

    expect(
      verifyCashfreeSignature({
        rawBody: BODY,
        signature,
        timestamp: TS,
        secretKey: SECRET,
        now: at(TS),
      }),
    ).toBe(false)
  })

  it('is sensitive to raw-body byte differences that JSON round-tripping would erase', () => {
    // A re-stringified parse normalizes 1.80 -> 1.8 and can reorder keys. The signature is
    // over the ORIGINAL bytes, so the normalized form must not verify.
    const original = '{"amount":1.80,"b":1}'
    const roundTripped = JSON.stringify(JSON.parse(original))
    expect(roundTripped).not.toBe(original)

    const signature = sign(original, TS)

    expect(
      verifyCashfreeSignature({
        rawBody: roundTripped,
        signature,
        timestamp: TS,
        secretKey: SECRET,
        now: at(TS),
      }),
    ).toBe(false)
  })
})

/**
 * Cashfree performs no replay protection of its own and a captured signature stays valid
 * forever. Without a freshness window, one intercepted webhook could be replayed at any point
 * to re-drive the pipeline.
 */
describe('verifyCashfreeSignature — timestamp freshness', () => {
  const valid = (offsetMs: number, toleranceMs?: number): boolean =>
    verifyCashfreeSignature({
      rawBody: BODY,
      signature: sign(BODY, TS),
      timestamp: TS,
      secretKey: SECRET,
      now: at(TS, offsetMs),
      toleranceMs,
    })

  it('accepts a timestamp inside the default window', () => {
    expect(valid(60_000)).toBe(true)
  })

  it('rejects a timestamp older than the default window', () => {
    expect(valid(6 * 60_000)).toBe(false)
  })

  it('accepts a signature that is merely a little in the future (clock skew)', () => {
    expect(valid(-60_000)).toBe(true)
  })

  it('rejects a timestamp far in the future', () => {
    expect(valid(-6 * 60_000)).toBe(false)
  })

  it('honours a custom tolerance', () => {
    expect(valid(10 * 60_000, 15 * 60_000)).toBe(true)
    expect(valid(10 * 60_000, 60_000)).toBe(false)
  })

  it('rejects a non-numeric timestamp', () => {
    expect(
      verifyCashfreeSignature({
        rawBody: BODY,
        signature: sign(BODY, 'abc'),
        timestamp: 'abc',
        secretKey: SECRET,
        now: at(TS),
      }),
    ).toBe(false)
  })

  it('rejects a missing timestamp rather than signing the body alone', () => {
    expect(
      verifyCashfreeSignature({
        rawBody: BODY,
        signature: sign(BODY, ''),
        timestamp: undefined,
        secretKey: SECRET,
        now: at(TS),
      }),
    ).toBe(false)
  })
})
