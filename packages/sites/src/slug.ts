import { ok, err, appError } from '@sahoda/shared'
import type { Result } from '@sahoda/shared'

/**
 * Labels a tenant may never own. `sites.slug` is GLOBALLY unique and becomes a
 * subdomain, so handing out `api` or `www` would shadow our own infrastructure.
 * Checked before the first probe — a reserved candidate is never even asked about.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'www',
  'app',
  'api',
  'admin',
  'mail',
  'cdn',
  'static',
  'assets',
  'blog',
  'help',
  'status',
  'docs',
])

/** A DNS label tolerates 63 chars; 48 leaves room for the `-9` / `-abc123` suffixes. */
const SLUG_MAX_LENGTH = 48
/** Used when the display name folds away to nothing (emoji-only, non-Latin-only). */
const FALLBACK_SLUG_BASE = 'site'
/** `-1` reads as a typo, so the numeric walk starts at 2. */
const NUMERIC_SUFFIX_FIRST = 2
const NUMERIC_SUFFIX_LAST = 9
/** Hard bound: the walk must terminate against an adversarial or broken predicate. */
const MAX_RANDOM_ATTEMPTS = 5
const RANDOM_SUFFIX_LENGTH = 6
const RANDOM_SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

const COMBINING_MARKS = /[\u0300-\u036f]/g
const NON_SLUG_CHARS = /[^a-z0-9]+/g
const EDGE_HYPHENS = /^-+|-+$/g

/**
 * Fold a display name to a url-safe label. Returns `''` when nothing survives —
 * the caller decides the fallback rather than this function inventing one.
 *
 * NFKD splits `ü` into `u` + a combining mark, which the mark strip then removes;
 * anything still outside `[a-z0-9]` (emoji, CJK, Cyrillic, punctuation) collapses
 * to a single hyphen. The length cap is applied BEFORE the edge trim so a cap that
 * lands mid-word cannot leave a trailing hyphen behind.
 *
 * Also called by Task 4 on each page-path segment individually (not just on a
 * whole site name), so it must fold a single short word exactly as reliably as a
 * multi-word name. A segment with no ASCII fold at all — Devanagari, CJK, and
 * every other non-Latin script — has nothing left after the collapse and edge
 * trim, so it returns `''`; Task 4 treats that as "no fold" and falls back to a
 * positional path rather than writing an empty segment.
 */
export const slugify = (raw: string): string => {
  const folded = raw.normalize('NFKD').replace(COMBINING_MARKS, '')
  const collapsed = folded.toLowerCase().replace(NON_SLUG_CHARS, '-')
  return collapsed.slice(0, SLUG_MAX_LENGTH).replace(EDGE_HYPHENS, '')
}

/** Injected by the caller (wt-web wires `SiteStore.isSlugTaken`); faked in tests. */
export type IsSlugTaken = (slug: string) => Promise<boolean>

export interface ResolveSlugDeps {
  /** Injected so collision-walk tests are deterministic. */
  randomSuffix?: () => string
}

const defaultRandomSuffix = (): string => {
  let out = ''
  for (let i = 0; i < RANDOM_SUFFIX_LENGTH; i += 1) {
    const index = Math.floor(Math.random() * RANDOM_SUFFIX_ALPHABET.length)
    out += RANDOM_SUFFIX_ALPHABET.charAt(index)
  }
  return out
}

/**
 * Resolve a globally-unique slug for a new site.
 *
 * Walk: `slugify(name)` → `-2`…`-9` → `randomSuffix()` up to 5 times → VALIDATION_ERROR.
 * At most 14 probes (13 when the base is reserved), so the function always terminates
 * even if `isTaken` is broken and answers `true` forever. Probes are sequential on
 * purpose: the common case resolves in one round-trip, and a parallel fan-out would
 * hammer the database to save nothing.
 */
export const resolveSlug = async (
  name: string,
  isTaken: IsSlugTaken,
  traceId: string,
  deps: ResolveSlugDeps = {},
): Promise<Result<string>> => {
  const randomSuffix = deps.randomSuffix ?? defaultRandomSuffix
  const base = slugify(name)
  const root = base === '' ? FALLBACK_SLUG_BASE : base

  if (!RESERVED_SLUGS.has(root) && !(await isTaken(root))) {
    return ok(root)
  }

  for (let n = NUMERIC_SUFFIX_FIRST; n <= NUMERIC_SUFFIX_LAST; n += 1) {
    const candidate = `${root}-${n}`
    if (!(await isTaken(candidate))) {
      return ok(candidate)
    }
  }

  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt += 1) {
    const candidate = `${root}-${randomSuffix()}`
    if (!(await isTaken(candidate))) {
      return ok(candidate)
    }
  }

  // The message carries the derived root, never the raw display name — that name is
  // model- or user-supplied and this string is surfaced in the UI.
  return err(appError('VALIDATION_ERROR', `could not derive a free slug from "${root}"`, traceId))
}
