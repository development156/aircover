import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// Pins the LAZY boot-guard contract of ./env.ts. `next build` imports every
// server module during "Collecting page data" — with no env configured (a
// fresh Vercel project), a module-scope parse fails the whole build before a
// single page renders. The contract under test: importing the module is always
// safe; the FIRST PROPERTY ACCESS parses, warns, and fails fast.

const VAR_NAMES = [
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const

const VALID: Record<(typeof VAR_NAMES)[number], string> = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_abc',
  CLERK_SECRET_KEY: 'sk_test_abc',
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
}

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  // Fresh module (and fresh lazy cache) per test; start from a bare env.
  vi.resetModules()
  for (const name of VAR_NAMES) {
    saved[name] = process.env[name]
    delete process.env[name]
  }
})

afterEach(() => {
  for (const name of VAR_NAMES) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
  vi.restoreAllMocks()
})

describe('env (lazy boot guard)', () => {
  test('importing the module with all vars missing does not throw', async () => {
    // Arrange: beforeEach stripped every var — the build-time shape on Vercel.
    // Act + Assert: import alone must stay side-effect-free.
    await expect(import('./env')).resolves.toBeDefined()
  })

  test('first property access with vars missing throws naming every missing var', async () => {
    const { env } = await import('./env')

    expect(() => env.CLERK_SECRET_KEY).toThrowError(
      /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    )
  })

  test('access with valid vars returns parsed (normalized) values', async () => {
    Object.assign(process.env, VALID)

    const { env } = await import('./env')

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://abc.supabase.co')
    expect(env.CLERK_SECRET_KEY).toBe('sk_test_abc')
  })

  test('parses once: later process.env mutation does not change values', async () => {
    Object.assign(process.env, VALID)
    const { env } = await import('./env')

    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('anon-key')

    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mutated-later'

    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('anon-key')
  })

  test('env is read-only: assignment throws at the write site instead of poisoning the key', async () => {
    Object.assign(process.env, VALID)
    const { env } = await import('./env')

    // A silent write would define a phantom on the Proxy target and make every
    // LATER read of that key throw an invariant TypeError far from the cause.
    expect(() => {
      ;(env as Record<string, string>).CLERK_SECRET_KEY = 'overwritten'
    }).toThrowError(/read-only/)

    // The read path must survive the attempted write.
    expect(env.CLERK_SECRET_KEY).toBe('sk_test_abc')
  })

  test('env cannot be frozen, sealed, or deleted from — each throws a clear error', async () => {
    Object.assign(process.env, VALID)
    const { env } = await import('./env')

    expect(() => Object.freeze(env)).toThrowError(/read-only/)
    expect(() => {
      delete (env as Record<string, string>).CLERK_SECRET_KEY
    }).toThrowError(/read-only/)
    expect(() => Object.defineProperty(env, 'X', { value: 1 })).toThrowError(/read-only/)

    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('anon-key')
  })

  test('supabase URL path warning fires at first access, exactly once — never at import', async () => {
    Object.assign(process.env, {
      ...VALID,
      NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co/rest/v1',
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { env } = await import('./env')
    expect(warn).not.toHaveBeenCalled()

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://abc.supabase.co')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toMatch(/NEXT_PUBLIC_SUPABASE_URL contained a path/)

    // Second access: cached parse, no repeat warning.
    void env.CLERK_SECRET_KEY
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
