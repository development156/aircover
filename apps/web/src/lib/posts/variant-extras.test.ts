import { CONSTRAINTS } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import {
  gbpCtaTypes,
  isValidGbpCta,
  keywordBracketsOn,
  parseExtras,
  VariantExtrasSchema,
} from './variant-extras'

describe('parseExtras', () => {
  test('round-trips a fully populated extras object unchanged', () => {
    const extras = {
      hashtags: ['#chai', '#books'],
      gbpCta: 'BOOK',
      ctaUrl: 'https://example.com/book',
      offer: '10% off before noon',
    }

    expect(parseExtras(extras)).toEqual(extras)
  })

  test('accepts an empty object and every field being absent', () => {
    expect(parseExtras({})).toEqual({})
  })

  test('returns {} for null, undefined, strings, numbers and arrays', () => {
    expect(parseExtras(null)).toEqual({})
    expect(parseExtras(undefined)).toEqual({})
    expect(parseExtras('BOOK')).toEqual({})
    expect(parseExtras(42)).toEqual({})
    expect(parseExtras(['hashtags'])).toEqual({})
  })

  test('preserves unknown keys written by another lane', () => {
    // The whole point: extras is shared untyped jsonb. A read-modify-write
    // round-trip in apps/web must not silently delete the publishing lane's keys.
    const raw = { gbpCta: 'BOOK', publishAttemptId: 'abc-123', nested: { deep: true } }

    expect(parseExtras(raw)).toEqual(raw)
  })

  test('drops only the invalid known field and keeps the rest, including unknown keys', () => {
    // hashtags is the wrong type, but that must not cost us gbpCta or another
    // lane's key. Salvage beats all-or-nothing because this is shared storage.
    const result = parseExtras({
      hashtags: 'not-an-array',
      gbpCta: 'ORDER',
      publishAttemptId: 'abc-123',
    })

    expect(result).toEqual({ gbpCta: 'ORDER', publishAttemptId: 'abc-123' })
    expect(result).not.toHaveProperty('hashtags')
  })

  test('drops hashtags when the array holds non-strings', () => {
    expect(parseExtras({ hashtags: ['#ok', 7], offer: 'free chai' })).toEqual({
      offer: 'free chai',
    })
  })

  test('does not mutate its input', () => {
    const raw = { hashtags: 'not-an-array', gbpCta: 'BOOK' }
    const snapshot = { ...raw }

    parseExtras(raw)

    expect(raw).toEqual(snapshot)
  })

  test('returns a fresh array rather than aliasing the caller hashtags', () => {
    const raw = { hashtags: ['#chai'] }
    const result = parseExtras(raw)

    expect(result.hashtags).toEqual(['#chai'])
    expect(result.hashtags).not.toBe(raw.hashtags)
  })

  test('never throws and never leaks internals on hostile input', () => {
    const hostile: unknown[] = [
      Symbol('x'),
      () => 'nope',
      Number.NaN,
      new Date(),
      { __proto__: { polluted: true } },
      { hashtags: { length: 1 } },
      JSON.parse('{"__proto__": {"polluted": true}}'),
    ]

    for (const input of hostile) {
      const result = parseExtras(input)
      expect(typeof result).toBe('object')
      // No prototype pollution reached Object.prototype.
      expect({}).not.toHaveProperty('polluted')
      // Output carries no zod issue text, SQL, or stack traces.
      expect(JSON.stringify(result)).not.toMatch(
        /invalid_type|ZodError|at Object\.|select |expected/i,
      )
    }
  })

  test('never throws when a salvaged object carries Object.prototype key names', () => {
    // Regression: the salvage loop used `key in FIELD_SCHEMAS`, which walks the
    // prototype chain, so a stored key called `toString` resolved to
    // Object.prototype.toString and blew up on `.safeParse`. Reaching salvage
    // needs BOTH an invalid declared field AND the poisoned key.
    for (const poisoned of ['toString', 'constructor', 'valueOf', 'hasOwnProperty']) {
      const raw = { hashtags: 'not-an-array', [poisoned]: 'lane-value', gbpCta: 'BOOK' }

      expect(() => parseExtras(raw)).not.toThrow()
      expect(parseExtras(raw)).toEqual({ [poisoned]: 'lane-value', gbpCta: 'BOOK' })
    }
  })

  test('drops a stored __proto__ key instead of reassigning the result prototype', () => {
    // The clean path (zod loose) drops __proto__, so salvage must agree rather
    // than hand back an object with an attacker-supplied prototype.
    const raw = JSON.parse(
      '{"hashtags": "not-an-array", "__proto__": {"polluted": true}}',
    ) as unknown
    const result = parseExtras(raw)

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(result).not.toHaveProperty('polluted')
    expect({}).not.toHaveProperty('polluted')
  })

  test('accepts a gbpCta the engine would reject, because shape validation is not value validation', () => {
    // Pinned limitation: parseExtras only checks types. Callers must run
    // isValidGbpCta before publishing. A future tightening must change this test.
    expect(parseExtras({ gbpCta: 'TELEPORT' })).toEqual({ gbpCta: 'TELEPORT' })
  })
})

describe('VariantExtrasSchema', () => {
  test('is loose, so a direct parse also keeps unknown keys', () => {
    const parsed = VariantExtrasSchema.parse({ gbpCta: 'SHOP', lanePrivate: 1 })

    expect(parsed).toEqual({ gbpCta: 'SHOP', lanePrivate: 1 })
  })

  test('rejects a wrongly typed known field', () => {
    expect(VariantExtrasSchema.safeParse({ hashtags: 'no' }).success).toBe(false)
  })
})

