import { describe, expect, it } from 'vitest'

import type { AssetUsageSite } from './delete-gate'
import {
  SmartQuerySchema,
  SmartRuleSchema,
  matchesQuery,
  matchesRule,
  tallySmartFolder,
  type OrganizableFile,
  type SmartQuery,
} from './organize'

const NOW = new Date('2026-08-26T12:00:00.000Z')

const file = (over: Partial<OrganizableFile> = {}): OrganizableFile => ({
  kind: 'image',
  title: 'Shopfront at dusk.jpg',
  alt: 'The shop lit up in the evening',
  bytes: 240_000,
  width: 1600,
  height: 900,
  createdAt: '2026-08-25T09:00:00.000Z',
  usage: [],
  ...over,
})

const site = (over: Partial<AssetUsageSite> = {}): AssetUsageSite => ({
  postId: '11111111-1111-4111-8111-111111111111',
  postTitle: 'Diwali offer',
  postStatus: 'draft',
  variantStatuses: [],
  ...over,
})

// ── The third answer ─────────────────────────────────────────────────────────
// These are the reason this module returns three values instead of a boolean.
// Each asserts that a column which could not be read produces 'unknown' and
// specifically NOT 'no' — the two are the same pixel on screen and completely
// different claims about the customer's library.
describe('a rule that cannot be answered says so', () => {
  it('orientation is unknown when the dimensions were never recorded', () => {
    const answer = matchesRule(
      { field: 'orientation', is: 'landscape' },
      file({ width: null, height: null }),
      NOW,
    )
    expect(answer).toBe('unknown')
  })

  it('orientation is unknown for a zero dimension rather than dividing the shape by it', () => {
    expect(matchesRule({ field: 'orientation', is: 'square' }, file({ width: 0 }), NOW)).toBe(
      'unknown',
    )
  })

  it('size is unknown when bytes is null, not "under every threshold"', () => {
    const answer = matchesRule(
      { field: 'bytes', op: 'under', value: 1_000_000 },
      file({ bytes: null }),
      NOW,
    )
    expect(answer).toBe('unknown')
  })

  it('usage is unknown when the usage read did not come back', () => {
    // The distinction the whole delete gate rests on: `null` is a failed read,
    // `[]` is "nothing uses this". A rule answering 'no' for a failed read would
    // put a file that IS in a scheduled post into "Not used yet".
    expect(matchesRule({ field: 'usage', is: 'unused' }, file({ usage: null }), NOW)).toBe(
      'unknown',
    )
    expect(matchesRule({ field: 'usage', is: 'unused' }, file({ usage: [] }), NOW)).toBe('yes')
  })

  it('a date that will not parse is unknown, not old', () => {
    const answer = matchesRule(
      { field: 'added', withinDays: 7 },
      file({ createdAt: 'nonsense' }),
      NOW,
    )
    expect(answer).toBe('unknown')
  })

  it('a missing description is a FACT and is never unknown', () => {
    expect(matchesRule({ field: 'description', is: 'missing' }, file({ alt: null }), NOW)).toBe(
      'yes',
    )
    expect(matchesRule({ field: 'description', is: 'missing' }, file({ alt: '   ' }), NOW)).toBe(
      'yes',
    )
    expect(matchesRule({ field: 'description', is: 'present' }, file({ alt: null }), NOW)).toBe(
      'no',
    )
  })
})

describe('the rules that are plainly decidable', () => {
  it('matches a kind', () => {
    expect(matchesRule({ field: 'kind', is: 'image' }, file(), NOW)).toBe('yes')
    expect(matchesRule({ field: 'kind', is: 'video' }, file(), NOW)).toBe('no')
  })

  it('reads the name and the description as one haystack, case-insensitively', () => {
    expect(matchesRule({ field: 'name', contains: 'SHOPFRONT' }, file(), NOW)).toBe('yes')
    // In the description only, which is the half a person forgets they used.
    expect(matchesRule({ field: 'name', contains: 'evening' }, file(), NOW)).toBe('yes')
    expect(matchesRule({ field: 'name', contains: 'invoice' }, file(), NOW)).toBe('no')
  })

  it('tells landscape from portrait from square', () => {
    expect(matchesRule({ field: 'orientation', is: 'landscape' }, file(), NOW)).toBe('yes')
    const tall = file({ width: 900, height: 1600 })
    expect(matchesRule({ field: 'orientation', is: 'portrait' }, tall, NOW)).toBe('yes')
    expect(matchesRule({ field: 'orientation', is: 'landscape' }, tall, NOW)).toBe('no')
    const even = file({ width: 1080, height: 1080 })
    expect(matchesRule({ field: 'orientation', is: 'square' }, even, NOW)).toBe('yes')
    // A square is neither, and must not fall into one of them by a >= slip.
    expect(matchesRule({ field: 'orientation', is: 'landscape' }, even, NOW)).toBe('no')
    expect(matchesRule({ field: 'orientation', is: 'portrait' }, even, NOW)).toBe('no')
  })

  it('compares size strictly, so the boundary belongs to neither side', () => {
    const exact = file({ bytes: 1_000_000 })
    expect(matchesRule({ field: 'bytes', op: 'over', value: 1_000_000 }, exact, NOW)).toBe('no')
    expect(matchesRule({ field: 'bytes', op: 'under', value: 1_000_000 }, exact, NOW)).toBe('no')
  })

  it('counts the date window back from the moment it is asked', () => {
    // 25 August against a 26 August "now": inside seven days, outside one hour.
    expect(matchesRule({ field: 'added', withinDays: 7 }, file(), NOW)).toBe('yes')
    expect(matchesRule({ field: 'added', withinDays: 1 }, file(), NOW)).toBe('no')
  })

  it('locked means a post that has gone out or is going out', () => {
    const locked = file({ usage: [site({ postStatus: 'published' })] })
    expect(matchesRule({ field: 'usage', is: 'locked' }, locked, NOW)).toBe('yes')
    expect(matchesRule({ field: 'usage', is: 'used' }, locked, NOW)).toBe('yes')
    // A draft uses the file but does not lock it. Two different questions.
    const draft = file({ usage: [site({ postStatus: 'draft' })] })
    expect(matchesRule({ field: 'usage', is: 'used' }, draft, NOW)).toBe('yes')
    expect(matchesRule({ field: 'usage', is: 'locked' }, draft, NOW)).toBe('no')
  })
})

