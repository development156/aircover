import type { PostStatus } from '../enums'

/**
 * The two post statuses the scheduled-publish dispatcher acts on.
 *
 * `approved` carries the weight here, not `scheduled`. There is no separate "schedule"
 * action in the product — approving a post that already has a time IS scheduling it — so
 * in practice a post waiting to go out sits at `approved`. A gate keyed on `scheduled`
 * alone would match almost nothing.
 *
 * Exported so the SQL candidate query builds its IN-list from the same source as the
 * predicate below. Two hand-written copies of this list is precisely how the badge and
 * the behaviour drift apart.
 */
export const DISPATCHABLE_STATUSES = [
  'approved',
  'scheduled',
] as const satisfies readonly PostStatus[]

/**
 * Whether a post is one the dispatcher may pick up: `status IN ('approved','scheduled')`
 * AND it has a real scheduled time.
 *
 * This is the single definition of "is this post waiting to go out", shared so that what
 * the UI promises and what the job does cannot disagree. A badge that says "Scheduled"
 * over a post the dispatcher will never look at is the bug class this exists to prevent.
 *
 * Deliberately excluded:
 * - `publishing` — a run is in flight right now. Re-dispatching would double-post.
 * - `published` / `failed` / `expired` — terminal; the attempt already happened.
 * - `idea` / `draft` / `review` — a date on an unapproved post is a plan, not a commitment.
 *
 * Says nothing about WHEN. Due-ness and the lateness grace are the dispatcher's to apply;
 * this only answers whether the post is eligible at all.
 */
export function isDispatchable(status: PostStatus, scheduledAt: string | null): boolean {
  if (!(DISPATCHABLE_STATUSES as readonly string[]).includes(status)) return false
  if (scheduledAt === null || scheduledAt.length === 0) return false

  // An unparseable value is not a schedule. Letting it through would hand the dispatcher a
  // NaN instant, and `NaN < now` is false — so it would never be due, never expire, and sit
  // in the candidate set forever.
  return Number.isFinite(Date.parse(scheduledAt))
}
