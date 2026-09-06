import type { DisplayPost } from '@/lib/posts/display-post'

/**
 * THE ORDER A PLAN READS IN.
 *
 * The database hands the list back by `updated_at`, which is the order things
 * were EDITED in, and the planner rendered it as-is: Friday's post above
 * Tuesday's because Friday's was touched last. That is the order of a
 * changelog. A plan reads by time, soonest first, and the posts that have no
 * time yet sit after it — newest edit first, which is the one place edit order
 * still tells the reader something.
 *
 * Instants are compared, not strings: `2026-09-02T20:00:00-04:00` names a later
 * moment than `2026-09-02T23:00:00Z` and a string sort would put it first.
 * An unparseable time is treated as no time rather than thrown on.
 */
function instantOf(iso: string | null): number | null {
  if (iso === null) return null
  const at = Date.parse(iso)
  return Number.isNaN(at) ? null : at
}

export function byPlanOrder(a: DisplayPost, b: DisplayPost): number {
  const atA = instantOf(a.scheduled_at)
  const atB = instantOf(b.scheduled_at)
  if (atA !== null && atB !== null) return atA - atB
  if (atA !== null) return -1
  if (atB !== null) return 1
  return (instantOf(b.updated_at) ?? 0) - (instantOf(a.updated_at) ?? 0)
}

/** A new array in plan order. The input is left as it was. */
export function inPlanOrder(posts: readonly DisplayPost[]): DisplayPost[] {
  return [...posts].sort(byPlanOrder)
}
