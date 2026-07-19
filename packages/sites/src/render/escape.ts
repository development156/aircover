/**
 * The security gate for the whole package. Model-generated copy is rendered into a document
 * that ships to a customer's live domain, so a prompt-injected `<script>` reaching that page
 * executes in the tenant's origin, on their visitors. Every interpolation in packages/sites
 * passes through one of these four functions -- there is no raw-HTML pass-through anywhere.
 *
 * Text nodes, attribute values, and URL attributes have different rules, so they have
 * different functions. Using the wrong one is a bug; using none is a vulnerability.
 */

/** Text-node escapes. `&` is listed first only for readability -- replacement is single-pass. */
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
const HTML_CHARS = /[&<>"']/g

/**
 * Attribute escapes add the backtick (a delimiter to legacy parsers) and the whitespace
 * characters a parser would read as the start of a *new* attribute.
 */
const ATTR_ENTITIES: Readonly<Record<string, string>> = {
  ...HTML_ENTITIES,
  '`': '&#96;',
  '\t': '&#9;',
  '\n': '&#10;',
  '\r': '&#13;',
}
const ATTR_CHARS = /[&<>"'`\t\n\r]/g

/** C0 and C1 controls, excluding tab (09), newline (0A) and carriage return (0D). */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g

/** Bidi overrides/isolates and zero-width characters -- invisible in copy, meaningful to a reader. */
const INVISIBLE_CHARS = /[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g

/**
 * Everything removed before a URL's scheme is inspected: all of C0, space, C1, NBSP, and the
 * invisible set. Browsers strip some of these from `href` themselves, which is exactly how
 * `java\tscript:` smuggles a scheme past a naive prefix check.
 */
const URL_STRIP =
  /[\u0000-\u0020\u007F-\u00A0\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g

const URL_SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/
const ALLOWED_SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'mailto', 'tel'])
const MAX_URL_LENGTH = 2048

/**
 * Model output is typed `unknown` at this boundary, so coerce rather than throw -- a malformed
 * field must degrade to empty copy, not take down a render. Objects and arrays deliberately
 * become `''`: "[object Object]" on a customer's live page is worse than nothing, and an
 * array's `join()` would smuggle its elements through unescaped.
 */
const coerce = (raw: unknown): string => {
  if (typeof raw === 'string') return raw
  if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : ''
  if (typeof raw === 'bigint') return String(raw)
  if (typeof raw === 'boolean') return String(raw)
  return ''
}

/** Remove control, bidi and zero-width characters; ordinary whitespace survives. */
export const stripControl = (raw: string): string =>
  raw.replace(CONTROL_CHARS, '').replace(INVISIBLE_CHARS, '')

/** Escape for an HTML text node. Single-pass, so an ampersand can never be double-consumed. */
export const escapeHtml = (raw: unknown): string =>
  stripControl(coerce(raw)).replace(HTML_CHARS, (char) => HTML_ENTITIES[char] ?? char)

/** Escape for a double-quoted HTML attribute value. */
export const escapeAttr = (raw: unknown): string =>
  stripControl(coerce(raw)).replace(ATTR_CHARS, (char) => ATTR_ENTITIES[char] ?? char)

/**
 * Validate a URL for an `href`/`action`. Returns the *cleaned* string -- callers must still pass
 * it through {@link escapeAttr} when emitting. `null` means the caller drops the link entirely
 * rather than emitting a dead or dangerous one.
 *
 * Only `http:`, `https:`, `mailto:` and `tel:` are allowed. Schemeless values are accepted only
 * when root-relative (`/x`) or a fragment (`#x`); a bare `about` would resolve against
 * `/about/index.html` and break, so it is rejected too.
 */
export const safeUrl = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null

  const cleaned = raw.replace(URL_STRIP, '')
  if (cleaned.length === 0 || cleaned.length > MAX_URL_LENGTH) return null

  // Protocol-relative: inherits the page scheme and points off-origin.
  if (cleaned.startsWith('//')) return null

  const scheme = URL_SCHEME.exec(cleaned)?.[1]
  if (scheme !== undefined) {
    return ALLOWED_SCHEMES.has(scheme.toLowerCase()) ? cleaned : null
  }

  if (cleaned.startsWith('/') || cleaned.startsWith('#')) return cleaned
  return null
}
