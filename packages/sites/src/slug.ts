import { ok, err, appError } from '@sahoda/shared'
import type { Result } from '@sahoda/shared'

/**
 * Labels a tenant may never own. `sites.slug` is GLOBALLY unique and becomes a
 * subdomain, so handing out `api` or `www` would shadow our own infrastructure.
 * Checked before the first probe -- a reserved candidate is never even asked about.
 *
 * Three groups, all equally reserved: infrastructure hosts we serve from (`www`,
 * `api`, `cdn`), mail/DNS labels a resolver or MTA would collide with (`ns`, `mx`,
 * `smtp`, `ftp`), and impersonation bait -- the words a phishing page would want
 * (`auth`, `login`, `billing`, `support`, `sahoda`).
 *
 * INVARIANT: every entry here is hyphen-free. The collision walk only ever emits
 * hyphenated candidates (`{root}-2`, `{root}-k7f2qz`), so no walk candidate can
 * land on a reserved word and the walk needs no reserved re-check. Adding a
 * HYPHENATED entry to this set would break that coupling -- see the note at the
 * reserved check inside `resolveSlug` before doing so.
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
  'ns',
  'mx',
  'smtp',
  'ftp',
  'dev',
  'staging',
  'preview',
  'auth',
  'login',
  'dashboard',
  'support',
  'billing',
  'webhook',
  'sahoda',
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
 * Fold a display name to a url-safe label. Returns `''` when nothing survives --
 * the caller decides the fallback rather than this function inventing one.
 *
 * NFKD (compatibility decomposition), not NFD, and the difference is load-bearing.
 * NFD splits canonical pairs only, so an accented letter such as U+00FC becomes
 * `u` plus a combining mark that the mark strip then removes. NFKD ALSO folds the
 * COMPATIBILITY forms that NFD leaves untouched: fullwidth letters (U+FF21..U+FF5A)
 * to their ASCII equivalents, the `fi` ligature U+FB01 to `f` + `i`, and the
 * ideographic space U+3000 to a plain space. Under NFD those survive normalization
 * intact, fall outside `[a-z0-9]`, and are eaten by the collapse -- so downgrading
 * this call to NFD silently turns a fullwidth name into `''` and a ligature name
 * into a truncated stump. Both cases are pinned by test.
 *
 * Anything still outside `[a-z0-9]` (emoji, CJK, Cyrillic, punctuation) collapses
 * to a single hyphen. The length cap is applied BEFORE the edge trim so a cap that
 * lands mid-word cannot leave a trailing hyphen behind.
 *
 * Also called by Task 4 on each page-path segment individually (not just on a
 * whole site name), so it must fold a single short word exactly as reliably as a
 * multi-word name. A segment with no ASCII fold at all -- Devanagari, CJK, and
 * every other non-Latin script -- has nothing left after the collapse and edge
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
 * Ask the predicate once, inside the `Result` envelope.
 *
 * Task 17 wires `isTaken` to a Supabase round-trip, where a dropped connection is
 * an ordinary Tuesday rather than a programming error. Left unguarded, that throw
 * (or rejected promise) escapes `resolveSlug`'s `Promise<Result<string>>` entirely
 * and reaches the mount as an unhandled rejection. So every call is funnelled
 * through here and every failure mode becomes a typed `PROVIDER_ERROR`.
 *
 * The caught value is deliberately DISCARDED, never interpolated: a driver-level
 * exception routinely embeds the connection string, host, or credentials in its
 * message, and this message is surfaced in the UI and written to logs. The caller
 * needs to know the availability check failed and that retrying is reasonable --
 * the underlying text tells them nothing more actionable. Same leak discipline as
 * `classifyXHttpError` in packages/publishing/src/adapters/x-http.ts.
 *
 * A non-boolean answer is a CONTRACT VIOLATION, not a vote. `undefined`, `0`, and
 * `null` are all falsy, so a loose `!answer` would read a broken predicate as
 * "available" and hand out a slug that may already exist -- on a globally-unique
 * index, that is a guaranteed insert failure. Only `true` means taken and only
 * `false` means free; anything else fails closed with a typed error.
 */
const probeTaken = async (
  isTaken: IsSlugTaken,
  slug: string,
  traceId: string,
): Promise<Result<boolean>> => {
  let answer: unknown
  try {
    answer = await isTaken(slug)
  } catch {
    return err(
      appError('PROVIDER_ERROR', 'could not check slug availability, please retry', traceId),
    )
  }

  if (answer !== true && answer !== false) {
    return err(
      appError('PROVIDER_ERROR', 'slug availability check returned a non-boolean answer', traceId),
    )
  }

  return ok(answer)
}

/**
 * Resolve a globally-unique slug for a new site.
 *
 * Walk: `slugify(name)` -> `-2`...`-9` -> `randomSuffix()` up to 5 times -> VALIDATION_ERROR.
 * At most 14 probes (13 when the base is reserved), so the function always terminates
 * even if `isTaken` is broken and answers `true` forever. Probes are sequential on
 * purpose: the common case resolves in one round-trip, and a parallel fan-out would
 * hammer the database to save nothing.
 *
 * A predicate that throws, rejects, or answers with a non-boolean aborts the walk with
 * a `PROVIDER_ERROR` rather than escaping the `Result` envelope -- see `probeTaken`.
 *
 * TOCTOU -- READ THIS BEFORE CALLING. The `sites.slug` uniqueness index is GLOBAL
 * across workspaces, and this function only OBSERVES availability: it probes, returns,
 * and the caller inserts afterwards. Between the last probe and that insert the slug is
 * unheld, so two workspaces creating "Acme Coffee" at the same moment can both be told
 * `acme-coffee` is free. The race is real and it is NOT fixable here -- reserving a slug
 * would take the insert itself, or an advisory lock this module has no connection to
 * hold. The winner is decided by the database at insert time, not here.
 *
 * Therefore the caller (Task 17's insert) MUST treat a Postgres unique-violation
 * `23505` on `sites.slug` as a RECOVERABLE outcome -- map it to a typed error and call
 * `resolveSlug` again, whose next walk steps past the now-taken slug -- and never as a
 * crash. Nothing in this module maps `23505`, so an unhandled lost race surfaces raw.
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

  // The reserved check guards the BARE root only. That is safe SOLELY because every
  // RESERVED_SLUGS entry is hyphen-free while every candidate below is hyphenated, so
  // no walk candidate can equal a reserved word. The coupling is incidental, not
  // enforced: adding a HYPHENATED entry to RESERVED_SLUGS opens that path, and each
  // candidate below would then need its own `RESERVED_SLUGS.has(candidate)` guard.
  if (!RESERVED_SLUGS.has(root)) {
    const probe = await probeTaken(isTaken, root, traceId)
    if (!probe.ok) return err(probe.error)
    if (!probe.data) return ok(root)
  }

  for (let n = NUMERIC_SUFFIX_FIRST; n <= NUMERIC_SUFFIX_LAST; n += 1) {
    const candidate = `${root}-${n}`
    const probe = await probeTaken(isTaken, candidate, traceId)
    if (!probe.ok) return err(probe.error)
    if (!probe.data) return ok(candidate)
  }

  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt += 1) {
    const candidate = `${root}-${randomSuffix()}`
    const probe = await probeTaken(isTaken, candidate, traceId)
    if (!probe.ok) return err(probe.error)
    if (!probe.data) return ok(candidate)
  }

  // The message carries the derived root, never the raw display name -- that name is
  // model- or user-supplied and this string is surfaced in the UI.
  return err(appError('VALIDATION_ERROR', `could not derive a free slug from "${root}"`, traceId))
}
