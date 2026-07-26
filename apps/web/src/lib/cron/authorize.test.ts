import { describe, it, expect } from 'vitest'
import { isAuthorizedCronRequest } from './authorize'

const SECRET = 'a-very-long-random-cron-secret-value'

describe('isAuthorizedCronRequest', () => {
  it('accepts the configured secret presented as a bearer token', () => {
    expect(isAuthorizedCronRequest({ header: `Bearer ${SECRET}`, secret: SECRET })).toBe(true)
  })

  it('refuses everything when the secret is not configured', () => {
    // Fail CLOSED. An unset secret means the endpoint is not ready to be trusted; treating
    // it as "no auth required" would leave a public, unauthenticated mutation endpoint
    // live from the moment the route deploys until someone remembers the env var.
    expect(isAuthorizedCronRequest({ header: 'Bearer anything', secret: undefined })).toBe(false)
    expect(isAuthorizedCronRequest({ header: 'Bearer ', secret: undefined })).toBe(false)
  })

  it('refuses an empty secret, which is how an unset dashboard value usually arrives', () => {
    expect(isAuthorizedCronRequest({ header: 'Bearer ', secret: '' })).toBe(false)
    expect(isAuthorizedCronRequest({ header: '', secret: '' })).toBe(false)
  })

  it('refuses a missing header', () => {
    expect(isAuthorizedCronRequest({ header: null, secret: SECRET })).toBe(false)
  })

  it('refuses the right secret without the Bearer scheme', () => {
    expect(isAuthorizedCronRequest({ header: SECRET, secret: SECRET })).toBe(false)
  })

  it('refuses a wrong secret of the same length', () => {
    const wrong = SECRET.slice(0, -1) + 'X'
    expect(wrong).toHaveLength(SECRET.length)
    expect(isAuthorizedCronRequest({ header: `Bearer ${wrong}`, secret: SECRET })).toBe(false)
  })

  it('refuses a prefix and a superstring rather than throwing on the length mismatch', () => {
    // node:crypto's timingSafeEqual THROWS on unequal buffer lengths. An implementation
    // that compared the raw bytes would turn "wrong length" into a 500 instead of a 401,
    // which both leaks the length and breaks the endpoint. Comparing fixed-width digests
    // avoids that; these two cases are what pin it.
    expect(
      isAuthorizedCronRequest({ header: `Bearer ${SECRET.slice(0, 5)}`, secret: SECRET }),
    ).toBe(false)
    expect(isAuthorizedCronRequest({ header: `Bearer ${SECRET}extra`, secret: SECRET })).toBe(false)
  })

  it('is not fooled by leading or trailing whitespace around the token', () => {
    expect(isAuthorizedCronRequest({ header: `Bearer  ${SECRET}`, secret: SECRET })).toBe(false)
    expect(isAuthorizedCronRequest({ header: `Bearer ${SECRET} `, secret: SECRET })).toBe(false)
  })

  it('is case sensitive in the token', () => {
    expect(
      isAuthorizedCronRequest({ header: `Bearer ${SECRET.toUpperCase()}`, secret: SECRET }),
    ).toBe(false)
  })
})
