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
 * The post statuses whose schedule is SETTLED and may no longer be moved.
 *
 * Not a fourth restatement — the one definition. Three copies of this list existed
 * before it was written down here, all four entries deep and all four in agreement,
 * which is exactly how a list like this looks right up until it isn't:
 *
 *   · `reschedule_post`            → POST_NOT_RESCHEDULABLE  (20260804000001)
 *   · `release_post_for_publish`   → POST_NOT_RELEASABLE     (20260804000000)
 *   · `savePost` in apps/web       → a hand copy of the first
 *
 * The two SQL guards remain hand-written — a SQL function cannot import this, and
 * only the wt-db lane may write migrations — so what binds them is a test:
 * `packages/db/tests/schedule_guard_parity.test.ts` parses both function bodies out
 * of the migrations and fails if either list stops matching this one. That test
 * needs no database and therefore always runs.
 *
 * Why these four and not more:
 *   · `published` / `failed` / `expired` — the attempt already happened. Moving the
 *     time re-arms the dispatcher on something already settled.
 *   · `publishing` — a run holds a claim right now, and it has already sent a request
 *     carrying the old `scheduled_at`. The idempotency key is derived from that time,
 *     so moving it under an in-flight request mints a second key for one piece of work.
 *
 * `partial` is deliberately ABSENT. A partly-published post still has channels worth
 * rescheduling; its published ones are caught by each RPC's separate
 * POST_ALREADY_GOING_OUT check on the variants, which is a finer instrument than a
 * status check can be.
 */
export const NOT_RESCHEDULABLE_STATUSES = [
  'published',
  'failed',
  'expired',
  'publishing',
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
