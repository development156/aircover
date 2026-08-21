import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'

import {
  ZERNIO_SIGNATURE_HEADER,
  ZERNIO_SIGNATURE_HEADER_LEGACY,
  signZernioBody,
  verifyZernioWebhook,
} from './webhook-signature'

const SECRET = 'whsec_a_test_secret_that_is_not_in_production'

/** A real delivery body, shaped like WebhookPayloadPost. */
const BODY = JSON.stringify({
  id: '0f5d1a2e-9c4b-4a71-8f3d-2b6e5c8a1d09',
  event: 'post.published',
  timestamp: '2026-08-21T10:30:00.000Z',
  post: {
    id: '66b1f2c3d4e5f60718293a4b',
    content: 'hello',
    status: 'published',
    scheduledFor: '2026-08-21T10:29:00.000Z',
    platforms: [{ platform: 'instagram', status: 'published', accountId: 'acc_one' }],
  },
})

const headers = (h: Record<string, string>) => new Headers(h)

describe('verifyZernioWebhook', () => {
  it('accepts a signature computed the way Zernio documents it', () => {
    // Computed here from the primitive rather than by calling signZernioBody, so
    // this test would still fail if signZernioBody itself were changed to, say,
    // sign a timestamp-prefixed string. Asserting against the helper that produces
    // the value would only prove the helper agrees with itself.
    const signature = createHmac('sha256', SECRET).update(BODY, 'utf8').digest('hex')

    const result = verifyZernioWebhook({
      headers: headers({ [ZERNIO_SIGNATURE_HEADER]: signature }),
      rawBody: BODY,
      secret: SECRET,
    })

    expect(result.ok).toBe(true)
  })

  it('produces lowercase hex with no prefix, exactly as the guide specifies', () => {
    const signature = signZernioBody(BODY, SECRET)
    // "the lowercase hex HMAC-SHA256 of the raw request body" — 64 hex chars,
    // no `sha256=`, no `v1=`. Pinned because a prefix is the single most common
    // difference between providers and would silently reject every delivery.
    expect(signature).toMatch(/^[0-9a-f]{64}$/)
  })

  // ── THE FORGERY CASES ──────────────────────────────────────────────────────

  it('REJECTS a forged signature', () => {
    // A plausible-looking forgery: right length, right alphabet, wrong bytes.
    const forged = 'f'.repeat(64)

    const result = verifyZernioWebhook({
      headers: headers({ [ZERNIO_SIGNATURE_HEADER]: forged }),
      rawBody: BODY,
      secret: SECRET,
    })

    expect(result).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('REJECTS a signature made with the wrong secret', () => {
    // The realistic attack: someone who knows the algorithm and the body but not
    // the key. If this passed, the HMAC would not be keyed at all.
    const result = verifyZernioWebhook({
      headers: headers({ [ZERNIO_SIGNATURE_HEADER]: signZernioBody(BODY, 'the-wrong-secret') }),
      rawBody: BODY,
      secret: SECRET,
    })

    expect(result).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('REJECTS a valid signature over a body that was then altered by one byte', () => {
    // THIS is the test that proves the HMAC covers the BODY rather than proving a
    // header was present and well-formed. Sign the real body, deliver a tampered
    // one. A verifier that checked only the header's shape, or that hashed
    // something other than the body, would pass every test above and fail here.
    const signature = signZernioBody(BODY, SECRET)
    const tampered = BODY.replace('"status":"published"', '"status":"failed"')
    expect(tampered).not.toBe(BODY)

    const result = verifyZernioWebhook({
      headers: headers({ [ZERNIO_SIGNATURE_HEADER]: signature }),
      rawBody: tampered,
      secret: SECRET,
    })

    expect(result).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('REJECTS a re-serialised body even when the JSON is equivalent', () => {
    // The mistake this guards: `JSON.stringify(await req.json())`. The object is
    // the same, the bytes are not, and the HMAC is over bytes. If a future refactor
    // moves the receiver to parse-then-verify, this is what fails.
    //
    // The body here is a LITERAL with wire formatting — indentation and a key order
    // that is not JSON.stringify's — because BODY above is itself stringify output,
    // so re-serialising THAT is byte-identical and would prove nothing. The first
    // version of this test did exactly that and passed vacuously; the assertion
    // below is what caught it.
    const wire = '{\n  "event": "post.published",\n  "id": "evt_1",\n  "timestamp": "2026-08-21T10:30:00.000Z"\n}'
    const signature = signZernioBody(wire, SECRET)
    const reserialised = JSON.stringify(JSON.parse(wire))

    // Guard the guard: if these were ever byte-identical the test would prove
    // nothing, so assert they differ before relying on the difference.
    expect(reserialised).not.toBe(wire)
    expect(JSON.parse(reserialised)).toEqual(JSON.parse(wire))

    expect(
      verifyZernioWebhook({
        headers: headers({ [ZERNIO_SIGNATURE_HEADER]: signature }),
        rawBody: reserialised,
        secret: SECRET,
      }),
    ).toEqual({ ok: false, reason: 'bad_signature' })
  })

  // ── FAIL CLOSED ────────────────────────────────────────────────────────────

  it('REJECTS a delivery with no signature header at all', () => {
    // Zernio omits the header entirely when the subscription has no secret. That
    // is a fact about the subscription, not permission to skip the check — this
    // endpoint is public, so "unsigned" must mean "rejected".
    expect(
      verifyZernioWebhook({ headers: headers({}), rawBody: BODY, secret: SECRET }),
    ).toEqual({ ok: false, reason: 'no_signature' })
  })

  it('REJECTS an empty signature header', () => {
    expect(
      verifyZernioWebhook({
        headers: headers({ [ZERNIO_SIGNATURE_HEADER]: '   ' }),
        rawBody: BODY,
        secret: SECRET,
      }),
    ).toEqual({ ok: false, reason: 'no_signature' })
  })

  it('does not throw on a short signature — it rejects it', () => {
    // node's timingSafeEqual THROWS on a length mismatch. Unguarded, a one-character
    // signature would become a 500 on a public endpoint: wrong blame, and an oracle
    // for the correct length. Assert it returns rather than throws.
    expect(() =>
      verifyZernioWebhook({
        headers: headers({ [ZERNIO_SIGNATURE_HEADER]: 'a' }),
        rawBody: BODY,
        secret: SECRET,
      }),
    ).not.toThrow()

    expect(
      verifyZernioWebhook({
        headers: headers({ [ZERNIO_SIGNATURE_HEADER]: 'a' }),
        rawBody: BODY,
        secret: SECRET,
      }),
    ).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('does not throw on a signature far longer than a real one', () => {
    expect(
      verifyZernioWebhook({
        headers: headers({ [ZERNIO_SIGNATURE_HEADER]: 'a'.repeat(4096) }),
        rawBody: BODY,
        secret: SECRET,
      }),
    ).toEqual({ ok: false, reason: 'bad_signature' })
  })

  // ── THE LEGACY ALIAS ───────────────────────────────────────────────────────

  it('accepts the legacy X-Late-Signature header when the current one is absent', () => {
    expect(
      verifyZernioWebhook({
        headers: headers({ [ZERNIO_SIGNATURE_HEADER_LEGACY]: signZernioBody(BODY, SECRET) }),
        rawBody: BODY,
        secret: SECRET,
      }).ok,
    ).toBe(true)
  })

  it('prefers the current header when both are present and they disagree', () => {
    // If both arrive and only the legacy one validates, honouring it would let a
    // holder of a rotated-out secret keep delivering. The current header wins and
    // its failure is final.
    const result = verifyZernioWebhook({
      headers: headers({
        [ZERNIO_SIGNATURE_HEADER]: 'f'.repeat(64),
        [ZERNIO_SIGNATURE_HEADER_LEGACY]: signZernioBody(BODY, SECRET),
      }),
      rawBody: BODY,
      secret: SECRET,
    })

    expect(result).toEqual({ ok: false, reason: 'bad_signature' })
  })
})
