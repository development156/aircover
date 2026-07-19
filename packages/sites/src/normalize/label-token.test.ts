/**
 * The gate on untrusted strings that are named INSIDE a `dropped` label.
 *
 * Two call sites reach a label with a string the model chose: an unknown key name
 * (`recordUnknownKeys`) and an out-of-union `section.kind` (`normalizeDraft`). Every sibling
 * field on the same objects is gated — `entry.path` by `normalizePath`, `entry.title` and
 * `entry.seo.description` by `coerceText`, every content VALUE by `coerceText` — so these two
 * are tested together: they are one missing gate at two addresses, not two defects.
 *
 * What is asserted, in both directions:
 *   - the label is BOUNDED, so 100k junk characters cannot become 100k bytes of `AppError.details`
 *   - the truncation is STATED, never silent, because a shortened label is a coerced value
 *   - control and bidi characters do not survive into the label, the logs, or the UI
 */
import { describe, it, expect } from 'vitest'
import type { SiteGenerateOutput } from '@sahoda/shared'
import { normalizeDraft } from './draft'
import type { NormalizeOptions } from './draft'
import { normalizeSection } from './section-content'
import {
  MAX_LABEL_TOKEN_LENGTH,
  MAX_UNKNOWN_KEYS,
  UNNAMEABLE_TOKEN,
  labelToken,
  labelTokenOverCap,
} from './section-coerce'

const TRACE_ID = 'trace-sites-label-token'
const BIDI_OVERRIDE = String.fromCharCode(0x202e)
const NUL = String.fromCharCode(0x00)
const ZERO_WIDTH = String.fromCharCode(0x200b)

type OutputPage = SiteGenerateOutput['pages'][number]
type OutputSection = OutputPage['sections'][number]

const options = (): NormalizeOptions => ({ name: 'Acme Yoga', maxPages: 5, traceId: TRACE_ID })

const hero: OutputSection = { kind: 'hero', content: { headline: 'Breathe better' } }

