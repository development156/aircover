/**
 * The security gate for the whole package. Model-generated copy is rendered into a document
 * that ships to a customer's live domain, so a prompt-injected `<script>` reaching that page
 * executes in the tenant's origin, on their visitors. Every interpolation in packages/sites
 * passes through one of these four functions -- there is no raw-HTML pass-through anywhere.
 *
 * Text nodes, attribute values, and URL attributes have different rules, so they have
 * different functions. Using the wrong one is a bug; using none is a vulnerability.
 *
 * NOTE FOR EDITORS: never type a control, bidi or zero-width character into this file as a raw
 * byte -- write it as a `\uXXXX` escape sequence. A raw byte makes git classify the file as
 * binary, which silently costs the whole team `git diff` and `git blame` on the security gate.
 * This file is pure ASCII on disk, and a test asserts it stays that way.
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
 * Attribute escapes add the backtick (a delimiter to legacy parsers) and the three whitespace
 * characters that cannot survive inside a quoted value without an entity.
 *
 * CONTRACT -- read this before calling `escapeAttr`: the output is safe **only inside a
 * double-quoted attribute value**, which is the only form this package emits. Space and `=`
 * are deliberately NOT escaped, because `class="hero cta"` and `data-x="a=b"` are ordinary
 * markup that has to keep working; the cost is that this output would break straight out of an
 * unquoted attribute (`class=VALUE`). Always emit `name="${escapeAttr(value)}"`.
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
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu

/**
 * Invisible characters that mean something to a renderer or to a reader's eye while occupying
 * none: bidi embeddings/overrides/isolates (which visually reverse a filename or a link label),
 * zero-width and word-joining spaces, deprecated format controls, interlinear annotation marks,
 * and the Unicode tag block (U+E0000-U+E007F), which can smuggle a whole hidden message.
 *
 * Deliberately NOT stripped -- these two are letters, not decoration:
 *   - U+200C ZERO WIDTH NON-JOINER, required for correct Devanagari, Urdu and Persian
 *     rendering (Hindi copy is on this product's roadmap).
 *   - U+200D ZERO WIDTH JOINER, required to build emoji sequences: family, flags, professions.
 * Stripping them mangles legitimate copy: a product bug, not a hardening measure.
 */
const INVISIBLE_CHARS =
  /[\u061C\u180E\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u206A-\u206F\uFEFF\uFFF9-\uFFFB\u{E0000}-\u{E007F}]/gu

/**
 * Unpaired surrogates. The `u` flag makes this match code points, and a well-formed surrogate
 * pair is a single code point above U+FFFF -- so this class matches *only* the lone halves.
 * They have no UTF-8 encoding: written to a file they become U+FFFD, silently corrupting the
 * page, and they can break a downstream parser outright.
 */
const LONE_SURROGATES = /[\uD800-\uDFFF]/gu

/**
 * Characters that must never appear inside a URL this package emits: all of C0, space, C1,
 * NBSP, the invisible set above (including ZWNJ/ZWJ -- a URL has no linguistic joining to do),
 * and lone surrogates. Non-global, because it is only ever used with `.test()`.
 */
const URL_FORBIDDEN =
  /[\u0000-\u0020\u007F-\u00A0\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u206A-\u206F\uFEFF\uFFF9-\uFFFB\u{E0000}-\u{E007F}\uD800-\uDFFF]/u

/**
 * The same forbidden set as {@link URL_FORBIDDEN}, minus the bare space (U+0020) -- every other
 * C0 control (tab, newline, CR, ...), every C1 control, NBSP and the full invisible-character
 * set stay forbidden. Used only once the scheme has already been matched to exactly `mailto:`
 * or `tel:`, because India-market phone formatting (`tel:+91 98765 43210`) and multi-word mail
 * subjects (`mailto:hi@sahoda.com?subject=Hello there`) both rely on an unescaped space.
 *
 * This does not reopen the `java<TAB>script:` / `java<SPACE>script:` / `java<ZWSP>script:`
 * laundering path: {@link URL_SCHEME} requires the scheme's own characters to run straight into
 * the colon with nothing else between them, so any of those three payloads fails scheme
 * extraction entirely (the offending character sits *inside* the alleged scheme, before its
 * colon) and falls through to the schemeless branch below, which rejects anything not starting
 * with `/` or `#`. This relaxed regex is only ever consulted once a real `mailto:`/`tel:`
 * scheme has already been confirmed, so it never sees those payloads.
 */
