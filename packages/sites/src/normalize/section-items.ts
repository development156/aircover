/**
 * List entries for the `items`-bearing section kinds.
 *
 * Every builder reports into the same `dropped` array the top level uses, with an
 * `items[i].` prefix, so a key lost *inside* an entry is as visible as one lost at the top.
 * An entry that cannot be built at all is reported once as `items[i]` and its own keys are
 * NOT enumerated — the whole entry is already accounted for.
 *
 * See `section-coerce.ts` for what `dropped` does and does not promise.
 */
import { coerceText, own, recordUnknownKeys, text, toRecord } from './section-coerce'

/**
 * One bad generation must not balloon a page — nor the drop report. This bounds the entries
 * **scanned**, not the entries kept: a cap on the accumulator never fires for a list whose
 * entries are all unusable, so a million junk entries would be walked in full and named one by
 * one in `dropped`.
 */
export const MAX_ITEMS = 24

/** Stands in for every entry past {@link MAX_ITEMS}, which is never scanned and never named. */
export const itemsOverCap = (count: number): string => `items[+${count}]`

export interface FeatureItem {
  title: string
  body?: string
}
export interface TestimonialItem {
  quote: string
  author?: string
  role?: string
}
export interface FaqItem {
  q: string
  a: string
}

/** Keys this package understands inside an `items` entry, per kind. */
const KNOWN_ITEM_KEYS = {
  features: ['title', 'body'],
  testimonials: ['quote', 'author', 'role'],
  faq: ['q', 'a'],
} as const satisfies Record<string, readonly string[]>

/** Builds one list entry, or null when nothing renderable is left. */
type ItemBuilder<T> = (entry: unknown, index: number, dropped: string[]) => T | null

/**
 * A single scalar is a one-item list; a lone entry object is a one-item list.
 *
 * A blank string used to be filtered here. It is not any more: the builders reject a blank
 * entry, the resulting empty list drops the whole section, and a `dropped` array that dies with
 * that section is unobservable — so the branch could not change any outcome a caller can see.
 * Same ruling as the unreachable `dropped.push('items')` batch 1 deleted: a guard that only
 * looks like honesty is worse than no guard.
 */
const toList = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined) return []
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return [value]
  }
  if (typeof value === 'object') return [value]
  return []
}

/**
 * An empty list is not reported here: every caller returns null for a section with no
 * items, so the whole section — not the `items` key — is what the draft normalizer reports.
 *
 * Entries past {@link MAX_ITEMS} are never looked at, so they cannot be named individually;
 * they are reported once as a count. Naming them would only move the unboundedness from the
 * list into `dropped`.
 */
export const collect = <T>(
  record: Record<string, unknown>,
  dropped: string[],
  build: ItemBuilder<T>,
): T[] => {
  const list = toList(own(record, 'items'))
  const scanned = list.length > MAX_ITEMS ? list.slice(0, MAX_ITEMS) : list
  const items: T[] = []
  for (const [index, entry] of scanned.entries()) {
    const item = build(entry, index, dropped)
    if (item === null) {
      dropped.push(`items[${index}]`)
      continue
    }
    items.push(item)
  }
  if (list.length > MAX_ITEMS) dropped.push(itemsOverCap(list.length - MAX_ITEMS))
  return items
}

export const featureItem: ItemBuilder<FeatureItem> = (entry, index, dropped) => {
  const bare = coerceText(entry)
  if (bare !== undefined) return { title: bare }
  const record = toRecord(entry)
  if (record === null) return null
  const title = coerceText(own(record, 'title'))
  if (title === undefined) return null

  const prefix = `items[${index}].`
  recordUnknownKeys(record, KNOWN_ITEM_KEYS.features, dropped, prefix)
  const body = text(record, 'body', dropped, prefix)
  return { title, ...(body !== undefined && { body }) }
}

export const testimonialItem: ItemBuilder<TestimonialItem> = (entry, index, dropped) => {
  const bare = coerceText(entry)
  if (bare !== undefined) return { quote: bare }
  const record = toRecord(entry)
  if (record === null) return null
  const quote = coerceText(own(record, 'quote'))
  if (quote === undefined) return null

  const prefix = `items[${index}].`
  recordUnknownKeys(record, KNOWN_ITEM_KEYS.testimonials, dropped, prefix)
  const author = text(record, 'author', dropped, prefix)
  const role = text(record, 'role', dropped, prefix)
  return { quote, ...(author !== undefined && { author }), ...(role !== undefined && { role }) }
}

/** Both halves are required: a question with no answer renders nothing, so it is dropped. */
export const faqItem: ItemBuilder<FaqItem> = (entry, index, dropped) => {
  const record = toRecord(entry)
  if (record === null) return null
  const q = coerceText(own(record, 'q'))
  const a = coerceText(own(record, 'a'))
  if (q === undefined || a === undefined) return null

  recordUnknownKeys(record, KNOWN_ITEM_KEYS.faq, dropped, `items[${index}].`)
  return { q, a }
}
