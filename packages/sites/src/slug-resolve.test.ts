import { describe, it, expect, afterEach, vi } from 'vitest'
import type { AppError, Result } from '@sahoda/shared'
import { RESERVED_SLUGS, resolveSlug } from './slug'
import type { IsSlugTaken } from './slug'

const TRACE_ID = 'trace-slug-0001'

/** Unwrap an ok Result or fail loudly with the error the code actually produced. */
const expectOk = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`)
  }
  return result.data
}

/** Unwrap an err Result or fail loudly with the value the code actually produced. */
const expectErr = <T>(result: Result<T>): AppError => {
  if (result.ok) {
    throw new Error(`expected err, got ok(${JSON.stringify(result.data)})`)
  }
  return result.error
}

/**
 * A hand-written isTaken closure that records every slug it was asked about.
 * No mocking library -- the recorded call list IS the assertion surface for
 * "reserved words are rejected BEFORE the first probe" and for termination.
 */
const recorder = (taken: readonly string[]) => {
  const takenSet = new Set(taken)
  const calls: string[] = []
  const isTaken: IsSlugTaken = async (slug) => {
    calls.push(slug)
    return takenSet.has(slug)
  }
  return { isTaken, calls }
}

/** Everything is taken forever -- the adversarial predicate the bound exists for. */
const alwaysTaken = () => {
  const calls: string[] = []
  const isTaken: IsSlugTaken = async (slug) => {
    calls.push(slug)
    return true
  }
  return { isTaken, calls }
}

/** Deterministic random suffixes so the collision-walk tests can never flake. */
const sequenceSuffix = (values: readonly string[]): (() => string) => {
  let index = 0
  return () => {
    const value = values[index]
    index += 1
    return value ?? 'exhausted'
  }
}

const NUMERIC_CANDIDATES = [
  'acme-2',
  'acme-3',
  'acme-4',
  'acme-5',
  'acme-6',
  'acme-7',
  'acme-8',
  'acme-9',
]

/**
 * Driven off the real set rather than a copy, so a word added to RESERVED_SLUGS is
 * automatically held to the never-probed rule. slug.test.ts pins the set's exact
 * contents, so this loop cannot silently shrink to nothing.
 */
const RESERVED_WORDS = [...RESERVED_SLUGS]

describe('resolveSlug -- reserved roots are never probed', () => {
  for (const word of RESERVED_WORDS) {
    it(`never probes "${word}" itself -- it is rejected before the first database round-trip`, async () => {
      const { isTaken, calls } = recorder([])

      const result = await resolveSlug(word, isTaken, TRACE_ID)

      expect(expectOk(result)).toBe(`${word}-2`)
      expect(calls).toEqual([`${word}-2`])
      expect(calls).not.toContain(word)
    })
  }
})

describe('resolveSlug -- the bounded collision walk', () => {
  it('returns the bare slug after exactly one probe when it is free', async () => {
    const { isTaken, calls } = recorder([])

    const result = await resolveSlug('Acme Coffee', isTaken, TRACE_ID)

    expect(expectOk(result)).toBe('acme-coffee')
    expect(calls).toEqual(['acme-coffee'])
  })

  it('falls back to a generic base when the name slugifies to nothing, never to an empty slug', async () => {
    const { isTaken, calls } = recorder([])

    const result = await resolveSlug('\ud83d\ude80\ud83d\ude80\ud83d\ude80', isTaken, TRACE_ID)

    expect(expectOk(result)).toBe('site')
    expect(calls).toEqual(['site'])
  })

  it('takes "-2" when the base is taken, because -1 reads as a typo not a second site', async () => {
    const { isTaken, calls } = recorder(['acme'])

    const result = await resolveSlug('Acme', isTaken, TRACE_ID)

    expect(expectOk(result)).toBe('acme-2')
    expect(calls).toEqual(['acme', 'acme-2'])
  })

  it('walks the numeric range in order and stops at the first free number', async () => {
    const { isTaken, calls } = recorder(['acme', 'acme-2', 'acme-3'])

    const result = await resolveSlug('Acme', isTaken, TRACE_ID)

    expect(expectOk(result)).toBe('acme-4')
    expect(calls).toEqual(['acme', 'acme-2', 'acme-3', 'acme-4'])
  })

  it('stops the numeric walk at -9 and switches to a random suffix', async () => {
    const { isTaken, calls } = recorder(['acme', ...NUMERIC_CANDIDATES])

    const result = await resolveSlug('Acme', isTaken, TRACE_ID, {
      randomSuffix: sequenceSuffix(['k7f2qz']),
    })

    expect(expectOk(result)).toBe('acme-k7f2qz')
    expect(calls).toEqual(['acme', ...NUMERIC_CANDIDATES, 'acme-k7f2qz'])
  })

  it('retries the random suffix when the first random candidate is also taken', async () => {
    const { isTaken, calls } = recorder([
      'acme',
      ...NUMERIC_CANDIDATES,
      'acme-aaaaaa',
      'acme-bbbbbb',
    ])

    const result = await resolveSlug('Acme', isTaken, TRACE_ID, {
      randomSuffix: sequenceSuffix(['aaaaaa', 'bbbbbb', 'cccccc']),
    })

    expect(expectOk(result)).toBe('acme-cccccc')
    expect(calls.slice(-3)).toEqual(['acme-aaaaaa', 'acme-bbbbbb', 'acme-cccccc'])
  })

  it('terminates with VALIDATION_ERROR instead of looping when the predicate is permanently true', async () => {
    const { isTaken } = alwaysTaken()

    const result = await resolveSlug('Acme', isTaken, TRACE_ID, {
      randomSuffix: sequenceSuffix(['s1', 's2', 's3', 's4', 's5']),
    })

    const error = expectErr(result)
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.message).toMatch(/could not derive a free slug/i)
  })

  it('bounds the probe count at 14 (1 base + 8 numeric + 5 random) against an adversarial predicate', async () => {
    const { isTaken, calls } = alwaysTaken()

    await resolveSlug('Acme', isTaken, TRACE_ID, {
      randomSuffix: sequenceSuffix(['s1', 's2', 's3', 's4', 's5']),
    })

    expect(calls).toHaveLength(14)
    expect(calls).toEqual([
      'acme',
      ...NUMERIC_CANDIDATES,
      'acme-s1',
      'acme-s2',
      'acme-s3',
      'acme-s4',
      'acme-s5',
    ])
  })

  it('bounds the probe count at 13 for a reserved base, since the base probe is skipped', async () => {
    const { isTaken, calls } = alwaysTaken()

    await resolveSlug('www', isTaken, TRACE_ID, {
      randomSuffix: sequenceSuffix(['s1', 's2', 's3', 's4', 's5']),
    })

    expect(calls).toHaveLength(13)
    expect(calls[0]).toBe('www-2')
  })

  it('carries the caller traceId onto the error so support can correlate the failure', async () => {
    const { isTaken } = alwaysTaken()

    const result = await resolveSlug('Acme', isTaken, TRACE_ID, {
      randomSuffix: sequenceSuffix(['s1', 's2', 's3', 's4', 's5']),
    })

    expect(expectErr(result).traceId).toBe(TRACE_ID)
  })

  it('does not leak the raw display name into the error message', async () => {
    const { isTaken } = alwaysTaken()

    const result = await resolveSlug('<script>alert(1)</script>', isTaken, TRACE_ID, {
      randomSuffix: sequenceSuffix(['s1', 's2', 's3', 's4', 's5']),
    })

    expect(expectErr(result).message).not.toContain('<script>')
  })
})

/**
 * The default suffix alphabet is `a-z` + `0-9`, and its COMPOSITION is a real property:
 * six lowercase-alphanumeric characters give 36^6 combinations, and dropping the digits
 * would quietly cut that to 26^6 -- a 5.5x smaller keyspace on a globally-unique column.
 * A shape assertion alone (`/^acme-[a-z0-9]{6}$/`) cannot see that, since an all-letter
 * suffix still matches it. So these tests pin specific INDEXES instead: by stubbing
 * `Math.random` to a fixed value, the character the alphabet yields at that index is
 * deterministic, and removing the digits shifts every index and fails the assertion.
 */
describe('resolveSlug -- the default random suffix alphabet', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** Force `Math.floor(Math.random() * len)` to a known index by fixing the ratio. */
  const stubRandom = (value: number) => {
    vi.spyOn(Math, 'random').mockReturnValue(value)
  }

  it('uses a six-character lowercase-alphanumeric suffix by default, with no deps injected', async () => {
    const { isTaken } = recorder(['acme', ...NUMERIC_CANDIDATES])

    const result = await resolveSlug('Acme', isTaken, TRACE_ID)

    expect(expectOk(result)).toMatch(/^acme-[a-z0-9]{6}$/)
  })

  it('yields "a" at index 0, pinning the alphabet start', async () => {
    const { isTaken } = recorder(['acme', ...NUMERIC_CANDIDATES])
    stubRandom(0)

    const result = await resolveSlug('Acme', isTaken, TRACE_ID)

    expect(expectOk(result)).toBe('acme-aaaaaa')
  })

  it('yields "1" at index 27, which only holds while the digits follow the 26 letters', async () => {
    const { isTaken } = recorder(['acme', ...NUMERIC_CANDIDATES])
    // 0.75 is exact in binary, so 0.75 * 36 is exactly 27 -- no float drift.
    stubRandom(0.75)

    const result = await resolveSlug('Acme', isTaken, TRACE_ID)

    // Drop the digits and the alphabet is 26 long: 0.75 * 26 floors to 19, giving "t".
    expect(expectOk(result)).toBe('acme-111111')
  })

  it('yields "9" at the final index, pinning the alphabet length at 36 and its last character as a digit', async () => {
    const { isTaken } = recorder(['acme', ...NUMERIC_CANDIDATES])
    stubRandom(0.9999999)

    const result = await resolveSlug('Acme', isTaken, TRACE_ID)

    // A digitless alphabet would end at "z" here, not "9".
    expect(expectOk(result)).toBe('acme-999999')
  })
})
