import { describe, expect, it } from 'vitest'
import { CASHFREE_LIVE_BASE_URL, CASHFREE_SANDBOX_BASE_URL, loadCashfreeEnv } from './env'

const complete = {
  CASHFREE_APP_ID: 'app-id',
  CASHFREE_SECRET_KEY: 'secret-key',
  CASHFREE_ENV: 'sandbox',
} as NodeJS.ProcessEnv

describe('loadCashfreeEnv', () => {
  it('loads a complete sandbox config and derives the base URL', () => {
    const env = loadCashfreeEnv(complete)

    expect(env).toEqual({
      appId: 'app-id',
      secretKey: 'secret-key',
      env: 'sandbox',
      baseUrl: CASHFREE_SANDBOX_BASE_URL,
    })
  })

  it('derives the live base URL', () => {
    expect(loadCashfreeEnv({ ...complete, CASHFREE_ENV: 'live' }).baseUrl).toBe(
      CASHFREE_LIVE_BASE_URL,
    )
  })

  it('points sandbox and live at different hosts', () => {
    expect(CASHFREE_SANDBOX_BASE_URL).not.toBe(CASHFREE_LIVE_BASE_URL)
    expect(CASHFREE_SANDBOX_BASE_URL).toContain('sandbox.cashfree.com')
    expect(CASHFREE_LIVE_BASE_URL).toContain('api.cashfree.com')
  })

  it.each([
    ['CASHFREE_APP_ID', { ...complete, CASHFREE_APP_ID: undefined }],
    ['CASHFREE_SECRET_KEY', { ...complete, CASHFREE_SECRET_KEY: undefined }],
  ])('names %s when it is missing', (key, source) => {
    expect(() => loadCashfreeEnv(source as NodeJS.ProcessEnv)).toThrow(new RegExp(key))
  })

  it('collects every missing key in one throw', () => {
    try {
      loadCashfreeEnv({ CASHFREE_ENV: 'sandbox' } as NodeJS.ProcessEnv)
      throw new Error('expected a throw')
    } catch (e) {
      expect((e as Error).message).toContain('CASHFREE_APP_ID')
      expect((e as Error).message).toContain('CASHFREE_SECRET_KEY')
    }
  })

  it('never echoes a secret value in the error', () => {
    try {
      loadCashfreeEnv({ CASHFREE_APP_ID: 'app-id', CASHFREE_ENV: 'sandbox' } as NodeJS.ProcessEnv)
      throw new Error('expected a throw')
    } catch (e) {
      expect((e as Error).message).not.toContain('app-id')
    }
  })

  /**
   * Cashfree sandbox and production credentials are structurally IDENTICAL — no prefix
   * distinguishes them. There is therefore no way to detect a production key pasted into a
   * sandbox config, so the environment must be stated explicitly. Defaulting here would mean
   * a typo silently pointing real credentials at the wrong host.
   */
  it('refuses to default a missing CASHFREE_ENV', () => {
    expect(() =>
      loadCashfreeEnv({ ...complete, CASHFREE_ENV: undefined } as NodeJS.ProcessEnv),
    ).toThrow(/CASHFREE_ENV/)
  })

  it.each(['SANDBOX', 'test', 'production', 'prod', ''])(
    'rejects %s as a CASHFREE_ENV value',
    (value) => {
      expect(() => loadCashfreeEnv({ ...complete, CASHFREE_ENV: value })).toThrow(/CASHFREE_ENV/)
    },
  )
})
