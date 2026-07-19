import { describe, it, expect } from 'vitest'
import {
  MAX_ITEMS,
  MAX_TEXT_LENGTH,
  MAX_UNKNOWN_KEYS,
  itemsOverCap,
  normalizeSection,
  unknownKeysOverCap,
} from './section-content'

const SORT = 0

/**
 * The caps are a memory bound on untrusted model output, so their VALUES are part of the
 * contract, not an implementation detail. A test that derives its fixtures from the constant
 * survives any change to it; these do not.
 */
describe('normalize caps — declared values', () => {
  it('pins MAX_ITEMS', () => {
    expect(MAX_ITEMS).toBe(24)
  })

  it('pins MAX_TEXT_LENGTH', () => {
    expect(MAX_TEXT_LENGTH).toBe(4096)
  })

  it('pins MAX_UNKNOWN_KEYS', () => {
    expect(MAX_UNKNOWN_KEYS).toBe(32)
  })
})

describe('normalizeSection — MAX_ITEMS bounds entries SCANNED, not entries kept', () => {
  it('stops scanning at MAX_ITEMS even when every entry is unusable, so dropped stays bounded', () => {
    // A cap on the accumulator never fires for a list of junk: nothing is ever kept, so the
    // loop runs to the end and `dropped` grows one string per entry. The bound has to be on
    // the input.
    const junk = Array.from({ length: 5_000 }, () => null)
    const items = [{ title: 'Keep' }, ...junk]

    const result = normalizeSection('features', { items }, SORT)

    expect(result?.section.section).toEqual({
      kind: 'features',
      content: { items: [{ title: 'Keep' }] },
    })
    expect(result?.dropped).toEqual([
      ...Array.from({ length: MAX_ITEMS - 1 }, (_unused, index) => `items[${index + 1}]`),
      itemsOverCap(items.length - MAX_ITEMS),
    ])
  })

  it('reports entries past the cap as one count-bearing label, never one label each', () => {
    const items = Array.from({ length: MAX_ITEMS + 3 }, (_unused, index) => ({
      title: `Feature ${index}`,
    }))

    const result = normalizeSection('features', { items }, SORT)

    expect(result?.section.section.content).toEqual({ items: items.slice(0, MAX_ITEMS) })
    expect(result?.dropped).toEqual([itemsOverCap(3)])
  })

  it('says nothing about a cap a list exactly reached', () => {
    const items = Array.from({ length: MAX_ITEMS }, (_unused, index) => ({
      title: `Feature ${index}`,
    }))

    const result = normalizeSection('features', { items }, SORT)

    expect(result?.section.section.content).toEqual({ items })
    expect(result?.dropped).toEqual([])
  })
})

describe('normalizeSection — MAX_TEXT_LENGTH', () => {
  it('keeps copy exactly at the cap', () => {
    const headline = 'x'.repeat(MAX_TEXT_LENGTH)

    const result = normalizeSection('hero', { headline }, SORT)

    expect(result?.section.section).toEqual({ kind: 'hero', content: { headline } })
    expect(result?.dropped).toEqual([])
  })

  it('rejects an over-long optional field rather than shipping a truncated half-sentence', () => {
    const result = normalizeSection(
      'offer',
      { headline: 'Launch plan', body: 'x'.repeat(MAX_TEXT_LENGTH + 1) },
      SORT,
    )

    expect(result?.section.section).toEqual({ kind: 'offer', content: { headline: 'Launch plan' } })
    expect(result?.dropped).toEqual(['body'])
  })

  it('drops the whole section when the required field is over the cap', () => {
    expect(normalizeSection('hero', { headline: 'x'.repeat(MAX_TEXT_LENGTH + 1) }, SORT)).toBeNull()
  })

  /*
   * A bigint is unbounded in a way a string is not — it carries no `.length` until it is
   * stringified — so the cap has to be re-applied to the digits. Both sides are pinned so a
   * `>` → `>=` flip is caught as well as the gate being removed outright.
   */
  it('keeps a bigint whose digits land exactly on the cap', () => {
    const digits = '1'.repeat(MAX_TEXT_LENGTH)

    const result = normalizeSection('offer', { headline: BigInt(digits) }, SORT)

    expect(result?.section.section).toEqual({ kind: 'offer', content: { headline: digits } })
    expect(result?.dropped).toEqual([])
  })

  it('rejects a bigint one digit past the cap instead of stringifying it unbounded', () => {
    const over = BigInt('1'.repeat(MAX_TEXT_LENGTH + 1))

    const result = normalizeSection('offer', { headline: 'Launch plan', priceNote: over }, SORT)

    expect(result?.section.section).toEqual({ kind: 'offer', content: { headline: 'Launch plan' } })
    expect(result?.dropped).toEqual(['priceNote'])
  })

  it('applies the cap inside a list entry too', () => {
    const result = normalizeSection(
      'features',
      { items: [{ title: 'Keep', body: 'x'.repeat(MAX_TEXT_LENGTH + 1) }] },
      SORT,
    )

    expect(result?.section.section).toEqual({
      kind: 'features',
      content: { items: [{ title: 'Keep' }] },
    })
    expect(result?.dropped).toEqual(['items[0].body'])
  })

  it('caps on the string as received, before the control-character scan runs over it', () => {
    // The gate exists so a 50MB value never reaches three global regexes. A string that
    // would only fit AFTER stripping is still over the cap.
    const headline = `${'x'.repeat(MAX_TEXT_LENGTH)}\u0000`

    expect(normalizeSection('hero', { headline }, SORT)).toBeNull()
  })
})

describe('normalizeSection — MAX_UNKNOWN_KEYS', () => {
  it('stops enumerating unknown keys at the cap and reports the remainder as a count', () => {
    const raw: Record<string, unknown> = { headline: 'H' }
    for (let index = 0; index < 200; index += 1) raw[`junk${index}`] = index

    const result = normalizeSection('hero', raw, SORT)

    expect(result?.dropped).toEqual([
      ...Array.from({ length: MAX_UNKNOWN_KEYS }, (_unused, index) => `junk${index}`),
      unknownKeysOverCap(200 - MAX_UNKNOWN_KEYS),
    ])
  })

  it('says nothing about a cap a bag never reached', () => {
    const result = normalizeSection('hero', { headline: 'H', junk: 1 }, SORT)

    expect(result?.dropped).toEqual(['junk'])
  })

  it('never lets the unknown-key cap hide a known field', () => {
    const raw: Record<string, unknown> = {}
    for (let index = 0; index < 200; index += 1) raw[`junk${index}`] = index
    raw.headline = 'Survives'

    const result = normalizeSection('hero', raw, SORT)

    expect(result?.section.section).toEqual({ kind: 'hero', content: { headline: 'Survives' } })
  })

  it('caps unknown keys inside a list entry under the same rule', () => {
    const entry: Record<string, unknown> = { title: 'Keep' }
    for (let index = 0; index < 40; index += 1) entry[`junk${index}`] = index

    const result = normalizeSection('features', { items: [entry] }, SORT)

    expect(result?.dropped).toEqual([
      ...Array.from({ length: MAX_UNKNOWN_KEYS }, (_unused, index) => `items[0].junk${index}`),
      `items[0].${unknownKeysOverCap(40 - MAX_UNKNOWN_KEYS)}`,
    ])
  })
})
