import { describe, expect, test } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD } from '@sahoda/shared'

import { BRAIN_FIELDS, DERIVED_FIELDS } from './fields'
import type { Provenance } from './provenance'
import {
  ENTITLEMENT,
  entitlementOf,
  isBlank,
  queueTally,
  resolutionQueue,
  settledFields,
} from './resolution-queue'
import { writeLeaf } from './leaf'

/** A brain nobody has confirmed anything on — what a fresh resolve produces. */
const NOTHING_CONFIRMED: Provenance = new Map(BRAIN_FIELDS.map((f) => [f.path, 'guessed']))

function confirming(...paths: string[]): Provenance {
  return new Map(
    BRAIN_FIELDS.map((f) => [f.path, paths.includes(f.path) ? 'confirmed' : 'guessed']),
  )
}

describe('resolutionQueue', () => {
  test('a freshly resolved brain puts every registered field in the queue', () => {
    const queue = resolutionQueue(DEMO_FALLBACK_PAYLOAD, NOTHING_CONFIRMED)
    expect(queue).toHaveLength(BRAIN_FIELDS.length)
  })

  /**
   * THE ORDERING RULE, and the reason the console exists as its own screen.
   *
   * `FieldKindSchema` (packages/shared, brand/audiences.ts) says of ASKED:
   * "only they know it. NEVER guessed." So a guess on an `asked` field is the
   * model answering a question the contract says it may not answer, and a guess
   * on a `negotiated` one is the field working exactly as designed. Sorting them
   * together — which registry order alone would do — flattens the single most
   * useful distinction the stored data carries.
   */
  test('unearned guesses come before the ones Sahoda is meant to draft', () => {
    const kinds = resolutionQueue(DEMO_FALLBACK_PAYLOAD, NOTHING_CONFIRMED).map(
      (entry) => entry.field.metaKind,
    )
    const firstNegotiated = kinds.indexOf('negotiated')
    expect(firstNegotiated).toBeGreaterThan(0)
    // Nothing `asked` may appear after the first `negotiated` entry.
    expect(kinds.slice(firstNegotiated)).not.toContain('asked')
  })

  test('within a kind, the registry priority order is preserved', () => {
    const queue = resolutionQueue(DEMO_FALLBACK_PAYLOAD, NOTHING_CONFIRMED)
    const asked = queue.filter((e) => e.field.metaKind === 'asked').map((e) => e.field.path)
    const registryAsked = BRAIN_FIELDS.filter((f) => f.metaKind === 'asked').map((f) => f.path)
    expect(asked).toEqual(registryAsked)
  })

  test('a confirmed field leaves the queue and appears as settled', () => {
    const provenance = confirming('hook.core_promise')
    const queue = resolutionQueue(DEMO_FALLBACK_PAYLOAD, provenance)
    expect(queue.map((e) => e.field.path)).not.toContain('hook.core_promise')

    const settled = settledFields(DEMO_FALLBACK_PAYLOAD, provenance)
    expect(settled.map((e) => e.field.path)).toEqual(['hook.core_promise'])
  })

  /**
   * A DERIVED field is a conclusion, not a question, so it must never reach a
   * screen that asks a person to stand behind it. `alignment.signal_lock` is the
   * only one in v1 and it is deliberately absent from `BRAIN_FIELDS` — this
   * asserts the queue inherits that rather than re-deriving it.
   */
  test('derived fields never enter the queue', () => {
    const paths = resolutionQueue(DEMO_FALLBACK_PAYLOAD, NOTHING_CONFIRMED).map((e) => e.field.path)
    for (const derived of DERIVED_FIELDS) {
      expect(paths).not.toContain(derived.path)
    }
  })

  /**
   * A missing section must read as blank, never crash and never invent a value.
   * `readLeaf` returns undefined for a path that names nothing, and the shape of
   * the blank has to follow the field's declared kind — handing a string to a
   * list editor is how a repair fabricates a value that was never stored.
   */
  test('a field whose section is missing reads as blank, in its own shape', () => {
    const gutted = { ...DEMO_FALLBACK_PAYLOAD, voice: undefined } as never
    const queue = resolutionQueue(gutted, NOTHING_CONFIRMED)
    const descriptor = queue.find((e) => e.field.path === 'voice.descriptor')
    const phrases = queue.find((e) => e.field.path === 'voice.signature_phrases')

    expect(descriptor?.blank).toBe(true)
    expect(descriptor?.value).toBe('')
    expect(phrases?.blank).toBe(true)
    expect(phrases?.value).toEqual([])
  })

  /**
   * A blank guess is its own situation. There is nothing to agree with, so the
   * row must be able to tell the difference — the console refuses to offer
   * Confirm on one, and excludes it from select-all.
   */
  test('an emptied field is marked blank', () => {
    const emptied = writeLeaf(DEMO_FALLBACK_PAYLOAD, 'hook.core_promise', '')
    const entry = resolutionQueue(emptied, NOTHING_CONFIRMED).find(
      (e) => e.field.path === 'hook.core_promise',
    )
    expect(entry?.blank).toBe(true)
  })
})