describe('gbpCtaTypes', () => {
  test('returns exactly the CTA codes the frozen engine declares for GBP', () => {
    expect(gbpCtaTypes()).toEqual(CONSTRAINTS.gbp.gbp?.ctaTypes)
    expect(gbpCtaTypes()).toEqual(['BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL'])
  })

  test('returns a copy so a caller cannot mutate the engine constants', () => {
    const first = gbpCtaTypes()
    first.push('TELEPORT')

    expect(gbpCtaTypes()).not.toContain('TELEPORT')
    expect(CONSTRAINTS.gbp.gbp?.ctaTypes).not.toContain('TELEPORT')
  })
})

describe('isValidGbpCta', () => {
  test('accepts every CTA code the engine declares', () => {
    for (const cta of gbpCtaTypes()) {
      expect(isValidGbpCta(cta)).toBe(true)
    }
  })

  test('rejects a CTA code the engine does not declare', () => {
    expect(isValidGbpCta('TELEPORT')).toBe(false)
    expect(isValidGbpCta('')).toBe(false)
  })

  test('is case sensitive, because the GBP API expects the exact uppercase code', () => {
    expect(isValidGbpCta('BOOK')).toBe(true)
    expect(isValidGbpCta('book')).toBe(false)
    expect(isValidGbpCta('Book')).toBe(false)
  })

  test('rejects padded input rather than trimming it', () => {
    // Pinned: no normalisation. Callers own trimming so a stray space in stored
    // data surfaces as a validation failure instead of being silently repaired.
    expect(isValidGbpCta(' BOOK ')).toBe(false)
  })

  test('does not fall through to Object.prototype members', () => {
    expect(isValidGbpCta('toString')).toBe(false)
    expect(isValidGbpCta('constructor')).toBe(false)
  })
})

/**
 * ── THE DEFAULT THAT DECIDES WHAT EVERY EXISTING POST PUBLISHES ─────────────
 *
 * `keywordBrackets` is absent on every row written before the tick box existed,
 * and all of those publish WITH brackets (REQUESTS §34/§35). Absence must read
 * as true.
 *
 * THIS TEST EXISTS BECAUSE A MUTATION SURVIVED. The reading lived inline in
 * `version-card.tsx` as `state.extras.keywordBrackets !== false`; flipping it to
 * `=== true` — which strips the brackets from every post ever written — left
 * every suite in the repository green. Nothing rendered the card and nothing
 * else could see the line. It is a named function now so it has somewhere to be
 * tested.
 */
describe('keywordBracketsOn — absence means brackets', () => {
  test('absent reads as ON, so nothing already written changes', () => {
    expect(keywordBracketsOn({})).toBe(true)
  })

  test('an explicit false reads as OFF, which is the only way to turn them off', () => {
    expect(keywordBracketsOn({ keywordBrackets: false })).toBe(false)
  })

  test('an explicit true reads as ON', () => {
    expect(keywordBracketsOn({ keywordBrackets: true })).toBe(true)
  })

  test('survives a round trip through the parser', () => {
    // `extras` is untyped jsonb and every save is a read-modify-write. A flag
    // that parsed away would silently re-enable brackets on the next save.
    expect(keywordBracketsOn(parseExtras({ keywordBrackets: false }))).toBe(false)
    expect(keywordBracketsOn(parseExtras({}))).toBe(true)
  })
})

/**
 * ── WHAT DECLARING THE FIELD ACTUALLY BUYS ──────────────────────────────────
 *
 * A mutation asked the question: deleting `keywordBrackets` from the schema left
 * every test AND the typecheck green, because `VariantExtrasSchema` is loose on
 * purpose (unknown keys pass through untouched, so one lane's save cannot delete
 * another's data) and the inferred type is permissive to match.
 *
 * So the declaration is not documentation. It is the only thing that RUNTIME
 * TYPE-CHECKS the value, and the case that matters is a non-boolean: `"false"`
 * as a string reads as `!== false`, which turns the brackets back ON for a
 * writer who turned them off. `extras` is jsonb written by more than one lane,
 * so a wrong-typed value is reachable rather than theoretical.
 */
describe('keywordBrackets is type-checked on the way in', () => {
  test('a STRING "false" is not allowed to masquerade as the flag', () => {
    const parsed = parseExtras({ keywordBrackets: 'false' })

    // Salvaged away by the declared field schema rather than kept as a string.
    expect(parsed.keywordBrackets).toBeUndefined()
    // And the reading therefore falls back to the safe default rather than to
    // a truthy string that happens to spell the opposite.
    expect(keywordBracketsOn(parsed)).toBe(true)
  })

  test('a real boolean survives, so the salvage is not just deleting things', () => {
    expect(parseExtras({ keywordBrackets: false }).keywordBrackets).toBe(false)
  })

  test('and the rest of extras is untouched by that salvage', () => {
    // The loose-schema contract: one bad field must not take its neighbours with
    // it, because `extras` is a single column that several lanes write to.
    const parsed = parseExtras({ keywordBrackets: 'false', hashtags: ['[chai]'] })

    expect(parsed.hashtags).toEqual(['[chai]'])
  })
})
