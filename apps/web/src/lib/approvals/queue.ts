import type { PostStatus } from '@sahoda/shared'

import type { DisplayPost } from '@/lib/posts/display-post'
import { canApprove } from '@/lib/planner/transitions'
import { rungFor } from '@/lib/posts/rung'

/**
 * WHAT "NEEDS YOU" MEANS, DEFINED ONCE.
 *
 * ── THE RULE THIS FILE EXISTS TO KEEP ────────────────────────────────────────
 * `nav-item.tsx` states it: the sidebar badge, the Home count and the page's own
 * header must read ONE collection, "because a separate pendingCount field will
 * eventually disagree with it". Approvals is the first consumer of that badge,
 * so the moment there are three readers there must be one definition — and the
 * definition is the risky half, not the query. Two screens filtering the same
 * rows by two slightly different predicates disagree exactly as badly as two
 * queries would, and it is harder to see.
 *
 * ── THE DEFINITION, AND WHY IT IS THE URGENT RUNG ────────────────────────────
 * `rungFor(intent) === 'urgent'` — `review`, `failed`, `partial`. That is the
 * status ladder's own answer to "how much does this need me right now?", it
 * already drives Home, and deriving the queue from it rather than from a fresh
 * list of statuses means a new `PostStatus` lands in both places or neither.
 *
 * A DRAFT IS NOT ON THIS QUEUE. It is waiting on you in the sense that
 * everything unfinished is, and a queue containing everything unfinished is a
 * list of everything, which nobody reads. Drafts live on /posts.
 *
 * ── AND WHY THE QUEUE IS SPLIT IN TWO ────────────────────────────────────────
 * The three urgent statuses need you for two DIFFERENT reasons, and the action
 * differs: `review` wants a decision (approve or send back), `failed` and
 * `partial` want a repair. Bulk-approving a failed post is meaningless — the
 * approve transition does not even accept it (`APPROVABLE_FROM`) — so a single
 * list with one Approve button would offer an action that silently does nothing
 * for a third of its rows.
 *
 * One collection, read once, presented as two. The COUNT is the whole
 * collection, because both halves are things waiting on a person.
 */

/** Everything on this queue, in one place, so a caller cannot invent a fourth. */
export function needsAPerson(intent: PostStatus): boolean {
  return rungFor(intent) === 'urgent'
}

/** A decision is owed: someone sent it for review and it can still be approved. */
export function awaitsDecision(intent: PostStatus): boolean {
  return needsAPerson(intent) && canApprove(intent)
}

/** A repair is owed: it went out badly, or only partly. */
export function awaitsRepair(intent: PostStatus): boolean {
  return needsAPerson(intent) && !canApprove(intent)
}

export interface ApprovalQueue {
  /** Waiting on a decision. Bulk-approvable. */
  readonly decisions: readonly DisplayPost[]
  /** Waiting on a repair. Never bulk-approvable. */
  readonly repairs: readonly DisplayPost[]
  /** Both halves. The number the badge and the header both show. */
  readonly total: number
}

/**
 * Split a workspace's posts into the queue.
 *
 * Pure, and takes `DisplayPost` rather than `Post`, so it reads `intent` and
 * cannot reach for `status` to claim an outcome the variant rows never reported
 * (see `display-post.ts`).
 */
export function splitQueue(posts: readonly DisplayPost[]): ApprovalQueue {
  const decisions = posts.filter((post) => awaitsDecision(post.intent))
  const repairs = posts.filter((post) => awaitsRepair(post.intent))
  return { decisions, repairs, total: decisions.length + repairs.length }
}
