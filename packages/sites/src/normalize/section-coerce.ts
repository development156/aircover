/**
 * Coercion primitives shared by the per-kind section normalizers.
 *
 * ## What `dropped` means
 *
 * `dropped` reports **lost keys, not modified values**. An entry appears when a key was
 * present in `raw` but its value did not reach the normalized content at all — because the
 * key is unknown to this package, or because the value could not be coerced to usable copy.
 *
 * It is deliberately NOT a change log. A value that survived in altered form is not
 * reported: control characters are stripped and surrounding whitespace trimmed by
 * {@link coerceText} as a security gate before anything reaches the renderer, and a number
 * is stringified. `'Clean\u0000copy'` normalizes to `'Cleancopy'` with an empty `dropped`.
 * Do not read an empty `dropped` as "raw survived byte-for-byte".
 *
 * ## Caps
 *
 * Model output is untrusted input at a memory boundary, so every unbounded dimension is
 * capped, as it is in `render/escape.ts` (`MAX_URL_LENGTH`) and `normalize/path.ts`
 * (`MAX_PATH_LENGTH`). Over-cap copy is **rejected, not truncated**: a truncated headline
 * renders as a plausible half-sentence on a customer's live domain, which is exactly the
 * mock-success the package forbids, and rejection needs no new `dropped` vocabulary — the key
 * is reported as present-but-unusable, like any other value that could not be used.
 */
import { stripControl } from '../render/escape'

/**
 * Longest usable string for any single copy field. Generous for marketing copy (an FAQ answer
 * is a few hundred characters); anything past it is a malfunctioning generation, not prose.
 */
export const MAX_TEXT_LENGTH = 4096

/** Most unknown keys named individually in `dropped` for one record, before the count label. */
export const MAX_UNKNOWN_KEYS = 32

/**
 * Longest untrusted string named INSIDE a `dropped` label — a key name, a section `kind`.
 *
 * {@link MAX_UNKNOWN_KEYS} bounds how MANY labels a record can produce; this bounds how LONG
 * each one is. Capping only the count is a bound on one dimension of a two-dimensional value:
 * 32 keys of 200KB is 6.4MB of labels from a single section, and these labels are returned to
 * the caller on `AppError.details`, so they reach the UI and the logs.
 *
 * Short, because a label is a *pointer* to the offending input, not a copy of it. A key name or
 * a section kind past 64 characters is a malfunctioning generation, and the reader only needs
 * enough of it to find the thing in the raw model output.
 */
export const MAX_LABEL_TOKEN_LENGTH = 64

/** Names a value that had no nameable characters at all — every one of them was stripped. */
export const UNNAMEABLE_TOKEN = '(unnameable)'

/** Stands in for the characters past {@link MAX_LABEL_TOKEN_LENGTH}, which are not shown. */
export const labelTokenOverCap = (count: number): string => `...(+${count} chars)`

/**
 * Gate an untrusted string for use inside a `dropped` label.
 *
 * Copy fields are REJECTED over their cap ({@link coerceText}) because half a headline would
 * render as a plausible half-sentence on a live domain. A label is not copy — it is diagnostic
 * text nobody publishes — so here the head is kept and the truncation is *stated*: dropping the
 * label outright would lose the only record that the key existed, and shortening it silently
 * would be the coercion this package forbids. `labelTokenOverCap` is what makes it honest.
 *
 * `stripControl` runs on the already-sliced head, never on the whole value, for the same reason
 * {@link coerceText} gates length before stripping: a 200KB key must not reach the three global
 * regexes. Slicing can split a surrogate pair; `stripControl` drops the orphaned half.
 *
 * Takes `unknown` rather than `string`. `section.kind` is typed `SectionKind` but arrives from
 * `site_sections.kind`, a text column, and an object or a symbol there would make a bare
 * `${kind}` interpolation emit "[object Object]" or throw a TypeError out of the normalizer.
 * HTML is NOT escaped: a label is not markup, and `render/escape.ts` gates the render boundary.
 */
export const labelToken = (raw: unknown): string => {
  const source =
    typeof raw === 'string' || typeof raw === 'bigint' ? String(raw) : stripControl(raw)
  const overCap = source.length - MAX_LABEL_TOKEN_LENGTH
  const head = stripControl(overCap > 0 ? source.slice(0, MAX_LABEL_TOKEN_LENGTH) : source)
  const named = head === '' ? UNNAMEABLE_TOKEN : head
  return overCap > 0 ? `${named}${labelTokenOverCap(overCap)}` : named
}

