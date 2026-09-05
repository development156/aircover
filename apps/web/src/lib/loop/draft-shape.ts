import type { AutonomyLevel, LoopBriefOutcome, PostStatus } from '@sahoda/shared'

/**
 * WHAT THE CREATE STAGE WRITES FOR A DRAFT, PER RUNG OF THE DIAL.
 *
 * Shared by the Loop's create stage and the playbook executor, because the two
 * used to carry the same three-way conditional by hand and both had it wrong
 * in the same way.
 *
 * ── L2 IS 'review', NOT 'approved', AND THE DIFFERENCE IS THE WHOLE PROMISE ──
 * The customer is told "Sahoda schedules the week and publishes each post once
 * you approve it". Written as `approved`, the post was inside
 * `DISPATCHABLE_STATUSES` the moment it landed, so the sweep would send it at
 * the slot with nobody having approved that post, and no approval card could
 * ever show it: `rung('approved')` is 'pending', not 'urgent', and `approvePost`
 * moves nothing that is already approved. `review` is the one status that is
 * both on the /approvals queue (the urgent rung) and inside `APPROVABLE_FROM`,
 * so a person's Approve is what turns it into `approved`, and the sweep reads
 * `approved`. The slot rides along as `scheduled_at` so the approval schedules
 * it rather than asking for a time again. `draft-shape.test.ts` pins both
 * halves against the real lists, not against this comment.
 *
 * ── L3 IS A DRAFT WITH NO TIME ON IT ─────────────────────────────────────────
 * Autopilot announces a post, waits out the cancel window, and only then arms
 * it (`ARM_FOR_PUBLISH_SQL` admits 'draft'). A post written `approved` with a
 * slot would be sent by the ordinary sweep at that slot, with no window and no
 * stop button, which is the one thing autopilot must never do. So L3 leaves
 * the post exactly where L1 does and lets the dispatcher schedule it.
 */
export interface DraftShape {
  status: PostStatus
  scheduledAt: string | null
  outcome: LoopBriefOutcome
}

export function draftShapeFor(level: AutonomyLevel, suggestedSlot: string | null): DraftShape {
  if (level === 2) {
    return { status: 'review', scheduledAt: suggestedSlot, outcome: 'awaiting_approval' }
  }
  return { status: 'draft', scheduledAt: null, outcome: 'drafted' }
}
