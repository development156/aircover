'use client'

import { sendReviewReply } from '@/app/actions/inbox-send'

import { InlineReply } from './inline-reply'

/**
 * Reply to a review.
 *
 * ── THIS PATH HAS NEVER RUN, AND THE SURFACE SAYS SO ELSEWHERE ───────────────
 * No Google Business Profile has ever connected to this codebase, so the review row
 * shape and this reply are both `[DOC]` (doc 13 §0). The control ships because it is the
 * path the first connected GBP will take — not because it has worked once.
 *
 * The honesty lives at the page level rather than here: with nothing connected, the
 * reviews surface renders "reviews appear once a Google Business Profile is connected"
 * and no card is drawn at all, so this component never renders. Putting a "not tested
 * yet" caveat on the button as well would be a warning shown only to the customer who
 * has got past that — the one for whom it is least useful.
 *
 * ── A REPLIED REVIEW IS NOT RE-REPLIED ───────────────────────────────────────
 * `hasReply` comes back with the row. Google keeps ONE reply per review — a second
 * overwrites the first — so a review that already carries one disables the control
 * rather than silently replacing words the shop owner wrote earlier.
 */
export interface ReviewReplyProps {
  accountId: string
  /** For Google Business this is the full resource name, slashes and all. */
  reviewId: string
  hasReply: boolean
}

export function ReviewReply({ accountId, reviewId, hasReply }: ReviewReplyProps) {
  return (
    <InlineReply
      fieldId={`review-reply-${reviewId}`}
      label="Your reply"
      canReply={!hasReply}
      send={(body) => sendReviewReply(accountId, reviewId, body)}
    />
  )
}
