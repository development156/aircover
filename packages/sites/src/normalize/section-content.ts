/**
 * Tolerant per-kind normalizers for `site_sections.content`.
 *
 * The DB column is an untyped bag (`z.record(z.string(), z.unknown())`) and the mesh
 * prompt only *hints* at a shape, so model output is ADVISORY: a hero without a subhead
 * renders without one, `items` arriving as a string becomes a one-item list, and unknown
 * keys are recorded in `dropped`, never fatal. Only a section with nothing renderable
 * left returns null.
 *
 * `dropped` reports LOST KEYS, not MODIFIED VALUES — see `section-coerce.ts`.
 */
import type { SectionKind } from '@sahoda/shared'
import { cloneBag, recordUnknownKeys, text, toRecord } from './section-coerce'
import {
  collect,
  faqItem,
  featureItem,
  testimonialItem,
  type FaqItem,
  type FeatureItem,
  type TestimonialItem,
} from './section-items'

export { MAX_ITEMS, itemsOverCap } from './section-items'
export {
  MAX_LABEL_TOKEN_LENGTH,
  MAX_TEXT_LENGTH,
  MAX_UNKNOWN_KEYS,
  UNNAMEABLE_TOKEN,
  labelToken,
  labelTokenOverCap,
  rawUnstorable,
  unknownKeysOverCap,
} from './section-coerce'
export type { FaqItem, FeatureItem, TestimonialItem }

/**
 * Reported in `dropped` when `raw` itself was unusable — a scalar, an array, anything that
 * cannot carry keys. The whole bag was discarded, so no per-key label could be produced.
 */
export const ROOT_DROPPED = '(root)'

export interface HeroContent {
  headline: string
  subhead?: string
  ctaLabel?: string
  ctaHref?: string
}
export interface FeaturesContent {
  headline?: string
  items: FeatureItem[]
}
export interface OfferContent {
  headline: string
  body?: string
  priceNote?: string
  ctaLabel?: string
  ctaHref?: string
}
export interface TestimonialsContent {
  headline?: string
  items: TestimonialItem[]
}
export interface FaqContent {
  headline?: string
  items: FaqItem[]
}
export interface ContactContent {
  headline?: string
  body?: string
  submitLabel?: string
}

export type SectionContent =
  | { kind: 'hero'; content: HeroContent }
  | { kind: 'features'; content: FeaturesContent }
  | { kind: 'offer'; content: OfferContent }
  | { kind: 'testimonials'; content: TestimonialsContent }
  | { kind: 'faq'; content: FaqContent }
  | { kind: 'contact'; content: ContactContent }

export interface NormalizedSection {
  section: SectionContent
  sort: number
  /** A defensive copy of the model's bag — never the caller's object. See `cloneBag`. */
  raw: Record<string, unknown>
}

/** Keys this package understands per kind. Anything else lands in `dropped`. */
const KNOWN_KEYS: Record<SectionKind, readonly string[]> = {
  hero: ['headline', 'subhead', 'ctaLabel', 'ctaHref'],
  features: ['headline', 'items'],
  offer: ['headline', 'body', 'priceNote', 'ctaLabel', 'ctaHref'],
  testimonials: ['headline', 'items'],
  faq: ['headline', 'items'],
  contact: ['headline', 'body', 'submitLabel'],
}

const wrap = (
  section: SectionContent,
  sort: number,
  raw: Record<string, unknown>,
  dropped: string[],
): { section: NormalizedSection; dropped: string[] } => ({
  section: { section, sort, raw },
  dropped,
})

/**
 * null ⇒ the section is unsalvageable and is dropped.
 *
 * `kind` is typed but arrives from `site_sections.kind`, a text column — an out-of-union
 * value is a dropped section, never a thrown error that takes the whole draft down.
 *
 * The lookup is gated on {@link Object.hasOwn} rather than on the result being `undefined`:
 * `'constructor'`, `'toString'`, `'__proto__'`, `'valueOf'` and `'hasOwnProperty'` all resolve
 * to truthy non-arrays through the prototype chain, so an `=== undefined` guard would let them
 * past and `known.includes` would throw — the exact whole-draft failure this contract forbids.
 */
