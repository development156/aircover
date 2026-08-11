'use client'

import { sendCommentReply } from '@/app/actions/inbox-send'

import { InlineReply } from './inline-reply'

/**
 * Reply to one comment, in public, under the post.
 *
 * ── NO SEND WINDOW, AND THAT IS DELIBERATE ───────────────────────────────────
 * Public comments do not close after 24 hours the way DMs do, so this surface does not
 * consult `evaluateSendWindow` at all. Routing it through the window rules would invent
 * a restriction the platform does not impose — the mirror image of the mistake the
 * window model exists to prevent.
 *
 * ── THE GATE IS A PER-COMMENT PERMISSION, READ NOT INFERRED ──────────────────
 * `canReply` arrives WITH the comment and genuinely varies: Instagram and Facebook
 * differ, and a comment on someone else's post differs from one on your own. There is
 * no rule to derive it from, so it is passed in. The remaining failure is a submit-time
 * 403 — this account may not comment on this post — which comes back as a stated
 * refusal rather than a silent no-op.
 */
export interface CommentReplyProps {
  accountId: string
  platformPostId: string
  commentId: string
  canReply: boolean
}

export function CommentReply({
  accountId,
  platformPostId,
  commentId,
  canReply,
}: CommentReplyProps) {
  return (
    <InlineReply
      fieldId={`comment-reply-${commentId}`}
      label="Your reply"
      canReply={canReply}
      // Threaded under THIS comment rather than posted loose on the post: the fourth
      // argument is what makes it a reply instead of a new top-level comment.
      send={(body) => sendCommentReply(accountId, platformPostId, body, commentId)}
    />
  )
}
