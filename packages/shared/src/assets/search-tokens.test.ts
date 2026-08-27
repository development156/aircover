import { describe, expect, it } from 'vitest'

import { matchesQuery, type OrganizableFile, type SmartRule } from './organize'
import { TOKEN_FIELDS, isNarrowing, parseSearch, unparseRule } from './search-tokens'

const NOW = new Date('2026-08-26T12:00:00.000Z')

const file = (over: Partial<OrganizableFile> = {}): OrganizableFile => ({
  kind: 'image',
  title: 'Shopfront at dusk.jpg',
  alt: 'The shop lit up',
  bytes: 240_000,
  width: 1600,
  height: 900,
  createdAt: '2026-08-25T09:00:00.000Z',
  usage: [],
  ...over,
})

describe('plain words stay plain words', () => {
  it('keeps ordinary text as the name search', () => {
    const parsed = parseSearch('shopfront dusk')
    expect(parsed.text).toBe('shopfront dusk')
    expect(parsed.rules).toEqual([])
    expect(parsed.unusable).toEqual([])
  })

  it('an empty box narrows nothing', () => {
    expect(isNarrowing(parseSearch('   '))).toBe(false)
    expect(isNarrowing(parseSearch('shopfront'))).toBe(true)
  })

  // ── The rule that keeps this box usable ────────────────────────────────────
  // A colon is common in real filenames and in times. Treating every colon as a
  // filter would make "10:30 shoot" return nothing and explain nothing.
  it('a colon in ordinary text is NOT a token', () => {
    const parsed = parseSearch('10:30 shoot')
    expect(parsed.text).toBe('10:30 shoot')
    expect(parsed.rules).toEqual([])
    expect(parsed.unusable).toEqual([])
  })

  it('an unknown field is text, not an error', () => {
    // `colour:` is a filter Sahoda does not have. Refusing it would be noise;
    // searching for it is harmless and occasionally even right.
    const parsed = parseSearch('colour:red')
    expect(parsed.text).toBe('colour:red')
    expect(parsed.unusable).toEqual([])
  })

  it('a half-typed token narrows nothing and is not an error', () => {
    // What every token looks like mid-keystroke.
    const parsed = parseSearch('type:')
    expect(parsed.rules).toEqual([])
    expect(parsed.unusable).toEqual([])
    expect(isNarrowing(parsed)).toBe(false)
  })
})

describe('every field in the catalogue parses its own example', () => {
  // The hint row shows these to a person. An example that does not parse is a
  // lie printed on the screen, so the catalogue is checked against the parser
  // rather than trusted to stay in step with it.
  it.each(TOKEN_FIELDS.map((f) => [f.key, f.example] as const))(
    '%s: the example "%s" is usable',
    (key, example) => {
      const parsed = parseSearch(example)
      expect(parsed.unusable).toEqual([])
      if (key === 'in') expect(parsed.folderNames).toHaveLength(1)
      else expect(parsed.rules).toHaveLength(1)
      expect(parsed.text).toBe('')
    },
  )
})

describe('tokens compile to the rules the engine already understands', () => {
  const only = (input: string): SmartRule => {
    const parsed = parseSearch(input)
    expect(parsed.unusable).toEqual([])
    expect(parsed.rules).toHaveLength(1)
    return parsed.rules[0] as SmartRule
  }

  it('type', () => {
    expect(only('type:image')).toEqual({ field: 'kind', is: 'image' })
  })

  it('used, in the words a person reaches for', () => {
    // `used:no` is the plain phrasing; the stored vocabulary says 'unused'.
    expect(only('used:no')).toEqual({ field: 'usage', is: 'unused' })
    expect(only('used:yes')).toEqual({ field: 'usage', is: 'used' })
    expect(only('used:locked')).toEqual({ field: 'usage', is: 'locked' })
  })

  it('size, with units', () => {
    expect(only('size:>500kb')).toEqual({ field: 'bytes', op: 'over', value: 512_000 })
    expect(only('size:<2mb')).toEqual({ field: 'bytes', op: 'under', value: 2_097_152 })
    expect(only('size:>1200')).toEqual({ field: 'bytes', op: 'over', value: 1200 })
  })

  it('added, as words or as days', () => {
    expect(only('added:today')).toEqual({ field: 'added', withinDays: 1 })
    expect(only('added:week')).toEqual({ field: 'added', withinDays: 7 })
    expect(only('added:month')).toEqual({ field: 'added', withinDays: 30 })
    expect(only('added:30d')).toEqual({ field: 'added', withinDays: 30 })
  })

  it('shape and desc', () => {
    expect(only('shape:landscape')).toEqual({ field: 'orientation', is: 'landscape' })
    expect(only('desc:missing')).toEqual({ field: 'description', is: 'missing' })
  })

  it('in names a folder rather than compiling to a rule', () => {
    // The only token that is not a fact about the file itself. The screen has to
    // resolve the name, so the parser hands it back instead of guessing.
    const parsed = parseSearch('in:diwali')
    expect(parsed.rules).toEqual([])
    expect(parsed.folderNames).toEqual(['diwali'])
  })

  it('reads several tokens and free text together', () => {
    const parsed = parseSearch('type:image used:no shopfront')
    expect(parsed.rules).toHaveLength(2)
    expect(parsed.text).toBe('shopfront')
  })

  it('is case-insensitive on the token, and leaves text alone', () => {
    const parsed = parseSearch('TYPE:IMAGE Shopfront')
    expect(parsed.rules).toEqual([{ field: 'kind', is: 'image' }])
    expect(parsed.text).toBe('Shopfront')
  })
})

