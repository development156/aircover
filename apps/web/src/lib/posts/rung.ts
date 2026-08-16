import type { PostStatus } from '@sahoda/shared'

import type { Rung } from '@/components/ui/badge'

/**
 * Post status → status-ladder rung (SPECIFICATION.md §3).
 *
 * THE RUNG IS URGENCY. It answers "how much does this need me right now?", and
 * nothing else. It is deliberately NOT `certaintyFor()`, which answers "how real
 * is this?" — the two axes are orthogonal and each has cases the other gets
 * backwards:
 *
 *   published  maximally REAL      · minimally URGENT  → .is-real  + rung 4
 *   review     not real at all     · maximally URGENT  → .is-proposed + rung 1
 *
 * Read together they are complete; collapsed into one they are wrong in both
 * directions. `status-badge.tsx` renders certainty; this renders urgency.
 *
 * `satisfies Record<PostStatus, Rung>` so that adding a value to
 * `PostStatusSchema` is a COMPILE ERROR here rather than silently defaulting a
 * new status to the quietest rung — which is exactly how a "failed" state ends
 * up whispering.
 */
export const STATUS_RUNG = {
  // Rung 1 — needs you now. "Failed" and "needs approval" are the same rung:
  // loudest is URGENT, not bad (RETHEME.md §5).
  review: 'urgent',
  failed: 'urgent',
  // Live on one channel and definitively not going out on another. Someone has
  // to decide what happens to the rest, so it needs a person.
  partial: 'urgent',

  // Rung 2 — happening right now, under its own steam.
  publishing: 'active',

  // Rung 3 — committed, waiting on time rather than on a person.
  approved: 'pending',
  scheduled: 'pending',

  // Rung 4 — nothing is owed. Note how different `published` and `expired` are
  // as outcomes, and how identically little either needs from you.
  idea: 'calm',
  draft: 'calm',
  published: 'calm',
  expired: 'calm',
} satisfies Record<PostStatus, Rung>

export function rungFor(status: PostStatus): Rung {
  return STATUS_RUNG[status]
}
