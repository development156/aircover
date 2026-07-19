import { describe, expect, test } from 'vitest'

import { parseEnv } from './env-schema'

const VALID = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_abc',
  CLERK_SECRET_KEY: 'sk_test_secret-value',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_abc',
}

describe('parseEnv', () => {
  test('returns parsed env when all required vars are present', () => {
    // Arrange + Act
    const env = parseEnv(VALID)

    // Assert
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://example.supabase.co')
    expect(env.CLERK_SECRET_KEY).toBe('sk_test_secret-value')
  })

  test('throws one error naming ALL missing vars', () => {
    // Arrange
    const partial = { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' }

    // Act + Assert
    expect(() => parseEnv(partial)).toThrowError(
      /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.*CLERK_SECRET_KEY.*NEXT_PUBLIC_SUPABASE_ANON_KEY/s,
    )
  })

  test('rejects an invalid supabase url', () => {
    expect(() => parseEnv({ ...VALID, NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' })).toThrowError(
      /NEXT_PUBLIC_SUPABASE_URL/,
    )
  })

  test('normalizes the supabase url to its origin (supabase-js appends /rest/v1 itself)', () => {
    // A pasted dashboard REST URL with the /rest/v1 path would otherwise double up
    // to /rest/v1//rest/v1/<table> → PGRST125 "Invalid path specified in request URL".
    expect(
      parseEnv({ ...VALID, NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co/rest/v1/' })
        .NEXT_PUBLIC_SUPABASE_URL,
    ).toBe('https://abc.supabase.co')
    expect(
      parseEnv({ ...VALID, NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co/' })
        .NEXT_PUBLIC_SUPABASE_URL,
    ).toBe('https://abc.supabase.co')
    // a clean origin is left untouched (no trailing slash)
    expect(
      parseEnv({ ...VALID, NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co' })
        .NEXT_PUBLIC_SUPABASE_URL,
    ).toBe('https://abc.supabase.co')
  })

  test('never echoes secret values in the error message', () => {
    // Arrange: valid secret present but another var missing → error mentions
    // names only, not values.
    const { NEXT_PUBLIC_SUPABASE_ANON_KEY: _omit, ...partial } = VALID

    // Act
    let message = ''
    try {
      parseEnv(partial)
    } catch (e) {
      message = e instanceof Error ? e.message : String(e)
    }

    // Assert
    expect(message).not.toContain('sk_test_secret-value')
    expect(message).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  })

  test('treats empty strings as missing', () => {
    expect(() => parseEnv({ ...VALID, CLERK_SECRET_KEY: '' })).toThrowError(/CLERK_SECRET_KEY/)
  })
})
