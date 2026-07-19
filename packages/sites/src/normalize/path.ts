/**
 * `SiteGenerateOutputSchema` types `path` as a bare `z.string()` -- `""`, `../etc`, and a path
 * with no leading slash all parse clean. That string becomes a *filename* in the deploy bundle,
 * which makes it untrusted input at a filesystem boundary.
 *
 * The guard is an allowlist, not a denylist: a segment that is not plainly `[a-z0-9._-]`
 * starting with an alphanumeric is rejected outright. A path that cannot be normalized is
 * dropped by the caller, never coerced into something plausible -- coercion is how two distinct
 * pages silently collide on `unique (site_id, path)`.
 *
 * ## The bundle contract
 *
 * Every accepted path maps to `<segments>/index.html`. The invariant this module guarantees is:
 * **no two distinct accepted paths may produce bundle entries that cannot both exist on a real
 * filesystem.** Two entries conflict only when one is a directory prefix of the other, and since
 * every entry ends in `index.html`, entry A can prefix entry B only if some segment of B is
 * literally `index.html`. Concretely: `/` writes the *file* `index.html`, while `/index.html`
 * would want a *directory* named `index.html` to hold `index.html/index.html`. Both are valid
 * normalized paths and distinct rows under `unique (site_id, path)`, so page-level dedupe never
 * sees them; the bundle writer would take `ENOTDIR`/`EEXIST` instead.
 *
 * The fix lives in `normalizePath`, which **rejects any segment equal to `index.html`**. That is
 * provably sufficient (it is the only way the prefix relation can arise) and it is the only
 * reserved segment needed. It is preferred over a collision-aware `pathToFile` because
 * `pathToFile` must stay pure and per-path: making it collision-aware would require it to see
 * every other page in the bundle, and then to invent a disambiguated name -- exactly the silent
 * coercion this module refuses to do.
 *
 * ## Case folding runs AFTER the allowlist, never before
 *
 * `String#toLowerCase` is Unicode-aware: U+212A KELVIN SIGN folds to ASCII `k`. Folding first
 * would let that code point reach the allowlist already disguised as `k`, so `/<U+212A>` and `/k`
 * would both normalize to `/k` -- a silent collision, the exact failure this module exists to
 * prevent. So the allowlist runs on the string as received (it accepts `A-Z` explicitly) and only
 * an already-verified ASCII segment is folded. U+212A is the sole code point in U+0080-U+10FFFF
 * that folds into this allowlist, but the *ordering*, not the enumeration, is the fix.
 *
 * ## Guards that are deliberately redundant
 *
 * `CONTROL_CHARS`, `BACKSLASH`, and the trailing-space arm of `SEGMENT_TRAILING` have **no input
 * for which they are the sole defense**: `SEGMENT_ALLOWED` already rejects every byte they match.
 * They are retained as defense-in-depth, so a future loosening of the allowlist cannot silently
 * readmit a NUL, a C1 control, or a Windows separator. Deleting any of them leaves this module's
 * suite green; that is expected, and the tests are named so that none of them claims to pin these
 * three constants. Do not delete them on the strength of a passing suite.
 *
 * ## Windows-hostile names are rejected, though the deploy target is Linux
 *
 * Cloudflare serves the bundle from Linux, where `con`, `nul`, `com1` and a trailing `.` are all
 * legal filenames. They are rejected anyway. Bundles get zipped, downloaded, and checked out on
 * developer machines, and on a dot-stripping or case-insensitive filesystem `a./index.html`
 * collides with `a/index.html` -- breaking the bundle contract above on that host. The cost of
 * rejecting is one implausible marketing-page slug; the cost of accepting is a corrupt bundle
 * that reproduces only off the deploy target.
 */

const ROOT_PATH = '/'
const INDEX_FILE = 'index.html'
const MAX_PATH_LENGTH = 128
const MAX_SEGMENT_LENGTH = 64
const MAX_SEGMENTS = 8
const BACKSLASH = '\\'

/**
 * Any C0 or C1 control, including NUL. Not stripped -- its presence rejects the whole path.
 * Defense-in-depth: `SEGMENT_ALLOWED` already rejects every one of these. See the docblock.
 */
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/

/**
 * A path segment must start alphanumeric and continue in `[a-z0-9._-]`. This rejects `.`, `..`,
 * `.hidden`, `%2e%2e`, spaces, non-ascii, and every html metacharacter in one check.
 *
 * Case-preserving on purpose: this runs against the raw input, before any fold, so a code point
 * that would *become* an allowed character under `toLowerCase` is rejected as itself.
 */
const SEGMENT_ALLOWED = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * A segment may not end in `.` or a space: Windows silently strips both, so `a.` and `a` would
 * name the same directory there and collide in the bundle. The space arm is redundant with
 * `SEGMENT_ALLOWED`; the dot arm is not.
 */
const SEGMENT_TRAILING = /[. ]$/

/** Windows device names. Reserved with or without an extension -- `nul.html` is still `NUL`. */
const WINDOWS_DEVICE_NAMES: ReadonlySet<string> = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: 9 }, (_unused, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_unused, index) => `lpt${index + 1}`),
])

/** Windows resolves a device name by the part before the first dot, so compare on that. */
const deviceBaseOf = (segment: string): string => {
  const dotIndex = segment.indexOf('.')
  return dotIndex === -1 ? segment : segment.slice(0, dotIndex)
}

/** Returns the canonical path, or `null` when the caller must drop the page. */
export const normalizePath = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null

  const trimmed = raw.trim()
  if (trimmed.length === 0) return ROOT_PATH
  if (trimmed.length > MAX_PATH_LENGTH) return null
  if (CONTROL_CHARS.test(trimmed)) return null
  if (trimmed.includes(BACKSLASH)) return null

  const segments = trimmed.split('/').filter((segment) => segment.length > 0)

  if (segments.length === 0) return ROOT_PATH
  if (segments.length > MAX_SEGMENTS) return null

  const canonical: string[] = []
  for (const segment of segments) {
    if (segment.length > MAX_SEGMENT_LENGTH) return null
    if (!SEGMENT_ALLOWED.test(segment)) return null
    if (SEGMENT_TRAILING.test(segment)) return null

    const folded = segment.toLowerCase()
    if (folded === INDEX_FILE) return null
    if (WINDOWS_DEVICE_NAMES.has(deviceBaseOf(folded))) return null

    canonical.push(folded)
  }

  return `/${canonical.join('/')}`
}

/**
 * Map a normalized path to its bundle filename. Directory-index form so the deployed url needs
 * no `.html` extension.
 *
 * Throws on anything `normalizePath` would not have produced. That is a programming error, and
 * failing loudly beats silently normalizing here -- a second fold at this layer could map two
 * already-deduped pages onto one file and overwrite a page in the bundle.
 *
 * Pure and per-path by design. It relies on `normalizePath` having already rejected the one
 * segment (`index.html`) that could make two entries un-coexistable on disk; see the bundle
 * contract in the module docblock.
 */
export const pathToFile = (path: string): string => {
  if (normalizePath(path) !== path) {
    throw new Error(`pathToFile requires a normalized path, received ${JSON.stringify(path)}`)
  }
  if (path === ROOT_PATH) return INDEX_FILE
  return `${path.slice(1)}/${INDEX_FILE}`
}