describe('isBlank', () => {
  test.each([
    ['', true],
    ['   ', true],
    ['a', false],
  ])('a string %s is blank: %s', (value, expected) => {
    expect(isBlank(value as string)).toBe(expected)
  })

  test('an empty list is blank; a list with entries is not', () => {
    expect(isBlank([])).toBe(true)
    expect(isBlank(['x'])).toBe(false)
  })
})

describe('queueTally', () => {
  test('splits the queue by entitlement and never double-counts', () => {
    const tally = queueTally(resolutionQueue(DEMO_FALLBACK_PAYLOAD, NOTHING_CONFIRMED))
    expect(tally.unearned + tally.proposed).toBe(tally.total)
    expect(tally.total).toBe(BRAIN_FIELDS.length)
    expect(tally.registered).toBe(BRAIN_FIELDS.length)
  })

  /**
   * The finding the page states in words, asserted at the source: a fresh brain
   * carries MORE unearned guesses than drafted ones. If a future registry change
   * flips that, the page's lead sentence stops being the interesting claim and
   * somebody should notice here rather than in a screenshot.
   */
  test('a fresh brain is mostly guesses Sahoda was not entitled to make', () => {
    const tally = queueTally(resolutionQueue(DEMO_FALLBACK_PAYLOAD, NOTHING_CONFIRMED))
    expect(tally.unearned).toBeGreaterThan(tally.proposed)
  })

  test('an empty queue tallies to zero without inventing a denominator', () => {
    const tally = queueTally([])
    expect(tally).toMatchObject({ unearned: 0, proposed: 0, total: 0 })
    expect(tally.registered).toBe(BRAIN_FIELDS.length)
  })
})

describe('entitlementOf', () => {
  test('every registered field has an entitlement line and a group heading', () => {
    for (const field of BRAIN_FIELDS) {
      expect(entitlementOf(field).line.length).toBeGreaterThan(0)
      expect(entitlementOf(field).heading.length).toBeGreaterThan(0)
    }
  })

  /**
   * THE HONESTY GUARD ON THE "WHY".
   *
   * Nothing links a field to a passage of the customer's document — the mesh
   * gets the whole text and returns all fifteen fields at once. So no
   * entitlement line may imply a per-field source. This asserts the CLAIM, not
   * the wording: rewrite either sentence freely, but neither may start pointing
   * at a website, a page or a file.
   */
  test('no entitlement line claims a per-field source', () => {
    const forbidden =
      /\b(from|on) your (site|website|page|pdf|document)|we (read|found) (this|it) (in|on|at)|based on your (site|website|pdf)/i
    for (const entitlement of Object.values(ENTITLEMENT)) {
      expect(entitlement.line).not.toMatch(forbidden)
      expect(entitlement.heading).not.toMatch(forbidden)
      expect(entitlement.label).not.toMatch(forbidden)
    }
  })

  test('the per-field-source matcher recognises a claim that would be dishonest', () => {
    // The guard shown biting: a plausible line somebody could write next week.
    expect('Sahoda inferred this from your website.').toMatch(
      /\b(from|on) your (site|website|page|pdf|document)/i,
    )
  })
})