/** Stands in for the unknown keys past {@link MAX_UNKNOWN_KEYS}, which are lost but unnamed. */
export const unknownKeysOverCap = (count: number): string => `(+${count} unknown keys)`

/** Reported when `raw` held values that no structured clone — and no jsonb column — can hold. */
export const rawUnstorable = (count: number): string => `(raw: ${count} unstorable)`

/** An own-property read that never walks the prototype chain. */
export const own = (record: Record<string, unknown>, key: string): unknown =>
  Object.hasOwn(record, key) ? record[key] : undefined

/** A plain object bag, or null when the value can carry no keys (scalar, array, null). */
export const toRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/**
 * Strings win; finite numbers coerce; everything else is unusable. Blank counts as absent,
 * and so does anything longer than {@link MAX_TEXT_LENGTH}.
 *
 * The length gate runs on the string **as received**, before `stripControl`, so a 50MB value
 * never reaches the three global regexes that scan it. A string that would only fit after
 * stripping is therefore still over the cap — that is the point of the ordering, not an
 * oversight. `NaN`/`Infinity` are refused because `String(NaN)` would render the literal word
 * "NaN" as a customer's headline.
 */
export const coerceText = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    if (value.length > MAX_TEXT_LENGTH) return undefined
    const trimmed = stripControl(value).trim()
    return trimmed === '' ? undefined : trimmed
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'bigint') {
    const digits = value.toString()
    return digits.length > MAX_TEXT_LENGTH ? undefined : digits
  }
  return undefined
}

/**
 * Read a known key, recording it in `dropped` when it was present but unusable.
 * `prefix` scopes the label, e.g. `'items[2].'` for a key inside a list entry.
 */
export const text = (
  record: Record<string, unknown>,
  key: string,
  dropped: string[],
  prefix = '',
): string | undefined => {
  if (!Object.hasOwn(record, key)) return undefined
  const value = coerceText(record[key])
  if (value === undefined) dropped.push(`${prefix}${key}`)
  return value
}

/**
 * Record every own key of `record` that this package does not understand.
 *
 * At most {@link MAX_UNKNOWN_KEYS} are named; the rest are counted into a single label, so a
 * bag with 100k junk keys costs 33 strings rather than 100k. Only the *report* is capped —
 * every known field is still read, so the cap can never hide renderable copy.
 *
 * The key NAME is bounded too, by {@link labelToken}: capping the count alone bounds the number
 * of labels but not their size, and one section with 32 keys of 200KB is 6.4MB of `dropped`.
 * The membership test runs on the full key, so a long key is still matched against `known`
 * exactly — only the label is shortened, and the label says by how much.
 */
export const recordUnknownKeys = (
  record: Record<string, unknown>,
  known: readonly string[],
  dropped: string[],
  prefix = '',
): void => {
  let named = 0
  let overCap = 0
  for (const key of Object.keys(record)) {
    if (known.includes(key)) continue
    if (named < MAX_UNKNOWN_KEYS) {
      dropped.push(`${prefix}${labelToken(key)}`)
      named += 1
      continue
    }
    overCap += 1
  }
  if (overCap > 0) dropped.push(`${prefix}${unknownKeysOverCap(overCap)}`)
}

/**
 * A defensive copy of the bag kept on `NormalizedSection.raw`.
 *
 * `raw` outlives the call and is persisted to a jsonb column, so aliasing the caller's object
 * would let a later mutation of it silently rewrite a stored section. `structuredClone` throws
 * on values a jsonb column could not hold either (functions, symbols); when it does, the bag is
 * rebuilt key by key and the count of unstorable keys is reported — losing them silently would
 * make an incomplete `raw` look like a faithful one.
 *
 * The rebuild *defines* each key instead of assigning it. `clone[key] = value` for a key literally
 * named `__proto__` runs the inherited setter: it swaps the clone's prototype and creates no own
 * property, so that key would vanish from `raw` without being counted as unstorable — an
 * under-report on the one label that exists to make an incomplete `raw` visible. JSON.parse
 * produces exactly such an own `__proto__` key, and model output is JSON.
 */
export const cloneBag = (
  record: Record<string, unknown>,
  dropped: string[],
): Record<string, unknown> => {
  try {
    return structuredClone(record)
  } catch {
    // Fall through: one bad value must not cost the whole debugging bag.
  }
  const clone: Record<string, unknown> = {}
  let unstorable = 0
  for (const key of Object.keys(record)) {
    try {
      const value = structuredClone(record[key])
      Object.defineProperty(clone, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      })
    } catch {
      unstorable += 1
    }
  }
  if (unstorable > 0) dropped.push(rawUnstorable(unstorable))
  return clone
}
