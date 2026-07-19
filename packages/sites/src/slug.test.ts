import { describe, it, expect } from 'vitest'
import type { AppError, Result } from '@sahoda/shared'
import { RESERVED_SLUGS, slugify, resolveSlug } from './slug'
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
 * No mocking library — the recorded call list IS the assertion surface for
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

/** Everything is taken forever — the adversarial predicate the bound exists for. */
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

describe('slugify — folds hostile display names into a url-safe label', () => {
  const cases: ReadonlyArray<{ why: string; input: string; expected: string }> = [
    {
      why: 'lowercases and hyphenates ordinary words',
      input: 'Acme Coffee',
      expected: 'acme-coffee',
    },
    {
      why: 'folds accents so a Latin-1 name stays readable, not mangled',
      input: 'Café Münster',
      expected: 'cafe-munster',
    },
    {
      why: 'folds every diacritic form, not just the common two',
      input: 'Ünïçödé',
      expected: 'unicode',
    },
    {
      why: 'drops non-Latin scripts rather than emitting raw non-ascii bytes in a hostname',
      input: 'Ölbaum Крем',
      expected: 'olbaum',
    },
    {
      why: 'strips emoji, which are never valid in a subdomain label',
      input: '🚀 Launch Day! 🚀',
      expected: 'launch-day',
    },
    {
      why: 'strips punctuation instead of percent-encoding it',
      input: 'Acme & Co. / Ltd.',
      expected: 'acme-co-ltd',
    },
    {
      why: 'keeps digits, which are legal label characters',
      input: 'Store 24/7',
      expected: 'store-24-7',
    },
    {
      why: 'collapses runs of mixed whitespace to a single hyphen',
      input: 'A  B\t\nC',
      expected: 'a-b-c',
    },
    {
      why: 'trims leading and trailing hyphens, which are illegal at label edges',
      input: '---Acme---',
      expected: 'acme',
    },
    {
      why: 'collapses an internal run of separators to one hyphen',
      input: 'Acme___---   Coffee',
      expected: 'acme-coffee',
    },
    {
      why: 'caps length so a rambling model-generated name cannot produce a 400-char host',
      input: 'x'.repeat(80),
      expected: 'x'.repeat(48),
    },
    {
      why: 'trims the trailing hyphen the length cap itself created',
      input: `${'a'.repeat(47)} bc`,
      expected: 'a'.repeat(47),
    },
    {
      why: 'returns empty rather than a bare hyphen when nothing survives',
      input: '🚀🚀🚀',
      expected: '',
    },
    { why: 'returns empty for an empty name instead of throwing', input: '', expected: '' },
    { why: 'returns empty for whitespace-only input', input: '   \t  ', expected: '' },
  ]

  for (const { why, input, expected } of cases) {
    it(`${why} (${JSON.stringify(input.slice(0, 24))})`, () => {
      expect(slugify(input)).toBe(expected)
    })
  }
})

/**
 * Task 4 calls `slugify` a second way: once per PAGE PATH SEGMENT, not just once on a whole
 * site name. A single short word must fold exactly as reliably as a multi-word name does, and
 * a segment with no ASCII fold at all (Devanagari, CJK) must resolve to `''` so Task 4 knows to
 * fall back to a positional path rather than writing an empty segment.
 */
describe('slugify — single-segment inputs (Task 4 slugifies each page-path segment individually)', () => {
  const cases: ReadonlyArray<{ why: string; input: string; expected: string }> = [
    { why: 'a plain single ascii word is unchanged', input: 'about', expected: 'about' },
    { why: 'a single uppercase word is lowercased', input: 'Pricing', expected: 'pricing' },
    {
      why: 'a single word already url-safe passes through unchanged',
      input: 'contact-us',
      expected: 'contact-us',
    },
    {
      why: 'a single accented word folds cleanly, matching the site-name case',
      input: 'café',
      expected: 'cafe',
    },
    { why: 'a single word with an umlaut folds', input: 'München', expected: 'munchen' },
    { why: 'a single word with a French cedilla folds', input: 'Garçon', expected: 'garcon' },
    {
      why: 'a single Devanagari word has no ascii fold and resolves to empty, so Task 4 falls back to a positional path',
      input: 'हमारे',
      expected: '',
    },
    {
      why: 'a single CJK word has no ascii fold and resolves to empty, so Task 4 falls back to a positional path',
      input: '会社',
      expected: '',
    },
  ]

  for (const { why, input, expected } of cases) {
    it(`${why} (${JSON.stringify(input)})`, () => {
      expect(slugify(input)).toBe(expected)
    })
  }
})

describe('RESERVED_SLUGS — the words a tenant may never own', () => {
  it('contains exactly the twelve infrastructure labels, so the set cannot silently grow or shrink', () => {
    expect([...RESERVED_SLUGS].sort()).toEqual(
      [
        'admin',
        'api',
        'app',
        'assets',
        'blog',
        'cdn',
        'docs',
        'help',
        'mail',
        'static',
        'status',
        'www',
      ].sort(),
    )
  })

  for (const word of [
    'www',
    'app',
    'api',
    'admin',
    'mail',
    'cdn',
    'static',
    'assets',
    'blog',
    'help',
    'status',
    'docs',
  ]) {
    it(`never probes "${word}" itself — it is rejected before the first database round-trip`, async () => {
      const { isTaken, calls } = recorder([])

      const result = await resolveSlug(word, isTaken, TRACE_ID)

      expect(expectOk(result)).toBe(`${word}-2`)
      expect(calls).toEqual([`${word}-2`])
      expect(calls).not.toContain(word)
    })
  }
})

describe('resolveSlug — the bounded collision walk', () => {
  it('returns the bare slug after exactly one probe when it is free', async () => {
    const { isTaken, calls } = recorder([])

    const result = await resolveSlug('Acme Coffee', isTaken, TRACE_ID)

    expect(expectOk(result)).toBe('acme-coffee')
    expect(calls).toEqual(['acme-coffee'])
  })

  it('falls back to a generic base when the name slugifies to nothing, never to an empty slug', async () => {
    const { isTaken, calls } = recorder([])

    const result = await resolveSlug('🚀🚀🚀', isTaken, TRACE_ID)

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

  it('uses a six-character lowercase-alphanumeric suffix by default, with no deps injected', async () => {
    const { isTaken } = recorder(['acme', ...NUMERIC_CANDIDATES])

    const result = await resolveSlug('Acme', isTaken, TRACE_ID)

    expect(expectOk(result)).toMatch(/^acme-[a-z0-9]{6}$/)
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
