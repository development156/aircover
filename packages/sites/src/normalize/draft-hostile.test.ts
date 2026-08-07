import { describe, it, expect } from 'vitest'
import type { SiteGenerateOutput } from '@sahoda/shared'
import { normalizeDraft } from './draft'
import type { NormalizeOptions } from './draft'

/**
 * The untrusted generator-output boundary. `normalizeDraft` returns a `Result` precisely so a
 * hostile shape is DATA, not an exception -- a raw `TypeError` escaping the envelope is the leak
 * this suite pins shut. `SiteGenerateOutputSchema` is a reader's schema the producer never runs,
 * so `output.pages` and every `entry.sections` arrive typed but unvalidated. Each shape below is
 * constructed, and the contract is: an honest `VALIDATION_ERROR` Result, never a throw.
 *
 * A `null` check alone is NOT enough and the string case proves it: `abc`.length reads 3 and
 * `abc`.slice(...) returns a string, so a null-guarded read survives all the way to
 * `.forEach is not a function`. The guard is `Array.isArray`.
 */

const TRACE_ID = 'trace-sites-hostile'

const options = (overrides: Partial<NormalizeOptions> = {}): NormalizeOptions => ({
  name: 'Acme Yoga',
  maxPages: 5,
  traceId: TRACE_ID,
  ...overrides,
})

const hostile = (value: unknown): SiteGenerateOutput => value as SiteGenerateOutput

/** Every non-array shape `output.pages` can take, plus a hostile `output` itself. */
const PAGES_SHAPES: ReadonlyArray<readonly [string, unknown]> = [
  ['null', { pages: null }],
  ['undefined (missing pages)', {}],
  ['a string', { pages: 'abc' }],
  ['a number', { pages: 7 }],
  ['a boolean', { pages: true }],
  ['an object where an array is expected', { pages: { 0: 'x' } }],
  ['a null output', null],
  ['a string output', 'abc'],
  ['a number output', 7],
]

describe('normalizeDraft -- hostile output.pages never throws out of the Result', () => {
  for (const [label, value] of PAGES_SHAPES) {
    it(`returns a VALIDATION_ERROR for ${label}, without throwing`, () => {
      let result: ReturnType<typeof normalizeDraft> | undefined
      expect(() => {
        result = normalizeDraft(hostile(value), options())
      }).not.toThrow()
      expect(result?.ok).toBe(false)
      if (result && !result.ok) {
        expect(result.error.code).toBe('VALIDATION_ERROR')
      }
    })
  }

  it('still carries the gated name/goal labels on the failure details', () => {
    const overLongGoal = 'g'.repeat(5000)
    const result = normalizeDraft(hostile({ pages: null }), options({ goal: overLongGoal }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const dropped = (result.error.details as { dropped: string[] }).dropped
      expect(dropped).toContain('unusable-goal')
    }
  })
})

/** Every non-array shape a single `entry.sections` can take. */
const SECTIONS_SHAPES: ReadonlyArray<readonly [string, unknown]> = [
  ['null', null],
  ['a string', 'abc'],
  ['a number', 7],
  ['a boolean', true],
  ['an object where an array is expected', { 0: { kind: 'hero', content: {} } }],
]

const pageWith = (sections: unknown): unknown => ({ path: '/', title: 'Home', sections })

describe('normalizeDraft -- hostile entry.sections is dropped, never thrown', () => {
  for (const [label, value] of SECTIONS_SHAPES) {
    it(`drops the sole page whose sections is ${label} and returns err`, () => {
      let result: ReturnType<typeof normalizeDraft> | undefined
      expect(() => {
        result = normalizeDraft(hostile({ pages: [pageWith(value)] }), options())
      }).not.toThrow()
      expect(result?.ok).toBe(false)
      if (result && !result.ok) {
        expect(result.error.code).toBe('VALIDATION_ERROR')
      }
    })
  }

  it('a missing sections key is the same as a null one: the page is dropped, not thrown', () => {
    let result: ReturnType<typeof normalizeDraft> | undefined
    expect(() => {
      result = normalizeDraft(hostile({ pages: [{ path: '/', title: 'Home' }] }), options())
    }).not.toThrow()
    expect(result?.ok).toBe(false)
  })

  it('drops only the malformed page and keeps a valid sibling, naming the loss', () => {
    const valid = {
      path: '/',
      title: 'Home',
      sections: [{ kind: 'hero', content: { headline: 'Hi' } }],
    }
    const malformed = { path: '/about', title: 'About', sections: null }
    const result = normalizeDraft(hostile({ pages: [valid, malformed] }), options({ maxPages: 5 }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.draft.pages).toHaveLength(1)
      expect(result.data.dropped.some((label) => label.startsWith('invalid-sections:'))).toBe(true)
    }
  })
})

/** A page ELEMENT that is not an object also reaches property access unguarded. */
const PAGE_ELEMENT_SHAPES: ReadonlyArray<readonly [string, unknown]> = [
  ['null', null],
  ['undefined', undefined],
  ['a string', 'abc'],
  ['a number', 7],
  ['a boolean', true],
  ['an array where an object is expected', []],
]

describe('normalizeDraft -- a hostile page element never throws out of the Result', () => {
  for (const [label, value] of PAGE_ELEMENT_SHAPES) {
    it(`drops the sole page element that is ${label} and returns err`, () => {
      let result: ReturnType<typeof normalizeDraft> | undefined
      expect(() => {
        result = normalizeDraft(hostile({ pages: [value] }), options())
      }).not.toThrow()
      expect(result?.ok).toBe(false)
      if (result && !result.ok) {
        expect(result.error.code).toBe('VALIDATION_ERROR')
      }
    })
  }
})