export const normalizeSection = (
  kind: SectionKind,
  raw: unknown,
  sort: number,
): { section: NormalizedSection; dropped: string[] } | null => {
  if (!Object.hasOwn(KNOWN_KEYS, kind)) return null
  const known: readonly string[] = KNOWN_KEYS[kind]

  const bag = toRecord(raw)
  const record = bag ?? {}
  const dropped: string[] = []
  if (bag === null && raw !== null && raw !== undefined) dropped.push(ROOT_DROPPED)
  /*
   * Reads run against the caller's bag — only strings ever leave them, so nothing is aliased —
   * while `stored` is the copy that outlives the call on `NormalizedSection.raw`. Reading the
   * copy instead would be quietly wrong: a key holding an unstorable value vanishes from the
   * clone, and a vanished key is reported as absent rather than as present-but-unusable.
   */
  const stored = bag === null ? {} : cloneBag(bag, dropped)
  recordUnknownKeys(record, known, dropped)

  switch (kind) {
    case 'hero': {
      const headline = text(record, 'headline', dropped)
      if (headline === undefined) return null
      const subhead = text(record, 'subhead', dropped)
      const ctaLabel = text(record, 'ctaLabel', dropped)
      const ctaHref = text(record, 'ctaHref', dropped)
      const content: HeroContent = {
        headline,
        ...(subhead !== undefined && { subhead }),
        ...(ctaLabel !== undefined && { ctaLabel }),
        ...(ctaHref !== undefined && { ctaHref }),
      }
      return wrap({ kind: 'hero', content }, sort, stored, dropped)
    }
    case 'features': {
      const headline = text(record, 'headline', dropped)
      const items = collect(record, dropped, featureItem)
      if (items.length === 0) return null
      const content: FeaturesContent = { ...(headline !== undefined && { headline }), items }
      return wrap({ kind: 'features', content }, sort, stored, dropped)
    }
    case 'offer': {
      const headline = text(record, 'headline', dropped)
      if (headline === undefined) return null
      const body = text(record, 'body', dropped)
      const priceNote = text(record, 'priceNote', dropped)
      const ctaLabel = text(record, 'ctaLabel', dropped)
      const ctaHref = text(record, 'ctaHref', dropped)
      const content: OfferContent = {
        headline,
        ...(body !== undefined && { body }),
        ...(priceNote !== undefined && { priceNote }),
        ...(ctaLabel !== undefined && { ctaLabel }),
        ...(ctaHref !== undefined && { ctaHref }),
      }
      return wrap({ kind: 'offer', content }, sort, stored, dropped)
    }
    case 'testimonials': {
      const headline = text(record, 'headline', dropped)
      const items = collect(record, dropped, testimonialItem)
      if (items.length === 0) return null
      const content: TestimonialsContent = { ...(headline !== undefined && { headline }), items }
      return wrap({ kind: 'testimonials', content }, sort, stored, dropped)
    }
    case 'faq': {
      const headline = text(record, 'headline', dropped)
      const items = collect(record, dropped, faqItem)
      if (items.length === 0) return null
      const content: FaqContent = { ...(headline !== undefined && { headline }), items }
      return wrap({ kind: 'faq', content }, sort, stored, dropped)
    }
    case 'contact': {
      const headline = text(record, 'headline', dropped)
      const body = text(record, 'body', dropped)
      const submitLabel = text(record, 'submitLabel', dropped)
      const content: ContactContent = {
        ...(headline !== undefined && { headline }),
        ...(body !== undefined && { body }),
        ...(submitLabel !== undefined && { submitLabel }),
      }
      return wrap({ kind: 'contact', content }, sort, stored, dropped)
    }
    default:
      return null
  }
}