const URL_FORBIDDEN_ALLOW_SPACE =
  /[\u0000-\u001F\u007F-\u00A0\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u206A-\u206F\uFEFF\uFFF9-\uFFFB\u{E0000}-\u{E007F}\uD800-\uDFFF]/u

/**
 * Two authority-position slashes, in any combination of `/` and `\`. WHATWG URL parsing
 * treats a backslash as a slash there, so `/\evil.com`, `\/evil.com` and
 * `\\evil.com` all resolve to `https://evil.com/` exactly as `//evil.com` does -- while
 * reading, in model output, like an ordinary internal path. Checking only `//` leaves three
 * live off-origin redirects on every page this package ships.
 */
const URL_AUTHORITY_SLASHES = /^[/\\]{2}/

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

/**
 * Remove control, bidi, zero-width and tag characters, plus unpaired surrogates. Ordinary
 * whitespace survives, and so do ZWJ/ZWNJ -- see {@link INVISIBLE_CHARS} for why.
 *
 * Takes `unknown` and coerces, like every other exported function here: it is part of the
 * package's public surface, so reaching it with raw model output must degrade to `''`, never
 * throw a TypeError out of a half-finished render.
 */
export const stripControl = (raw: unknown): string =>
  coerce(raw).replace(CONTROL_CHARS, '').replace(INVISIBLE_CHARS, '').replace(LONE_SURROGATES, '')

/** Escape for an HTML text node. Single-pass, so an ampersand can never be double-consumed. */
export const escapeHtml = (raw: unknown): string =>
  stripControl(raw).replace(HTML_CHARS, (char) => HTML_ENTITIES[char] ?? char)

/**
 * Escape for a **double-quoted** HTML attribute value -- see {@link ATTR_ENTITIES} for the full
 * contract. Emit as `name="${escapeAttr(value)}"`; an unquoted attribute is not covered.
 */
export const escapeAttr = (raw: unknown): string =>
  stripControl(raw).replace(ATTR_CHARS, (char) => ATTR_ENTITIES[char] ?? char)

/**
 * Validate a URL for an `href`/`action`. Returns the trimmed string -- callers must still pass
 * it through {@link escapeAttr} when emitting. `null` means the caller drops the link entirely
 * rather than emitting a dead or dangerous one.
 *
 * Only `http:`, `https:`, `mailto:` and `tel:` are allowed, deny-by-default: an unrecognised
 * scheme is rejected, never passed through. Schemeless values are accepted only when
 * root-relative (`/x`) or a fragment (`#x`); a bare `about` would resolve against
 * `/about/index.html` and break, so it is rejected too.
 *
 * Whitespace and invisible characters are grounds for **rejection, not repair**. Deleting them
 * would turn `https://ok.com/a b` into a working link to a different page nobody authored, and
 * would launder `java<TAB>script:` into a clean `javascript:` that then has to be caught by the
 * allowlist -- one check deep instead of two. Only surrounding whitespace is trimmed, which
 * cannot change where a URL points.
 *
 * The one exception is a bare space, and only once the scheme is confirmed to be exactly
 * `mailto:` or `tel:` -- see {@link URL_FORBIDDEN_ALLOW_SPACE}. India-market phone numbers are
 * conventionally spaced (`tel:+91 98765 43210`) and mail subjects are often multiple words
 * (`mailto:hi@sahoda.com?subject=Hello there`); neither scheme has an authority component for a
 * space to redirect, so passing it through is inert. `http:`/`https:` keep the strict rule.
 */
export const safeUrl = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null

  const url = raw.trim()
  if (url.length === 0 || url.length > MAX_URL_LENGTH) return null

  // Scheme is extracted before the forbidden-character check purely to decide which check to
  // run -- see URL_FORBIDDEN_ALLOW_SPACE's doc comment for why this cannot be laundered.
  const scheme = URL_SCHEME.exec(url)?.[1]
  const schemeLower = scheme?.toLowerCase()
  const permitsSpace = schemeLower === 'mailto' || schemeLower === 'tel'

  if (permitsSpace ? URL_FORBIDDEN_ALLOW_SPACE.test(url) : URL_FORBIDDEN.test(url)) return null
  if (URL_AUTHORITY_SLASHES.test(url)) return null

  if (schemeLower !== undefined) {
    return ALLOWED_SCHEMES.has(schemeLower) ? url : null
  }

  if (url.startsWith('/') || url.startsWith('#')) return url
  return null
}
