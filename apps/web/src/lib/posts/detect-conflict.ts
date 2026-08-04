/**
 * Divergence detection for the 2s-debounce post autosave (FSD 3.1).
 *
 * WHAT THIS CAN AND CANNOT KNOW. `posts` has an `updated_at` trigger but NO
 * version column, so there is no compare-and-set to lean on the way
 * `resolve_brand_memory` does for the Brand Brain (`p_expected_version` →
 * VERSION_CONFLICT, see `apps/web/src/app/actions/brand-resolve.ts`). A
 * PostgREST `.update(...).select(...)` returns the row AFTER the write, with the
 * trigger having already bumped `updated_at`, so the only timestamps this client
 * ever sees are POST-write ones.
 *
 * From post-write timestamps alone it is IMPOSSIBLE to say who overwrote whom.
 * This module therefore does not try. It answers exactly one question:
 *
 *   has the row moved to a timestamp we have not accounted for?
 *
 * That is DIVERGENCE — the row changed somewhere other than this editor — and it
 * is the strongest true statement available. `loadedUpdatedAt` is whatever the
 * caller has accounted for so far: the timestamp it loaded the row at, or the
 * timestamp one of its OWN writes produced. `serverUpdatedAt` must come from a
 * FRESH server read (a route re-render), never from the caller's own write
 * response — feeding our own write back in would report divergence on every save.
 *
 * Screening our own writes out is the caller's job, because only the caller knows
 * which timestamps it produced — see the deferral in `use-autosave.ts`.
 *
 * The write itself is never blocked — last-write-wins is the spec (FSD 3.1:
 * "conflict = last-write-wins with toast + restore option").
 *
 * CALLER CONTRACT FOR THE "load that version" AFFORDANCE — `theirsUpdatedAt` is a
 * timestamp, not content. There is no revision table (see `PostSchema` in
 * `@sahoda/shared`), so the caller MUST capture the `body`/`title` from the same
 * read that produced `serverUpdatedAt` and offer THAT as the other version. A
 * caller that cannot honour it must not surface this message.
 *
 * Pure module: no I/O, no clock, no framework.
 */

export type ConflictCheck =
  { conflict: false } | { conflict: true; message: string; theirsUpdatedAt: string }

/**
 * Honest, sentence-case copy. It states only what the timestamps prove: the row
 * moved, and it did not move here.
 *
 * Claims NO save and NO overwrite direction. Our last write may have landed
 * before or after the other one, and nothing in a post-write `updated_at` tells
 * us which — so "saved over a newer version" would be a guess presented as fact.
 *
 * Claims NO authorship either. `posts` records `created_by` but nothing records
 * who last updated a row, so we cannot know whether the other edit came from a
 * teammate or from this same user in a second tab — the commonest autosave
 * collision of all. Naming a culprit would be inventing a fact.
 */
const CONFLICT_MESSAGE = 'This post changed outside this editor while you were writing.'

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
 * throwing or, worse, inventing a divergence.
 *
 * Comparison is on the parsed instant, never the string: `...T10:00:00Z`,
 * `...T10:00:00+00:00` and `...T15:30:00+05:30` are the same moment written three
 * ways, and string equality would false-positive on all of them.
 *
 * A zone-less string is rejected rather than parsed. `new Date('2026-07-19T10:00:00')`
 * resolves in the HOST's timezone, so the identical pair of strings compares as a
 * divergence on a browser in Asia/Kolkata and as no divergence on a UTC server —
 * and this module runs in both. Refusing zone-less input keeps the verdict a
 * function of the data alone.
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
 * Decide whether the row has moved to a timestamp the caller has not accounted
 * for.
 *
 * Requires both timestamps to be present and parseable: if we cannot PROVE the
 * row moved we stay silent and let last-write-wins stand, rather than showing a
 * prompt we cannot honour (a brand-new draft has no loaded timestamp at all).
 */
export function detectConflict(
  loadedUpdatedAt: string | null,
  serverUpdatedAt: string | null,
): ConflictCheck {
  if (serverUpdatedAt === null || !isNewer(serverUpdatedAt, loadedUpdatedAt)) return NO_CONFLICT
  return { conflict: true, message: CONFLICT_MESSAGE, theirsUpdatedAt: serverUpdatedAt }
}
