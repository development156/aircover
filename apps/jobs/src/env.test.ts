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

  it('defaults the dispatch mode to off, so deploying the sweep changes nothing', () => {
    // The whole point of shipping this dark: landing the code must not start mutating
    // post rows. Only an explicit opt-in flips it.
    expect(loadJobsEnv(complete).dispatchMode).toBe('off')
  })

  it('accepts each of the three dispatch modes', () => {
    for (const mode of ['off', 'report', 'on'] as const) {
      expect(loadJobsEnv({ ...complete, SAHODA_PUBLISH_DISPATCH_MODE: mode }).dispatchMode).toBe(
        mode,
      )
    }
  })

  it('rejects an unrecognized dispatch mode instead of falling back', () => {
    // Falling back to a default here is the dangerous shape: a typo like "ON" or "true"
    // must not silently resolve to either extreme. Name it and refuse to start.
    expect(() => loadJobsEnv({ ...complete, SAHODA_PUBLISH_DISPATCH_MODE: 'true' })).toThrow(
      /SAHODA_PUBLISH_DISPATCH_MODE/,
    )
  })

  it('does not treat an empty dispatch mode as off', () => {
    // An empty string usually means "the var is set but the value did not make it", which
    // is a deploy mistake worth surfacing rather than absorbing into the safe default.
    expect(() => loadJobsEnv({ ...complete, SAHODA_PUBLISH_DISPATCH_MODE: '' })).toThrow(
      /SAHODA_PUBLISH_DISPATCH_MODE/,
    )
  })

  it('defaults the dispatch grace to sixty minutes and accepts an override', () => {
    expect(loadJobsEnv(complete).dispatchGraceSeconds).toBe(3600)
    expect(
      loadJobsEnv({ ...complete, SAHODA_PUBLISH_DISPATCH_GRACE_SECONDS: '900' })
        .dispatchGraceSeconds,
    ).toBe(900)
  })

  it('rejects a negative dispatch grace, which would expire posts that are not yet due', () => {
    expect(() => loadJobsEnv({ ...complete, SAHODA_PUBLISH_DISPATCH_GRACE_SECONDS: '-1' })).toThrow(
      /SAHODA_PUBLISH_DISPATCH_GRACE_SECONDS/,
    )
  })

  it('defaults the hold sweep to off', () => {
    // Same rule as the dispatcher: deploying the sweep must not, by itself, start
    // moving credits. Only the flag grants that.
    expect(loadJobsEnv(complete).holdSweepMode).toBe('off')
  })

  it('accepts each of the three hold sweep modes', () => {
    for (const mode of ['off', 'report', 'on'] as const) {
      expect(loadJobsEnv({ ...complete, SAHODA_HOLD_SWEEP_MODE: mode }).holdSweepMode).toBe(mode)
    }
  })

  it('rejects an unrecognized hold sweep mode instead of falling back', () => {
    expect(() => loadJobsEnv({ ...complete, SAHODA_HOLD_SWEEP_MODE: 'ON' })).toThrow(
      /SAHODA_HOLD_SWEEP_MODE/,
    )
  })

  it('does not treat an empty hold sweep mode as off', () => {
    expect(() => loadJobsEnv({ ...complete, SAHODA_HOLD_SWEEP_MODE: '' })).toThrow(
      /SAHODA_HOLD_SWEEP_MODE/,
    )
  })

  it('names every bad key at once rather than failing on the first', () => {
    // Two flags now share one validator. A loader that threw on the first would hide the
    // second, and the operator would fix one, redeploy, and fail again on the other.
    const err = (): unknown => {
      try {
        loadJobsEnv({
          ...complete,
          SAHODA_HOLD_SWEEP_MODE: 'yes',
          SAHODA_PUBLISH_DISPATCH_MODE: 'no',
        })
      } catch (e) {
        return e
      }
      return null
    }
    const message = String((err() as Error).message)
    expect(message).toContain('SAHODA_HOLD_SWEEP_MODE')
    expect(message).toContain('SAHODA_PUBLISH_DISPATCH_MODE')
  })
})

/**
 * A flag the build cannot see is a flag that does not exist.
 *
 * `publishMode` defaults to `fixture` and `createAdapterSelector` checks it BEFORE the
 * Zernio rail, so fixture wins whatever the connection says. Turborepo strips any
 * variable absent from the task's `env` list, so setting `SAHODA_PUBLISH_MODE=live` in
 * the Vercel project while it is unlisted changes nothing at all — the default wins and
 * the UI keeps reporting simulated posts as successful publishes.
 *
 * That was the state until 2026-08-09, and it was invisible precisely because the
 * neighbouring `SAHODA_PUBLISH_ENABLED` IS listed: an operator flipping the switch they
 * can see would have every reason to believe live publishing was on.
 *
 * The sweeps run from a Next.js route in apps/web, so `@sahoda/web#build` is the build
 * that has to know about them — not `@sahoda/jobs`.
 */
describe('the publish mode can reach the build that runs it', () => {
  it('lists SAHODA_PUBLISH_MODE in the @sahoda/web#build env allowlist', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const turbo = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../../turbo.json'), 'utf8'),
    ) as { tasks: Record<string, { env?: string[] }> }

    const allowed = turbo.tasks['@sahoda/web#build']?.env ?? []
    expect(allowed).toContain('SAHODA_PUBLISH_MODE')
    // The sibling that made the omission invisible. If this ever stops being listed,
    // the two are inconsistent again in the other direction.
    expect(allowed).toContain('SAHODA_PUBLISH_ENABLED')
  })
})
