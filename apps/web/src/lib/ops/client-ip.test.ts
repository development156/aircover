import { describe, it, expect } from 'vitest'

import { clientIpFrom } from './turnstile'

/**
 * THE RATE-LIMIT KEY MUST NOT BE A VALUE THE CALLER CHOOSES.
 *
 * `x-forwarded-for` is a list each proxy APPENDS to, so its leftmost entry is
 * whatever the original client wrote. Keyed on that, a script sending a fresh
 * random value per request gets a fresh bucket per request and the counter never
 * reaches the limit.
 */
const h = (init: Record<string, string>): Headers => new Headers(init)

describe('clientIpFrom', () => {
  it('takes the hop our own proxy appended, not the one the client claimed', () => {
    expect(clientIpFrom(h({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }))).toBe('203.0.113.9')
  })

  it('a spoofed value cannot produce a new key on every request', () => {
    const keys = new Set(
      ['a', 'b', 'c', 'd'].map((n) =>
        clientIpFrom(h({ 'x-forwarded-for': `10.0.0.${n.charCodeAt(0)}, 203.0.113.9` })),
      ),
    )
    // Four different spoofed prefixes, one bucket.
    expect([...keys]).toEqual(['203.0.113.9'])
  })

  it('is unchanged when the platform overwrites rather than appends', () => {
    // Vercel may set a single value. Rightmost and leftmost are then the same,
    // which is why this direction is safe without knowing which it does.
    expect(clientIpFrom(h({ 'x-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9')
  })

  it('prefers the header only our own platform can set', () => {
    expect(
      clientIpFrom(h({ 'x-vercel-forwarded-for': '203.0.113.9', 'x-forwarded-for': '1.2.3.4' })),
    ).toBe('203.0.113.9')
  })

  it('a client sending x-forwarded-for cannot suppress x-real-ip into a null key', () => {
    // The old shape consulted x-real-ip ONLY when x-forwarded-for was absent, so
    // sending a blank forwarded header hid the trustworthy one.
    expect(clientIpFrom(h({ 'x-forwarded-for': '  ,  ', 'x-real-ip': '203.0.113.9' }))).toBe(
      '203.0.113.9',
    )
  })

  it('is null when nothing identifies the caller', () => {
    expect(clientIpFrom(h({}))).toBeNull()
  })
})
