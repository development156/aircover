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

  test('still requires all four core vars, collected into ONE error', () => {
    // Regression guard for the Sentry work below: adding OPTIONAL vars to the
    // schema must not accidentally relax the vars the app genuinely cannot boot
    // without. One throw, one message, every missing name in it.
    // Arrange
    const empty = {}

    // Act
    let message = ''
    try {
      parseEnv(empty)
    } catch (e) {
      message = e instanceof Error ? e.message : String(e)
    }

    // Assert
    expect(message).toContain('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY')
    expect(message).toContain('CLERK_SECRET_KEY')
    expect(message).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(message).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  })
})

describe('parseEnv — Sentry configuration', () => {
  // Sentry is observability, not a dependency. Commit b133a68 fixed a Vercel build
  // that died because the build box had no env at all; if a missing DSN became a
  // hard failure we would re-break exactly that. Optional means optional: no throw,
  // and — just as important — the DSN must never be named in the missing-vars
  // error, because that message is the checklist a developer works through.

  test('parses without SENTRY_DSN — apps/web must boot with no Sentry configured', () => {
    // Arrange + Act
    const env = parseEnv(VALID)

    // Assert
    expect(env.SENTRY_DSN).toBeUndefined()
  })

  test('parses without NEXT_PUBLIC_SENTRY_DSN — the client bundle builds unconfigured', () => {
    // Arrange + Act
    const env = parseEnv(VALID)

    // Assert
    expect(env.NEXT_PUBLIC_SENTRY_DSN).toBeUndefined()
  })

  test('omits both Sentry DSNs from the missing-vars error', () => {
    // A developer reads that error as "here is what you must set". Listing an
    // optional var there sends them hunting for a Sentry project they do not need.
    // Arrange
    const empty = {}

    // Act
    let message = ''
    try {
      parseEnv(empty)
    } catch (e) {
      message = e instanceof Error ? e.message : String(e)
    }

    // Assert
    expect(message).not.toContain('SENTRY_DSN')
    expect(message).not.toContain('NEXT_PUBLIC_SENTRY_DSN')
  })

  test('returns a present, valid SENTRY_DSN unchanged', () => {
    // Arrange
    const dsn = 'https://abc123def456@o0.ingest.sentry.io/1234567'

    // Act
    const env = parseEnv({ ...VALID, SENTRY_DSN: dsn })

    // Assert
    expect(env.SENTRY_DSN).toBe(dsn)
  })

  test('throws naming SENTRY_DSN when it is present but not a valid URL', () => {
    // Optional does not mean unvalidated. A typo'd DSN fails silently at runtime —
    // events vanish and nobody notices for weeks. Fail at boot instead.
    // Arrange + Act + Assert
    expect(() => parseEnv({ ...VALID, SENTRY_DSN: 'not-a-dsn' })).toThrowError(/SENTRY_DSN/)
  })

  test('never echoes the DSN value when rejecting an invalid SENTRY_DSN', () => {
    // A DSN embeds its public key. "Name names, never values" applies here exactly
    // as it does to CLERK_SECRET_KEY — error messages land in build logs.
    // Arrange
    const leakyDsn = 'o0.ingest.sentry.io/abc123def456'

    // Act
    let message = ''
    try {
      parseEnv({ ...VALID, SENTRY_DSN: leakyDsn })
    } catch (e) {
      message = e instanceof Error ? e.message : String(e)
    }

    // Assert
    expect(message).not.toContain(leakyDsn)
    expect(message).not.toContain('abc123def456')
    expect(message).toContain('SENTRY_DSN')
  })
})
