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
 * Every path `normalizePath` accepts maps to `<segments>/index.html`. The invariant guaranteed
 * **for `normalizePath` specifically** is: no two distinct accepted paths may produce bundle
 * entries that cannot both exist on a real filesystem. Note the scope -- `isBundleFilePath`
 * accepts a WIDER set (bare asset names, for which this proof does not run) and documents the
 * narrower guarantee it gives; the cross-file half lives in `deploy/bundle-paths.ts`.
 *
 * Two entries conflict only when one is a directory prefix of the other, and since
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

/**
 * Caps the length of the value `normalizePath` *returns* -- the normalized output, leading slash
 * included -- not the length of the argument as received. A slashless input needs a leading slash
 * added, and repeated separators collapse away, so input length and output length can differ; the
 * guarantee callers get is a bound on what comes back, since that is what lands in the bundle path
 * and the database column. Checked once, last, against the assembled string, so a slashless
 * 128-character input (which would need a 129-character output) is rejected rather than truncated
 * or silently let through over the cap.
 */
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

/** Windows reserves exactly this many numbered serial (COM) and parallel (LPT) device names. */
const WINDOWS_NUMBERED_DEVICE_COUNT = 9

/** Windows device names. Reserved with or without an extension -- `nul.html` is still `NUL`. */
const WINDOWS_DEVICE_NAMES: ReadonlySet<string> = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: WINDOWS_NUMBERED_DEVICE_COUNT }, (_unused, index) => `com${index + 1}`),
  ...Array.from({ length: WINDOWS_NUMBERED_DEVICE_COUNT }, (_unused, index) => `lpt${index + 1}`),
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

  const normalized = `/${canonical.join('/')}`
  if (normalized.length > MAX_PATH_LENGTH) return null

  return normalized
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

/**
 * True when `raw` is a bundle-relative FILE name a deployer may safely join onto a host
 * directory. `normalizePath` describes a *page* (`/about`); this describes the *file* that page
 * becomes (`about/index.html`) plus the non-page assets that ship beside it (`styles.css`).
 *
 * ## What this does NOT guarantee
 *
 * This is **not** the bundle contract stated at the top of this module, and an earlier version
 * of this docblock wrongly claimed it was "the same guarantee `normalizePath` gives". That
 * contract -- no two distinct accepted values may produce entries that cannot both exist on a
 * real filesystem -- is proved for `normalizePath` by every accepted page mapping to a file
 * ending in `index.html`, which makes `index.html` the only segment that can create a prefix
 * relation, and that segment is rejected. The non-page arm below admits bare asset names, for
 * which the proof simply does not run: `a` and `a/index.html` are BOTH accepted, and a bundle
 * containing both asks the writer for a file `a` and a directory `a`.
 *
 * The guarantee this function actually gives is per-name and containment-shaped:
 *
 *  - the name is relative and cannot escape the directory it is joined onto (no `..`, no
 *    leading slash, no backslash, no control byte, no over-long segment, no device name); and
 *  - no two distinct accepted names COERCE onto one file, because nothing is coerced -- `A.css`
 *    is rejected rather than folded to `a.css`, `/a.css` rejected rather than trimmed.
 *
 * Whether a SET of accepted names can coexist is not decidable per-path, and deliberately so
 * (see `pathToFile`). `findBundlePathConflict` in `deploy/bundle-paths.ts` carries that half of
 * the contract and rejects both shapes of collision before the first write.
 *
 * ## How the check itself works
 *
 * It is a round-trip check, not a second definition of "safe": a name is accepted only if
 * `normalizePath` accepts the path it corresponds to AND returns it unchanged. So `..`,
 * an absolute path, a backslash, a control byte, a Windows device name, a doubled slash
 * and an over-long segment are all rejected here for exactly the reasons documented above,
 * and any future tightening of `normalizePath` tightens this automatically.
 *
 * The `index.html` arm exists because `normalizePath` deliberately REJECTS a segment equal
 * to `index.html` (see the bundle contract) while `pathToFile` deliberately EMITS one. The
 * arm strips the emitted tail and re-validates the page underneath it, so the exemption is
 * confined to the single trailing segment `pathToFile` is allowed to add.
 *
 * Nothing is coerced. A name with a leading slash is rejected rather than trimmed: `a.css`
 * and `/a.css` would otherwise collapse onto one file and silently overwrite each other.
 *
 * `raw` is `unknown`, not `string`, for the same reason `normalizePath` above takes `unknown`:
 * this is a TRUST BOUNDARY, and a type annotation is not a runtime guarantee. `BundleFile.path`
 * is declared `string`, but `deploy/fixture.ts` states outright that these fields have "no
 * enforced provenance" today, and a bundle round-tripped through `JSON.parse` carries whatever
 * the json held. With a `string` parameter, `42` reached `raw.endsWith` and threw a `TypeError`
 * that escaped `Deployer`'s `Promise<Result<SiteDeployState>>` entirely -- the same failure mode
 * `slug.ts` funnels every `isTaken` call through `probeTaken` to prevent. A non-string is not a
 * bundle file name, so it answers `false` and the caller reports it by position like any other
 * rejected path.
 */
export const isBundleFilePath = (raw: unknown): boolean => {
  if (typeof raw !== 'string') return false
  if (raw.length === 0) return false
  if (raw === INDEX_FILE) return true

  const indexSuffix = `/${INDEX_FILE}`
  if (raw.endsWith(indexSuffix)) {
    const page = `/${raw.slice(0, raw.length - indexSuffix.length)}`
    return normalizePath(page) === page && pathToFile(page) === raw
  }

  return normalizePath(`/${raw}`) === `/${raw}`
}
