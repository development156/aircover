import { describe, it, expect } from 'vitest'
import { RESERVED_SLUGS, slugify } from './slug'

interface SlugifyCase {
  why: string
  input: string
  expected: string
}

describe('slugify -- folds hostile display names into a url-safe label', () => {
  const cases: ReadonlyArray<SlugifyCase> = [
    {
      why: 'lowercases and hyphenates ordinary words',
      input: 'Acme Coffee',
      expected: 'acme-coffee',
    },
    {
      why: 'folds accents so a Latin-1 name stays readable, not mangled',
      input: 'Caf\u00e9 M\u00fcnster',
      expected: 'cafe-munster',
    },
    {
      why: 'folds every diacritic form, not just the common two',
      input: '\u00dcn\u00ef\u00e7\u00f6d\u00e9',
      expected: 'unicode',
    },
    {
      why: 'drops non-Latin scripts rather than emitting raw non-ascii bytes in a hostname',
      input: '\u00d6lbaum \u041a\u0440\u0435\u043c',
      expected: 'olbaum',
    },
    {
      why: 'strips emoji, which are never valid in a subdomain label',
      input: '\ud83d\ude80 Launch Day! \ud83d\ude80',
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
      input: '\ud83d\ude80\ud83d\ude80\ud83d\ude80',
      expected: '',
    },
    {
      why: 'returns empty for an empty name instead of throwing',
      input: '',
      expected: '',
    },
    {
      why: 'returns empty for whitespace-only input',
      input: '   \t  ',
      expected: '',
    },
  ]

  for (const { why, input, expected } of cases) {
    it(`${why} (${JSON.stringify(input.slice(0, 24))})`, () => {
      expect(slugify(input)).toBe(expected)
    })
  }
})

/**
 * The normalization FORM is load-bearing, not incidental. `slugify` calls NFKD
 * (compatibility decomposition); a maintainer downgrading it to NFD would keep every
 * accent test above green, because accents are canonical pairs that NFD also splits.
 * These two inputs are the ones that diverge -- they are compatibility forms, which
 * only NFKD folds -- so they are what actually pins the `'NFKD'` argument in place.
 */
describe('slugify -- NFKD compatibility folding (NFD is not a valid substitute)', () => {
  const cases: ReadonlyArray<SlugifyCase> = [
    {
      why: 'NFKD folds fullwidth forms to ascii; under NFD every character survives normalization, falls outside [a-z0-9] and collapses away to an empty label',
      input: '\uff21\uff43\uff4d\uff45\u3000\uff23\uff4f',
      expected: 'acme-co',
    },
    {
      why: 'NFKD decomposes the U+FB01 fi ligature into f + i; under NFD it survives whole and is stripped, amputating the first two letters of the word',
      input: '\ufb01nance',
      expected: 'finance',
    },
  ]

  for (const { why, input, expected } of cases) {
    it(`${why} (${JSON.stringify(input)})`, () => {
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
describe('slugify -- single-segment inputs (Task 4 slugifies each page-path segment individually)', () => {
  const cases: ReadonlyArray<SlugifyCase> = [
    {
      why: 'a plain single ascii word is unchanged',
      input: 'about',
      expected: 'about',
    },
    {
      why: 'a single uppercase word is lowercased',
      input: 'Pricing',
      expected: 'pricing',
    },
    {
      why: 'a single word already url-safe passes through unchanged',
      input: 'contact-us',
      expected: 'contact-us',
    },
    {
      why: 'a single accented word folds cleanly, matching the site-name case',
      input: 'caf\u00e9',
      expected: 'cafe',
    },
    {
      why: 'a single word with an umlaut folds',
      input: 'M\u00fcnchen',
      expected: 'munchen',
    },
    {
      why: 'a single word with a French cedilla folds',
      input: 'Gar\u00e7on',
      expected: 'garcon',
    },
    {
      why: 'a single Devanagari word has no ascii fold and resolves to empty, so Task 4 falls back to a positional path',
      input: '\u0939\u092e\u093e\u0930\u0947',
      expected: '',
    },
    {
      why: 'a single CJK word has no ascii fold and resolves to empty, so Task 4 falls back to a positional path',
      input: '\u4f1a\u793e',
      expected: '',
    },
  ]

  for (const { why, input, expected } of cases) {
    it(`${why} (${JSON.stringify(input)})`, () => {
      expect(slugify(input)).toBe(expected)
    })
  }
})

describe('RESERVED_SLUGS -- the words a tenant may never own', () => {
  it('contains exactly the twenty-six reserved labels, so the set cannot silently grow or shrink', () => {
    expect([...RESERVED_SLUGS].sort()).toEqual(
      [
        'admin',
        'api',
        'app',
        'assets',
        'auth',
        'billing',
        'blog',
        'cdn',
        'dashboard',
        'dev',
        'docs',
        'ftp',
        'help',
        'login',
        'mail',
        'mx',
        'ns',
        'preview',
        'sahoda',
        'smtp',
        'staging',
        'static',
        'status',
        'support',
        'webhook',
        'www',
      ].sort(),
    )
  })

  /**
   * `resolveSlug` checks the BARE root against this set and never re-checks the
   * hyphenated candidates it goes on to generate. That is only safe while no reserved
   * entry contains a hyphen -- see the note at the reserved check in slug.ts. Pinning
   * the invariant here means a future hyphenated addition fails a test instead of
   * silently opening a path to a reserved subdomain.
   */
  it('holds no hyphenated entry, the invariant that lets the collision walk skip the reserved check', () => {
    const hyphenated = [...RESERVED_SLUGS].filter((word) => word.includes('-'))

    expect(hyphenated).toEqual([])
  })
})
