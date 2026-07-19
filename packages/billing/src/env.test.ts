import { describe, it, expect, afterEach } from 'vitest'
import { assertServerOnly, loadBillingEnv } from './env'

describe('loadBillingEnv', () => {
  it('reads the database URL from SUPABASE_DB_URL', () => {
    const env = loadBillingEnv({ SUPABASE_DB_URL: 'postgres://x' })
    expect(env.databaseUrl).toBe('postgres://x')
  })

  it('falls back to DATABASE_URL', () => {
    const env = loadBillingEnv({ DATABASE_URL: 'postgres://fallback' })
    expect(env.databaseUrl).toBe('postgres://fallback')
  })

  it('throws naming the missing key when no DB URL is set', () => {
    expect(() => loadBillingEnv({})).toThrowError(/SUPABASE_DB_URL/)
  })

  it('never echoes a secret value in the error (names only)', () => {
    // A present-but-empty value is still "missing"; the message must not leak other env values.
    try {
      loadBillingEnv({
        SUPABASE_DB_URL: '',
        SOME_SECRET: 'super-secret-token',
      } as NodeJS.ProcessEnv)
      throw new Error('expected loadBillingEnv to throw')
    } catch (e) {
      const msg = (e as Error).message
      expect(msg).toMatch(/SUPABASE_DB_URL/)
      expect(msg).not.toContain('super-secret-token')
    }
  })
})

describe('assertServerOnly', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
  })

  it('passes on the server (no window)', () => {
    expect(() => assertServerOnly()).not.toThrow()
  })

  it('throws in a browser-like environment', () => {
    ;(globalThis as { window?: unknown }).window = {}
    expect(() => assertServerOnly()).toThrowError(/server-only/)
  })
})
