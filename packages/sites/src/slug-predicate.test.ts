import { describe, it, expect } from 'vitest'
import type { AppError, Result } from '@sahoda/shared'
import { resolveSlug } from './slug'
import type { IsSlugTaken } from './slug'

const TRACE_ID = 'trace-slug-0001'

/**
 * The string a leaky implementation would interpolate. Every test here that drives a
 * throwing predicate asserts this text is absent from the surfaced message: a real
 * driver exception carries the connection string, host, and sometimes credentials, and
 * this message reaches the UI and the logs.
 */
const SECRET_EXCEPTION_TEXT = 'connect ECONNREFUSED postgres://svc:hunter2@10.0.0.7:5432/sahoda'

/**
 * `resolveSlug` promises `Promise<Result<string>>`. A predicate that throws, rejects, or
 * answers with a non-boolean must therefore come back as a REJECTED-FREE typed error --
 * never as an unhandled rejection, and never as an `ok` that guessed. Assert on the
 * envelope directly rather than through an unwrap helper, because the failure mode under
 * test is precisely that the envelope was bypassed.
 */
const expectProviderError = <T>(result: Result<T>): AppError => {
  expect(result.ok).toBe(false)
  if (result.ok) {
    throw new Error(`expected a PROVIDER_ERROR, got ok(${JSON.stringify(result.data)})`)
  }
  expect(result.error.code).toBe('PROVIDER_ERROR')
  expect(result.error.traceId).toBe(TRACE_ID)
  expect(result.error.message).not.toContain(SECRET_EXCEPTION_TEXT)
  expect(result.error.message).not.toContain('hunter2')
  expect(result.error.message).not.toContain('postgres://')
  return result.error
}

/** Answers a non-boolean, which the type signature forbids but a JS caller can still do. */
const answering = (value: unknown): IsSlugTaken => (async () => value) as unknown as IsSlugTaken

describe('resolveSlug -- a predicate that fails is a Result, not an unhandled rejection', () => {
  it('converts a synchronous throw into a typed PROVIDER_ERROR', async () => {
    const isTaken: IsSlugTaken = () => {
      throw new Error(SECRET_EXCEPTION_TEXT)
    }

    const result = await resolveSlug('Acme', isTaken, TRACE_ID)

    expect(expectProviderError(result).message).toMatch(/slug availability/i)
  })

  it('converts a rejected promise into a typed PROVIDER_ERROR', async () => {
    const isTaken: IsSlugTaken = async () => {
      return Promise.reject(new Error(SECRET_EXCEPTION_TEXT))
    }

    const result = await resolveSlug('Acme', isTaken, TRACE_ID)

    expect(expectProviderError(result).message).toMatch(/slug availability/i)
  })

  it('converts a rejection carrying a non-Error value, which has no .message to read at all', async () => {
    const isTaken: IsSlugTaken = () => Promise.reject('socket hang up')

    const result = await resolveSlug('Acme', isTaken, TRACE_ID)

    expect(expectProviderError(result).message).not.toContain('socket hang up')
  })

  it('catches a failure on the THIRD probe, not just the first, and stops the walk there', async () => {
    const calls: string[] = []
    const isTaken: IsSlugTaken = async (slug) => {
      calls.push(slug)
      if (calls.length === 3) {
        throw new Error(SECRET_EXCEPTION_TEXT)
      }
      return true
    }

    const result = await resolveSlug('Acme', isTaken, TRACE_ID)

    expectProviderError(result)
    // Aborts at the failure instead of grinding through the remaining 11 probes: a
    // database that just dropped the connection will not answer the next 11 either.
    expect(calls).toEqual(['acme', 'acme-2', 'acme-3'])
  })

  it('surfaces the provider failure rather than the walk-exhausted VALIDATION_ERROR', async () => {
    const isTaken: IsSlugTaken = async () => {
      throw new Error(SECRET_EXCEPTION_TEXT)
    }

    const result = await resolveSlug('Acme', isTaken, TRACE_ID)

    expect(expectProviderError(result).message).not.toMatch(/could not derive a free slug/i)
  })
})

/**
 * A non-boolean answer is a contract violation, so the walk fails closed. The old
 * `!(await isTaken(x))` read `undefined` and `0` as falsy and therefore as "available",
 * handing back a slug that may already exist on a GLOBALLY unique index -- an insert
 * failure the caller cannot see coming. `'yes'` is the mirror image: truthy, so it read
 * as "taken" and burned the whole 14-probe walk before erroring. Neither is a vote.
 */
describe('resolveSlug -- a non-boolean predicate answer is a contract violation', () => {
  const cases: ReadonlyArray<{ why: string; value: unknown }> = [
    { why: 'undefined, the return of a predicate that forgot to return', value: undefined },
    { why: 'null, the shape of an unwrapped empty database row', value: null },
    { why: '0, a falsy row count that reads as "available" under a loose check', value: 0 },
    { why: '1, a truthy row count that is still not a boolean', value: 1 },
    { why: 'the string "yes", truthy and meaningless', value: 'yes' },
    { why: 'an empty object, the shape of an unparsed response body', value: {} },
  ]

  for (const { why, value } of cases) {
    it(`rejects ${why} instead of guessing availability`, async () => {
      const result = await resolveSlug('Acme', answering(value), TRACE_ID)

      const error = expectProviderError(result)
      expect(error.message).toMatch(/non-boolean/i)
    })
  }

  it('never returns ok for a falsy non-boolean, which a loose check would call available', async () => {
    const result = await resolveSlug('Acme', answering(undefined), TRACE_ID)

    expect(result.ok).toBe(false)
  })

  it('fails on the FIRST probe rather than burning the full walk on a truthy non-boolean', async () => {
    const calls: string[] = []
    const isTaken = (async (slug: string) => {
      calls.push(slug)
      return 'yes'
    }) as unknown as IsSlugTaken

    const result = await resolveSlug('Acme', isTaken, TRACE_ID)

    expectProviderError(result)
    expect(calls).toEqual(['acme'])
  })

  it('still accepts a genuine boolean false as "available"', async () => {
    const result = await resolveSlug('Acme', answering(false), TRACE_ID)

    expect(result.ok).toBe(true)
  })
})
