import { describe, it, expect } from 'vitest'
import { loadJobsEnv } from './env'

const complete = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
  SUPABASE_DB_URL: 'postgresql://u:p@db.proj.supabase.co:5432/postgres',
} as NodeJS.ProcessEnv

describe('loadJobsEnv', () => {
  it('defaults the publish mode to fixture', () => {
    // Safe default: there is no sanctioned way to open a connection secret yet, so a
    // missing flag must not put the job on the live rail.
    expect(loadJobsEnv(complete).publishMode).toBe('fixture')
  })

  it('accepts an explicit live mode', () => {
    expect(loadJobsEnv({ ...complete, SAHODA_PUBLISH_MODE: 'live' }).publishMode).toBe('live')
  })

  it('rejects an unrecognized publish mode instead of guessing', () => {
    expect(() => loadJobsEnv({ ...complete, SAHODA_PUBLISH_MODE: 'staging' })).toThrow(
      /SAHODA_PUBLISH_MODE/,
    )
  })

  it('normalizes a pasted dashboard URL down to its origin', () => {
    // A URL carrying /rest/v1/ makes every supabase-js call 404 (PGRST125).
    const env = loadJobsEnv({
      ...complete,
      NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co/rest/v1/',
    })

    expect(env.supabaseUrl).toBe('https://proj.supabase.co')
  })

  it('reports every missing key in one error', () => {
    const err = (() => {
      try {
        loadJobsEnv({})
        return null
      } catch (e) {
        return e as Error
      }
    })()

    expect(err).not.toBeNull()
    expect(err!.message).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(err!.message).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(err!.message).toContain('SUPABASE_DB_URL')
  })

  it('names missing keys without echoing any value', () => {
    const err = (() => {
      try {
        loadJobsEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co' })
        return null
      } catch (e) {
        return e as Error
      }
    })()

    expect(err!.message).not.toContain('proj.supabase.co')
  })

  it('defaults the hold-sweep grace to ten minutes and accepts an override', () => {
    expect(loadJobsEnv(complete).holdSweepGraceSeconds).toBe(600)
    expect(
      loadJobsEnv({ ...complete, SAHODA_HOLD_SWEEP_GRACE_SECONDS: '120' }).holdSweepGraceSeconds,
    ).toBe(120)
  })

  it('rejects a negative grace, which would reap live holds', () => {
    expect(() => loadJobsEnv({ ...complete, SAHODA_HOLD_SWEEP_GRACE_SECONDS: '-60' })).toThrow(
      /SAHODA_HOLD_SWEEP_GRACE_SECONDS/,
    )
  })
})