// ── A known field with a bad value is NAMED, never swallowed ─────────────────
describe('a typo in a filter Sahoda knows says what it knows', () => {
  it('reports the bad value instead of silently searching for the literal', () => {
    // `type:vidoe` becoming a text search returns nothing and explains nothing,
    // which reads as a broken library rather than a typo.
    const parsed = parseSearch('type:vidoe')
    expect(parsed.rules).toEqual([])
    expect(parsed.text).toBe('')
    expect(parsed.unusable).toHaveLength(1)
    expect(parsed.unusable[0]?.text).toBe('type:vidoe')
    expect(parsed.unusable[0]?.message).toMatch(/type:image/)
  })

  it('names what it knows for every field that can be mistyped', () => {
    for (const input of ['used:maybe', 'shape:round', 'desc:sometimes', 'added:soon']) {
      const parsed = parseSearch(input)
      expect(parsed.unusable, input).toHaveLength(1)
      expect(parsed.unusable[0]?.message.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('a size with no comparison says so, because size:500kb is ambiguous', () => {
    const parsed = parseSearch('size:500kb')
    expect(parsed.unusable).toHaveLength(1)
    expect(parsed.unusable[0]?.message).toMatch(/>|</)
  })

  it('a size with a comparison but nonsense after it says so too', () => {
    expect(parseSearch('size:>lots').unusable).toHaveLength(1)
  })

  it('one bad token does not discard the good ones beside it', () => {
    const parsed = parseSearch('type:image shape:round shopfront')
    expect(parsed.rules).toEqual([{ field: 'kind', is: 'image' }])
    expect(parsed.unusable).toHaveLength(1)
    expect(parsed.text).toBe('shopfront')
  })
})

// ── The whole point: typing a filter is the same as building one ────────────
describe('a typed search decides exactly what the rule engine decides', () => {
  it('finds the unused photos', () => {
    const parsed = parseSearch('used:no')
    const query = { mode: 'all' as const, rules: parsed.rules }
    expect(matchesQuery(query, file({ usage: [] }), NOW)).toBe('yes')
    expect(
      matchesQuery(
        query,
        file({
          usage: [{ postId: 'p', postTitle: null, postStatus: 'draft', variantStatuses: [] }],
        }),
        NOW,
      ),
    ).toBe('no')
  })

  it('keeps the three-valued answer, so a typed filter still declines to guess', () => {
    // The property the rule builder had and a plain text search never could: a
    // photo with no recorded width is not silently dropped from shape:landscape.
    const parsed = parseSearch('shape:landscape')
    const query = { mode: 'all' as const, rules: parsed.rules }
    expect(matchesQuery(query, file({ width: null, height: null }), NOW)).toBe('unknown')
    expect(matchesQuery(query, file(), NOW)).toBe('yes')
  })

  it('several tokens narrow together', () => {
    const parsed = parseSearch('type:image size:>100kb')
    const query = { mode: 'all' as const, rules: parsed.rules }
    expect(matchesQuery(query, file({ bytes: 240_000 }), NOW)).toBe('yes')
    expect(matchesQuery(query, file({ bytes: 1_000 }), NOW)).toBe('no')
  })
})

// ── Saving a search has to be reversible, or you cannot edit what you saved ──
describe('a saved search round-trips back into the box', () => {
  it.each([
    'type:image',
    'type:video',
    'used:no',
    'used:yes',
    'used:locked',
    'size:>500kb',
    'size:<2mb',
    'size:>1200',
    'added:7d',
    'shape:portrait',
    'desc:missing',
  ])('%s survives compile then unparse', (input) => {
    const rule = parseSearch(input).rules[0] as SmartRule
    expect(unparseRule(rule)).toBe(input)
  })

  it('and the round trip is not just string equality: it re-parses to the same rule', () => {
    for (const input of ['size:>500kb', 'added:30d', 'used:no']) {
      const first = parseSearch(input).rules[0] as SmartRule
      const second = parseSearch(unparseRule(first)).rules[0] as SmartRule
      expect(second).toEqual(first)
    }
  })
})
