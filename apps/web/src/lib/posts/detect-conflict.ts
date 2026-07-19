/**
 * Last-write-wins conflict detection for the 2s-debounce post autosave (FSD 3.1).
 *
 * `posts` has an `updated_at` trigger but NO version column, so there is no
 * compare-and-set to lean on the way `resolve_brand_memory` does for the Brand
 * Brain (`p_expected_version` → VERSION_CONFLICT, see
 * `apps/web/src/app/actions/brand-resolve.ts`). All we can do is compare the
 * `updated_at` we loaded the row at against the `updated_at` the row carried
 * immediately BEFORE our write landed.
 *
 * ASSUMPTION — `serverUpdatedAt` is the row's PRE-write timestamp. A PostgREST
 * `.update(...).select('updated_at').single()` returns the row AFTER the write,
 * with the trigger having already bumped `updated_at`; feeding that value in here
 * would flag every single save as a conflict. The caller must instead read
 * `updated_at` in the same action just before the update (or filter the update on
 * `.eq('updated_at', loadedUpdatedAt)` and re-read `updated_at` when it matches
 * zero rows) and pass THAT value.
 *
 * The write itself is never blocked — last-write-wins is the spec (FSD 3.1:
 * "conflict = last-write-wins with toast + restore option"). A conflict only
 * means: we overwrote a newer edit, so tell the user honestly and offer to
 * restore the version we clobbered.
 *
 * CALLER CONTRACT FOR "restore" — `theirsUpdatedAt` is a timestamp, not content,
 * and our write has already destroyed the row we are offering to restore. There
 * is no revision table (see `PostSchema` in `@sahoda/shared`), so the caller MUST
 * capture the pre-write `body`/`title` in the same read that produced
 * `serverUpdatedAt` and hold it for the restore action. This module deliberately
 * does not carry that payload — it stays pure — but the copy promises a restore,
 * so a caller that cannot honour it must not surface this message.
 *
 * Pure module: no I/O, no clock, no framework.
 */

export type ConflictCheck =
  { conflict: false } | { conflict: true; message: string; theirsUpdatedAt: string }

/**
 * Honest, verb-first copy: our save DID go through, and the other version is
 * recoverable. Carries no timestamps, ids or database wording — the raw
 * `theirsUpdatedAt` travels beside it as data for the restore affordance.
 *
 * Claims NO authorship. `posts` records `created_by` but nothing records who
 * last updated a row, so we cannot know whether the edit we overwrote came from
 * a teammate or from this same user in a second tab — the commonest autosave
 * collision of all. Saying "someone else" would be inventing a fact.
 */
const CONFLICT_MESSAGE =
  'Saved over a newer version of this post — restore it if that was not intended.'

/** Frozen: returned by reference on every clean check, so it must not be mutable. */
const NO_CONFLICT: ConflictCheck = Object.freeze({ conflict: false })

/**
 * An explicit UTC offset or `Z` at the end of the string. A `timestamptz` always
 * comes back from PostgREST with one.
 */
const HAS_ZONE = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i

/**
 * Parse a Postgres `timestamptz` as PostgREST renders it. Returns `null` for a
 * missing, empty or unparseable value so callers degrade to "unknown" instead of
 * throwing or, worse, inventing a conflict.
 *
 * Comparison is on the parsed instant, never the string: `...T10:00:00Z`,
 * `...T10:00:00+00:00` and `...T15:30:00+05:30` are the same moment written three
 * ways, and string equality would false-positive on all of them.
 *
 * A zone-less string is rejected rather than parsed. `new Date('2026-07-19T10:00:00')`
 * resolves in the HOST's timezone, so the identical pair of strings compares as a
 * conflict on a browser in Asia/Kolkata and as no conflict on a UTC server — and
 * this module runs in both. Refusing zone-less input keeps the verdict a function
 * of the data alone.
 */
function toInstant(value: string | null): number | null {
  if (value === null) return null
  const trimmed = value.trim()
  if (trimmed === '' || !HAS_ZONE.test(trimmed)) return null
  const millis = new Date(trimmed).getTime()
  return Number.isNaN(millis) ? null : millis
}

/**
 * True only when `a` is a strictly later instant than `b`. An unknown value on
 * either side is never "newer" — we do not guess.
 */
export function isNewer(a: string | null, b: string | null): boolean {
  const left = toInstant(a)
  const right = toInstant(b)
  if (left === null || right === null) return false
  return left > right
}

/**
 * Decide whether someone else wrote the row between our load and our save.
 *
 * Requires both timestamps to be present and parseable: if we cannot PROVE a
 * concurrent edit we stay silent and let last-write-wins stand, rather than
 * showing a restore prompt we cannot honour (a brand-new draft has no loaded
 * timestamp at all).
 */
export function detectConflict(
  loadedUpdatedAt: string | null,
  serverUpdatedAt: string | null,
): ConflictCheck {
  if (serverUpdatedAt === null || !isNewer(serverUpdatedAt, loadedUpdatedAt)) return NO_CONFLICT
  return { conflict: true, message: CONFLICT_MESSAGE, theirsUpdatedAt: serverUpdatedAt }
}
