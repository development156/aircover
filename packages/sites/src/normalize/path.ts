/**
 * `SiteGenerateOutputSchema` types `path` as a bare `z.string()` -- `""`, `../etc`, and a path
 * with no leading slash all parse clean. That string becomes a *filename* in the deploy bundle,
 * which makes it untrusted input at a filesystem boundary.
 *
 * The guard is an allowlist, not a denylist: a segment that is not plainly `[a-z0-9._-]`
 * starting with an alphanumeric is rejected outright. A path that cannot be normalized is
 * dropped by the caller, never coerced into something plausible -- coercion is how two distinct
 * pages silently collide on `unique (site_id, path)`.
 */

const ROOT_PATH = '/'
const INDEX_FILE = 'index.html'
const MAX_PATH_LENGTH = 128
const MAX_SEGMENT_LENGTH = 64
const MAX_SEGMENTS = 8
const BACKSLASH = '\\'

/** Any C0 or C1 control, including NUL. Not stripped -- its presence rejects the whole path. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/

/**
 * A path segment must start alphanumeric and continue in `[a-z0-9._-]`. This rejects `.`, `..`,
 * `.hidden`, `%2e%2e`, spaces, non-ascii, and every html metacharacter in one check.
 */
const SEGMENT_ALLOWED = /^[a-z0-9][a-z0-9._-]*$/

/** Returns the canonical path, or `null` when the caller must drop the page. */
export const normalizePath = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null

  const trimmed = raw.trim()
  if (trimmed.length === 0) return ROOT_PATH
  if (trimmed.length > MAX_PATH_LENGTH) return null
  if (CONTROL_CHARS.test(trimmed)) return null
  if (trimmed.includes(BACKSLASH)) return null

  const segments = trimmed
    .toLowerCase()
    .split('/')
    .filter((segment) => segment.length > 0)

  if (segments.length === 0) return ROOT_PATH
  if (segments.length > MAX_SEGMENTS) return null

  for (const segment of segments) {
    if (segment.length > MAX_SEGMENT_LENGTH) return null
    if (!SEGMENT_ALLOWED.test(segment)) return null
  }

  return `/${segments.join('/')}`
}

/**
 * Map a normalized path to its bundle filename. Directory-index form so the deployed url needs
 * no `.html` extension.
 *
 * Throws on anything `normalizePath` would not have produced. That is a programming error, and
 * failing loudly beats silently normalizing here -- a second fold at this layer could map two
 * already-deduped pages onto one file and overwrite a page in the bundle.
 */
export const pathToFile = (path: string): string => {
  if (normalizePath(path) !== path) {
    throw new Error(`pathToFile requires a normalized path, received ${JSON.stringify(path)}`)
  }
  if (path === ROOT_PATH) return INDEX_FILE
  return `${path.slice(1)}/${INDEX_FILE}`
}
