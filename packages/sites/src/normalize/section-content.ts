/**
 * Tolerant per-kind normalizers for `site_sections.content`.
 *
 * The DB column is an untyped bag (`z.record(z.string(), z.unknown())`) and the mesh
 * prompt only *hints* at a shape, so model output is ADVISORY: a hero without a subhead
 * renders without one, `items` arriving as a string becomes a one-item list, and unknown
 * keys are recorded in `dropped`, never fatal. Only a section with nothing renderable
 * left returns null.
 */
import type { SectionKind } from '@sahoda/shared'
import { stripControl } from '../render/escape'

/** One bad generation must not balloon a page; extra entries are dropped by index. */
export const MAX_ITEMS = 24

export interface HeroContent {
  headline: string
  subhead?: string
  ctaLabel?: string
  ctaHref?: string
}
export interface FeatureItem {
  title: string
  body?: string
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
export interface TestimonialItem {
  quote: string
  author?: string
  role?: string
}
export interface TestimonialsContent {
  headline?: string
  items: TestimonialItem[]
}
export interface FaqItem {
  q: string
  a: string
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

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

/** Strings win; finite numbers coerce; everything else is unusable. Blank counts as absent. */
const coerceText = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = stripControl(value).trim()
    return trimmed === '' ? undefined : trimmed
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'bigint') return value.toString()
  return undefined
}

/** Read a known key, recording it in `dropped` when it was present but unusable. */
const text = (
  record: Record<string, unknown>,
  key: string,
  dropped: string[],
): string | undefined => {
  if (!(key in record)) return undefined
  const value = coerceText(record[key])
  if (value === undefined) dropped.push(key)
  return value
}

/** A single string (or number) is a one-item list; an object is a one-item list. */
const toList = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined) return []
  if (typeof value === 'string') return coerceText(value) === undefined ? [] : [value]
  if (typeof value === 'number' || typeof value === 'bigint') return [value]
  if (typeof value === 'object') return [value]
  return []
}

const collect = <T>(
  record: Record<string, unknown>,
  dropped: string[],
  build: (entry: unknown) => T | null,
): T[] => {
  const list = toList(record.items)
  if (list.length === 0) {
    if ('items' in record) dropped.push('items')
    return []
  }
  const items: T[] = []
  list.forEach((entry, index) => {
    if (items.length >= MAX_ITEMS) {
      dropped.push(`items[${index}]`)
      return
    }
    const item = build(entry)
    if (item === null) {
      dropped.push(`items[${index}]`)
      return
    }
    items.push(item)
  })
  return items
}

const featureItem = (entry: unknown): FeatureItem | null => {
  const bare = coerceText(entry)
  if (bare !== undefined) return { title: bare }
  const record = asRecord(entry)
  const title = coerceText(record.title)
  if (title === undefined) return null
  const body = coerceText(record.body)
  return { title, ...(body !== undefined && { body }) }
}

const testimonialItem = (entry: unknown): TestimonialItem | null => {
  const bare = coerceText(entry)
  if (bare !== undefined) return { quote: bare }
  const record = asRecord(entry)
  const quote = coerceText(record.quote)
  if (quote === undefined) return null
  const author = coerceText(record.author)
  const role = coerceText(record.role)
  return { quote, ...(author !== undefined && { author }), ...(role !== undefined && { role }) }
}

/** Both halves are required: a question with no answer renders nothing, so it is dropped. */
const faqItem = (entry: unknown): FaqItem | null => {
  const record = asRecord(entry)
  const q = coerceText(record.q)
  const a = coerceText(record.a)
  if (q === undefined || a === undefined) return null
  return { q, a }
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

/** null ⇒ the section is unsalvageable and is dropped. */
export const normalizeSection = (
  kind: SectionKind,
  raw: unknown,
  sort: number,
): { section: NormalizedSection; dropped: string[] } | null => {
  const record = asRecord(raw)
  const dropped: string[] = []
  const known = KNOWN_KEYS[kind]
  for (const key of Object.keys(record)) {
    if (!known.includes(key)) dropped.push(key)
  }

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
      return wrap({ kind: 'hero', content }, sort, record, dropped)
    }
    case 'features': {
      const headline = text(record, 'headline', dropped)
      const items = collect(record, dropped, featureItem)
      if (items.length === 0) return null
      const content: FeaturesContent = { ...(headline !== undefined && { headline }), items }
      return wrap({ kind: 'features', content }, sort, record, dropped)
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
      return wrap({ kind: 'offer', content }, sort, record, dropped)
    }
    case 'testimonials': {
      const headline = text(record, 'headline', dropped)
      const items = collect(record, dropped, testimonialItem)
      if (items.length === 0) return null
      const content: TestimonialsContent = { ...(headline !== undefined && { headline }), items }
      return wrap({ kind: 'testimonials', content }, sort, record, dropped)
    }
    case 'faq': {
      const headline = text(record, 'headline', dropped)
      const items = collect(record, dropped, faqItem)
      if (items.length === 0) return null
      const content: FaqContent = { ...(headline !== undefined && { headline }), items }
      return wrap({ kind: 'faq', content }, sort, record, dropped)
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
      return wrap({ kind: 'contact', content }, sort, record, dropped)
    }
  }
}
