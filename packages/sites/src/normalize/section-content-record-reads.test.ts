/**
 * Pins the record-vs-clone ruling stated at `section-content.ts`'s `stored` assignment:
 * per-kind reads run against the caller's bag, never against the defensive clone.
 *
 * A key whose value no jsonb column can hold vanishes from the clone. Reading the clone would
 * therefore report that key as ABSENT, when the honest report is PRESENT-BUT-UNUSABLE — the
 * package's whole contract for user values it could not use.
 *
 * `section-content-envelope.test.ts` already covers the UNKNOWN-key half of this (an unstorable
 * value on a key the kind does not understand, caught by `recordUnknownKeys`). That test cannot
 * see the KNOWN-key half: swapping only the `text`/`collect` reads to the clone leaves it green.
 * Every slot below is a known key.
 *
 * Only a slot on a kind that SURVIVES an unusable value is observable: when the lost key is a
 * required one the section returns null and `dropped` dies with it. That excludes `hero.headline`
 * and `offer.headline`, which are enumerated as unobservable rather than untested.
 */
import { describe, it, expect } from 'vitest'
import type { SectionKind } from '@sahoda/shared'
import { normalizeSection, rawUnstorable } from './section-content'

const SORT = 0

/** A value `structuredClone` refuses and `coerceText` cannot use — the discriminating shape. */
const unstorable = (): undefined => undefined

interface TextSlot {
  kind: SectionKind
  /** The known key under test. */
  slot: string
  /** The rest of the bag, minimal but sufficient for the section to survive. */
  rest: Record<string, unknown>
}

/**
 * Every optional known key read through `text` at the top level of `normalizeSection`,
 * across all six kinds. The `items` keys are covered by the `collect` block below.
 */
const TEXT_SLOTS: ReadonlyArray<TextSlot> = [
  { kind: 'hero', slot: 'subhead', rest: { headline: 'H' } },
  { kind: 'hero', slot: 'ctaLabel', rest: { headline: 'H' } },
  { kind: 'hero', slot: 'ctaHref', rest: { headline: 'H' } },
  { kind: 'features', slot: 'headline', rest: { items: [{ title: 'T' }] } },
  { kind: 'offer', slot: 'body', rest: { headline: 'H' } },
  { kind: 'offer', slot: 'priceNote', rest: { headline: 'H' } },
  { kind: 'offer', slot: 'ctaLabel', rest: { headline: 'H' } },
  { kind: 'offer', slot: 'ctaHref', rest: { headline: 'H' } },
  { kind: 'testimonials', slot: 'headline', rest: { items: [{ quote: 'Q' }] } },
  { kind: 'faq', slot: 'headline', rest: { items: [{ q: 'Q', a: 'A' }] } },
  { kind: 'contact', slot: 'headline', rest: {} },
  { kind: 'contact', slot: 'body', rest: {} },
  { kind: 'contact', slot: 'submitLabel', rest: {} },
]

describe('normalizeSection - a known key holding an unstorable value is reported, not called absent', () => {
  for (const { kind, slot, rest } of TEXT_SLOTS) {
    it(`reports ${kind}.${slot} as present-but-unusable, not missing`, () => {
      const raw = { ...rest, [slot]: unstorable }

      const result = normalizeSection(kind, raw, SORT)

      // The section survives: the lost key is optional, so `dropped` is observable at all.
      expect(result).not.toBeNull()
      // The key IS named. Reading the clone would report only the unstorable count.
      expect(result?.dropped).toEqual([rawUnstorable(1), slot])
      // And it really did vanish from the stored copy — which is why the read must not use it.
      expect(Object.hasOwn(result?.section.raw ?? {}, slot)).toBe(false)
    })
  }

  /*
   * The required-headline slots are unobservable by construction, not merely untested: an
   * unusable `headline` drops the whole section, and a `dropped` array attached to a null
   * section is never returned to anyone. Pinned so the enumeration is not mistaken for a gap.
   */
  for (const kind of ['hero', 'offer'] as const) {
    it(`drops the whole ${kind} section when its required headline is unusable`, () => {
      expect(normalizeSection(kind, { headline: unstorable }, SORT)).toBeNull()
    })
  }
})

interface ItemsCase {
  kind: SectionKind
  /** One entry that builds, so the section survives the unusable sibling entry. */
  keeper: Record<string, unknown>
}

const ITEMS_CASES: ReadonlyArray<ItemsCase> = [
  { kind: 'features', keeper: { title: 'Kept' } },
  { kind: 'testimonials', keeper: { quote: 'Kept' } },
  { kind: 'faq', keeper: { q: 'Kept', a: 'Answer' } },
]

/**
 * `collect` is the sibling reader of `text`, and it fails harder: an `items` array holding an
 * unstorable entry is dropped from the clone WHOLE, so a clone-read sees no list at all, finds
 * zero items, and returns null — silently discarding an entry the model did send correctly.
 */
describe('normalizeSection - collect reads items from the caller bag, not the clone', () => {
  for (const { kind, keeper } of ITEMS_CASES) {
    it(`keeps the usable ${kind} entry when a sibling entry is unstorable`, () => {
      const raw = { items: [keeper, unstorable] }

      const result = normalizeSection(kind, raw, SORT)

      // Not null: the clone lost the entire `items` key, so a clone-read would drop the section.
      expect(result).not.toBeNull()
      const content = result?.section.section.content as { items: ReadonlyArray<unknown> }
      expect(content.items).toHaveLength(1)
      expect(result?.dropped).toEqual([rawUnstorable(1), 'items[1]'])
      expect(Object.hasOwn(result?.section.raw ?? {}, 'items')).toBe(false)
    })
  }
})
