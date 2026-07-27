import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  clerkUserIdFrom,
  primaryEmailFrom,
  verifySvixSignature,
  TIMESTAMP_TOLERANCE_SECONDS,
} from './clerk-webhook'

const SECRET = `whsec_${Buffer.from('a-test-signing-key-32-bytes-long').toString('base64')}`
const NOW = 1_800_000_000_000
const TS = String(Math.floor(NOW / 1000))
const ID = 'msg_2abc'
const BODY = JSON.stringify({ type: 'user.created', data: { id: 'user_1' } })

function sign(body = BODY, id = ID, timestamp = TS, secret = SECRET): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`
}

const headers = (over: Partial<{ id: string; timestamp: string; signature: string }> = {}) => ({
  id: ID,
  timestamp: TS,
  signature: sign(),
  ...over,
})

describe('a genuine Clerk webhook is accepted', () => {
  it('accepts a correctly signed payload', () => {
    expect(
      verifySvixSignature({ secret: SECRET, headers: headers(), rawBody: BODY, now: NOW }),
    ).toEqual({ ok: true })
  })

  it('accepts when the header carries several versions, as during a rotation', () => {
    const signature = `v1,ZmFrZQ== ${sign()}`

    expect(
      verifySvixSignature({
        secret: SECRET,
        headers: headers({ signature }),
        rawBody: BODY,
        now: NOW,
      }),
    ).toEqual({ ok: true })
  })
})

describe('anything that is not a genuine webhook is refused', () => {
  it('refuses when the secret is not configured — never an open endpoint', () => {
    expect(
      verifySvixSignature({ secret: undefined, headers: headers(), rawBody: BODY, now: NOW }),
    ).toEqual({ ok: false, reason: 'not_configured' })
  })

  it('refuses a body that changed by a single character', () => {
    // The whole point: the signature covers the exact bytes. This is the assertion
    // that stops a forged payload riding a captured signature.
    const tampered = BODY.replace('user_1', 'user_2')

    expect(
      verifySvixSignature({ secret: SECRET, headers: headers(), rawBody: tampered, now: NOW }),
    ).toEqual({ ok: false, reason: 'invalid' })
  })

  it('refuses a signature made with a different secret', () => {
    const other = `whsec_${Buffer.from('a-different-key-of-the-same-size').toString('base64')}`

    expect(
      verifySvixSignature({
        secret: SECRET,
        headers: headers({ signature: sign(BODY, ID, TS, other) }),
        rawBody: BODY,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'invalid' })
  })

  it('refuses when the id or timestamp is swapped, since both are signed', () => {
    expect(
      verifySvixSignature({
        secret: SECRET,
        headers: headers({ id: 'msg_other' }),
        rawBody: BODY,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'invalid' })
  })

  it.each([
    ['id', { id: null }],
    ['timestamp', { timestamp: null }],
    ['signature', { signature: null }],
  ])('refuses when the %s header is absent', (_label, over) => {
    expect(
      verifySvixSignature({
        secret: SECRET,
        headers: { ...headers(), ...over } as never,
        rawBody: BODY,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'missing_headers' })
  })

  it('refuses a replay from outside the tolerance window', () => {
    const old = String(Math.floor(NOW / 1000) - TIMESTAMP_TOLERANCE_SECONDS - 1)

    expect(
      verifySvixSignature({
        secret: SECRET,
        headers: { id: ID, timestamp: old, signature: sign(BODY, ID, old) },
        rawBody: BODY,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'stale' })
  })

  it('refuses a FUTURE timestamp too, not just an old one', () => {
    // Only checking the past would accept a forgery dated next week.
    const future = String(Math.floor(NOW / 1000) + TIMESTAMP_TOLERANCE_SECONDS + 1)

    expect(
      verifySvixSignature({
        secret: SECRET,
        headers: { id: ID, timestamp: future, signature: sign(BODY, ID, future) },
        rawBody: BODY,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'stale' })
  })

  it('refuses a non-numeric timestamp rather than treating it as zero', () => {
    expect(
      verifySvixSignature({
        secret: SECRET,
        headers: headers({ timestamp: 'yesterday' }),
        rawBody: BODY,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'invalid' })
  })

  it('ignores a signature under an unknown version', () => {
    expect(
      verifySvixSignature({
        secret: SECRET,
        headers: headers({ signature: sign().replace('v1,', 'v9,') }),
        rawBody: BODY,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'invalid' })
  })

  it('never throws, whatever the header contains', () => {
    for (const signature of ['', 'v1,', 'garbage', 'v1,!!!not-base64!!!', 'v1,YQ==']) {
      expect(() =>
        verifySvixSignature({
          secret: SECRET,
          headers: headers({ signature }),
          rawBody: BODY,
          now: NOW,
        }),
      ).not.toThrow()
    }
  })
})

describe('reading the payload', () => {
  const payload = {
    type: 'user.created',
    data: {
      id: 'user_2abc',
      primary_email_address_id: 'idn_2',
      email_addresses: [
        { id: 'idn_1', email_address: 'old@example.com' },
        { id: 'idn_2', email_address: 'primary@example.com' },
      ],
    },
  }

  it('takes the PRIMARY address, not the first one', () => {
    // Taking the first is how an account with two addresses gets linked to the
    // wrong admin seat.
    expect(primaryEmailFrom(payload)).toBe('primary@example.com')
  })

  it('returns null rather than guessing when the primary is not present', () => {
    const orphaned = { data: { ...payload.data, primary_email_address_id: 'idn_missing' } }

    expect(primaryEmailFrom(orphaned)).toBeNull()
  })

  it.each([null, {}, { data: {} }, { data: { email_addresses: 'nope' } }])(
    'returns null for a malformed payload %#',
    (bad) => {
      expect(primaryEmailFrom(bad)).toBeNull()
      expect(clerkUserIdFrom(bad)).toBeNull()
    },
  )

  it('reads the Clerk user id', () => {
    expect(clerkUserIdFrom(payload)).toBe('user_2abc')
  })
})
