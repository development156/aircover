import { describe, expect, it } from 'vitest'

import { SECRET_ENV_VARS, secretValuesFrom } from './secret-values'

describe('secretValuesFrom', () => {
  it('collects every registered secret that has a value', () => {
    // Arrange
    const env = {
      CLERK_SECRET_KEY: 'sk_test_clerk_value',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-value',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_value',
    }

    // Act
    const values = secretValuesFrom(env)

    // Assert
    expect(values).toEqual([
      'sk_test_clerk_value',
      'service-role-value',
      'sb_publishable_value',
    ])
  })

  it('omits vars that are unset rather than emitting undefined', () => {
    // Arrange — the common shape: no service-role key on a web deploy.
    const env = { CLERK_SECRET_KEY: 'sk_test_clerk_value' }

    // Act
    const values = secretValuesFrom(env)

    // Assert
    expect(values).toEqual(['sk_test_clerk_value'])
  })

  it('drops empty and whitespace-only values so redaction cannot match everything', () => {
    // Arrange — an unset var in a .env file arrives as '', which as a search
    // term would match at every index of every message.
    const env = {
      CLERK_SECRET_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '   ',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'real-value',
    }

    // Act
    const values = secretValuesFrom(env)

    // Assert
    expect(values).toEqual(['real-value'])
  })

  it('trims surrounding whitespace left by a copy-pasted .env line', () => {
    // Arrange
    const env = { CLERK_SECRET_KEY: '  sk_test_padded_value \n' }

    // Act
    const values = secretValuesFrom(env)

    // Assert
    expect(values).toEqual(['sk_test_padded_value'])
  })

  it('returns an empty list when nothing is configured', () => {
    // Arrange
    const env = {}

    // Act
    const values = secretValuesFrom(env)

    // Assert
    expect(values).toEqual([])
  })

  it.each([
    ['TOKEN_VAULT_KEY', 'the AES key that decrypts every stored OAuth token'],
    ['SUPABASE_JWT_SECRET', 'forges a token for any user in the project'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'bypasses RLS entirely'],
    ['CLERK_SECRET_KEY', 'full read/write on every user and session'],
    ['DATABASE_URL', 'carries the database password in its userinfo'],
    ['SUPABASE_DB_URL', 'carries the database password in its userinfo'],
    ['SENTRY_AUTH_TOKEN', 'rewrites our own release artifacts'],
  ])('registers %s, because %s', (name) => {
    // A registry that names only the three secrets someone thought of first is
    // a registry that reads as thorough and covers the cheap half. Every var
    // here holds a value whose FORMAT no shape rule can predict, which is
    // exactly the condition that makes naming it the only real coverage.
    expect(SECRET_ENV_VARS).toContain(name)
  })

  it('redacts the vault key and the database url once they are registered', () => {
    // Arrange — behavioural, not just a membership check: the point of naming a
    // var is that its VALUE reaches the scrubber.
    const env = {
      TOKEN_VAULT_KEY: 'FAKEvaultKEY32byteslongAAAAAAAAA',
      DATABASE_URL: 'postgresql://postgres:FAKEdbPASSWORD@localhost:5432/postgres',
    }

    // Act
    const values = secretValuesFrom(env)

    // Assert
    expect(values).toContain('FAKEvaultKEY32byteslongAAAAAAAAA')
    expect(values).toContain('postgresql://postgres:FAKEdbPASSWORD@localhost:5432/postgres')
  })

  it('never registers a publishable Clerk key, which would redact ordinary text', () => {
    // Arrange / Act / Assert — pins the intent of the list, not just its contents:
    // the publishable key is safe to display and is a poor redaction target.
    expect(SECRET_ENV_VARS).not.toContain('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY')
  })
})