/** A page whose second section carries the given `kind`, so the first keeps the page alive. */
const draftWithKind = (kind: string): string[] => {
  const sections = [hero, { kind, content: { headline: 'x' } } as unknown as OutputSection]
  const result = normalizeDraft({ pages: [{ path: '/', title: 'Home', sections }] }, options())
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`)
  return result.data.dropped
}

const droppedFor = (bag: Record<string, unknown>): string[] => {
  const result = normalizeSection('hero', bag, 0)
  if (result === null) throw new Error('expected a salvageable hero')
  return result.dropped
}

describe('labelToken — the primitive', () => {
  it('passes an ordinary short token through untouched', () => {
    expect(labelToken('features')).toBe('features')
  })

  it('leaves a token exactly at the cap unmarked, so the boundary is not off by one', () => {
    const exact = 'a'.repeat(MAX_LABEL_TOKEN_LENGTH)

    expect(labelToken(exact)).toBe(exact)
  })

  it('marks a token one character past the cap, rather than shortening it silently', () => {
    const overBy1 = 'a'.repeat(MAX_LABEL_TOKEN_LENGTH + 1)

    expect(labelToken(overBy1)).toBe(`${'a'.repeat(MAX_LABEL_TOKEN_LENGTH)}${labelTokenOverCap(1)}`)
  })

  it('reports the exact number of characters it withheld', () => {
    const huge = 'k'.repeat(200_000)

    expect(labelToken(huge)).toBe(
      `${'k'.repeat(MAX_LABEL_TOKEN_LENGTH)}${labelTokenOverCap(200_000 - MAX_LABEL_TOKEN_LENGTH)}`,
    )
  })

  it('strips control, NUL, bidi and zero-width characters', () => {
    expect(labelToken(`a${NUL}b${BIDI_OVERRIDE}c${ZERO_WIDTH}d`)).toBe('abcd')
  })

  it('names a value whose every character was stripped, instead of emitting a blank label', () => {
    expect(labelToken(`${NUL}${BIDI_OVERRIDE}`)).toBe(UNNAMEABLE_TOKEN)
  })

  it('still reports the withheld count when nothing nameable survived the head', () => {
    const hidden = NUL.repeat(MAX_LABEL_TOKEN_LENGTH) + 'z'.repeat(100)

    expect(labelToken(hidden)).toBe(`${UNNAMEABLE_TOKEN}${labelTokenOverCap(100)}`)
  })

  it.each([
    ['an object, which a bare interpolation would render as [object Object]', {}],
    ['an array, whose join would smuggle its elements through', ['a', 'b']],
    ['a symbol, which a bare interpolation would throw a TypeError on', Symbol('s')],
    ['null', null],
    ['undefined', undefined],
  ])('degrades %s to the unnameable token rather than throwing', (_label, value) => {
    expect(labelToken(value)).toBe(UNNAMEABLE_TOKEN)
  })

  it('names a numeric kind, which is nameable even though it is out of union', () => {
    expect(labelToken(7)).toBe('7')
  })
})

describe('section.kind is gated like every sibling field on the entry', () => {
  it('names an ordinary out-of-union kind in full', () => {
    expect(draftWithKind('carousel')).toContain('dropped-section:/[1]:carousel')
  })

  it('bounds a 100k-character kind instead of copying it into AppError.details', () => {
    const label = draftWithKind('A'.repeat(100_000)).find((entry) =>
      entry.startsWith('dropped-section:'),
    )

    expect(label).toBeDefined()
    expect(label?.length).toBeLessThan(128)
    expect(label).toContain(labelTokenOverCap(100_000 - MAX_LABEL_TOKEN_LENGTH))
  })

  it('keeps a raw NUL and a bidi override out of the label, the logs and the UI', () => {
    const label = draftWithKind(`ca${NUL}rou${BIDI_OVERRIDE}sel`).find((entry) =>
      entry.startsWith('dropped-section:'),
    )

    expect(label).toBe('dropped-section:/[1]:carousel')
  })

  it('still names the section when the kind itself is unnameable', () => {
    expect(draftWithKind(NUL)).toContain(`dropped-section:/[1]:${UNNAMEABLE_TOKEN}`)
  })
})

describe('unknown key NAMES are bounded, not just counted', () => {
  it('names an ordinary unknown key in full', () => {
    expect(droppedFor({ headline: 'hi', tagline: 'x' })).toEqual(['tagline'])
  })

  it('bounds a 200k-character key and states how much it withheld', () => {
    const bag: Record<string, unknown> = { headline: 'hi' }
    bag['k'.repeat(200_000)] = 1

    expect(droppedFor(bag)).toEqual([
      `${'k'.repeat(MAX_LABEL_TOKEN_LENGTH)}${labelTokenOverCap(200_000 - MAX_LABEL_TOKEN_LENGTH)}`,
    ])
  })

  it('bounds the whole report, so the count cap and the length cap compose', () => {
    const bag: Record<string, unknown> = { headline: 'hi' }
    for (let index = 0; index < MAX_UNKNOWN_KEYS; index += 1) {
      bag[`${index}-${'k'.repeat(200_000)}`] = 1
    }
    const dropped = droppedFor(bag)
    const bytes = dropped.reduce((total, entry) => total + entry.length, 0)

    expect(dropped).toHaveLength(MAX_UNKNOWN_KEYS)
    expect(bytes).toBeLessThan(MAX_UNKNOWN_KEYS * 128)
  })

  it('matches a long key against the known list on its FULL name, not the shortened one', () => {
    const nearlyHeadline = `headline${'x'.repeat(200_000)}`

    expect(droppedFor({ headline: 'hi', [nearlyHeadline]: 'y' })).toHaveLength(1)
  })

  /*
   * The gate shortens the LABEL; it must never be consulted for the membership test. A key
   * spelled with an embedded NUL renders as a known key name once stripped, but it is not that
   * key: nothing ever reads its value, so it is a lost key and has to be reported as one.
   * Testing membership against the token would make it match `known` and vanish silently —
   * a value discarded with nothing said about it, which is the one outcome this package forbids.
   */
  it('reports a key that only LOOKS known once its control characters are stripped', () => {
    const disguised = `head${NUL}line`

    expect(droppedFor({ headline: 'hi', [disguised]: 'y' })).toEqual(['headline'])
  })

  it('keeps the items prefix in front of a bounded key name', () => {
    const entry: Record<string, unknown> = { title: 'Fast' }
    entry['j'.repeat(100)] = 1
    const result = normalizeSection('features', { items: [entry] }, 0)

    expect(result?.dropped).toEqual([
      `items[0].${'j'.repeat(MAX_LABEL_TOKEN_LENGTH)}${labelTokenOverCap(100 - MAX_LABEL_TOKEN_LENGTH)}`,
    ])
  })

  it('names a key made entirely of stripped characters rather than emitting a bare prefix', () => {
    expect(droppedFor({ headline: 'hi', [BIDI_OVERRIDE]: 1 })).toEqual([UNNAMEABLE_TOKEN])
  })
})

describe('the two gates compose through normalizeDraft', () => {
  it('forwards a bounded key label under the page-and-index prefix', () => {
    const bag: Record<string, unknown> = { headline: 'Breathe better' }
    bag['q'.repeat(200_000)] = 1
    const sections = [{ kind: 'hero', content: bag } as unknown as OutputSection]
    const result = normalizeDraft({ pages: [{ path: '/', title: 'Home', sections }] }, options())

    if (!result.ok) throw new Error('expected ok')
    const label = result.data.dropped.find((entry) => entry.startsWith('/[0]:'))

    expect(label?.length).toBeLessThan(128)
    expect(label).toContain(labelTokenOverCap(200_000 - MAX_LABEL_TOKEN_LENGTH))
  })
})