// ── How the third answer travels ─────────────────────────────────────────────
describe('matchesQuery — a definite answer beats an unreadable one', () => {
  const all = (rules: SmartQuery['rules']): SmartQuery => ({ mode: 'all', rules })
  const any = (rules: SmartQuery['rules']): SmartQuery => ({ mode: 'any', rules })

  it('under "all", one definite no settles it even beside an unknown', () => {
    // Width is null so orientation is unknown, but the kind rule says no
    // outright. The file is OUT, and reporting it as "could not check" would
    // inflate the unknown count with files whose answer is not in doubt.
    const query = all([
      { field: 'kind', is: 'video' },
      { field: 'orientation', is: 'landscape' },
    ])
    expect(matchesQuery(query, file({ width: null, height: null }), NOW)).toBe('no')
  })

  it('under "all", an unknown with nothing contradicting it is unknown', () => {
    const query = all([
      { field: 'kind', is: 'image' },
      { field: 'orientation', is: 'landscape' },
    ])
    expect(matchesQuery(query, file({ width: null, height: null }), NOW)).toBe('unknown')
  })

  it('under "any", one definite yes settles it even beside an unknown', () => {
    const query = any([
      { field: 'kind', is: 'image' },
      { field: 'bytes', op: 'over', value: 10 },
    ])
    expect(matchesQuery(query, file({ bytes: null }), NOW)).toBe('yes')
  })

  it('under "any", an unknown with nothing satisfying it is unknown', () => {
    const query = any([
      { field: 'kind', is: 'video' },
      { field: 'bytes', op: 'over', value: 10 },
    ])
    expect(matchesQuery(query, file({ bytes: null }), NOW)).toBe('unknown')
  })

  it('every rule holding under "all" is a yes', () => {
    const query = all([
      { field: 'kind', is: 'image' },
      { field: 'description', is: 'present' },
      { field: 'orientation', is: 'landscape' },
    ])
    expect(matchesQuery(query, file(), NOW)).toBe('yes')
  })

  it('no rule holding under "any" is a no', () => {
    const query = any([
      { field: 'kind', is: 'video' },
      { field: 'description', is: 'missing' },
    ])
    expect(matchesQuery(query, file(), NOW)).toBe('no')
  })
})

describe('tallySmartFolder keeps what it could not check out of the count', () => {
  it('reports matched and unknown as two separate numbers', () => {
    const query: SmartQuery = { mode: 'all', rules: [{ field: 'orientation', is: 'landscape' }] }
    const tally = tallySmartFolder(
      query,
      [
        file(),
        file({ width: 2000, height: 1000 }),
        file({ width: 900, height: 1600 }),
        file({ width: null, height: null }),
      ],
      NOW,
    )
    // Two definitely landscape, one definitely not, one that cannot be told.
    // The unknown is NOT in `matched`, and it is not silently dropped either.
    expect(tally).toEqual({ matched: 2, unknown: 1 })
  })

  it('an empty library tallies to zero of both rather than throwing', () => {
    const query: SmartQuery = { mode: 'any', rules: [{ field: 'kind', is: 'image' }] }
    expect(tallySmartFolder(query, [], NOW)).toEqual({ matched: 0, unknown: 0 })
  })
})

// ── The schema is the only gate on a jsonb column ────────────────────────────
describe('SmartQuerySchema refuses what the database would happily store', () => {
  it('rejects a rule whose field and operand do not belong together', () => {
    // The shape a {field, op, value} triple would have admitted.
    expect(SmartRuleSchema.safeParse({ field: 'kind', is: 'landscape' }).success).toBe(false)
    expect(SmartRuleSchema.safeParse({ field: 'orientation', is: 'image' }).success).toBe(false)
  })

  it('parses both size operators, which a duplicated discriminator would have broken', () => {
    // The two `bytes` shapes were once two union members sharing one
    // discriminator value; the second silently shadowed the first. One member
    // with an `op` is why both of these parse.
    expect(SmartRuleSchema.safeParse({ field: 'bytes', op: 'over', value: 5 }).success).toBe(true)
    expect(SmartRuleSchema.safeParse({ field: 'bytes', op: 'under', value: 5 }).success).toBe(true)
  })

  it('rejects an empty rule list, because a question with no rules holds for everything', () => {
    expect(SmartQuerySchema.safeParse({ mode: 'all', rules: [] }).success).toBe(false)
  })

  it('rejects more rules than a person can predict', () => {
    const nine = Array.from({ length: 9 }, () => ({ field: 'kind' as const, is: 'image' as const }))
    expect(SmartQuerySchema.safeParse({ mode: 'all', rules: nine }).success).toBe(false)
  })

  it('rejects a blank name fragment, which would match every file', () => {
    expect(SmartRuleSchema.safeParse({ field: 'name', contains: '   ' }).success).toBe(false)
  })

  it('rejects an unknown mode rather than falling back to one', () => {
    expect(
      SmartQuerySchema.safeParse({ mode: 'most', rules: [{ field: 'kind', is: 'image' }] }).success,
    ).toBe(false)
  })
})
