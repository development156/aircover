import type { ZernioComment } from '@sahoda/publishing'
import { EyeOff, Heart } from 'lucide-react'

import { CommentReply } from './comment-reply'

const WHEN = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
})

function formatWhen(value: string | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : WHEN.format(parsed)
}

/**
 * One comment.
 *
 * ── PERMISSIONS ARE READ, NOT GUESSED ────────────────────────────────────────
 * `canReply` / `canHide` / `canDelete` / `canLike` arrive WITH the comment. Whether an
 * action is possible varies per comment — Instagram and Facebook differ, and a comment
 * on someone else's post differs from one on your own — so there is no rule to infer it
 * from.
 *
 * The write surface has landed for REPLIES, and `canReply` is now exactly what that
 * file predicted it would become: the `disabled` prop on the reply control, rather than
 * a sentence describing a capability nobody could use. `canHide` / `canDelete` /
 * `canLike` still have no handler behind them and so are still stated, not offered — an
 * enabled control with nothing behind it is a promise broken on click.
 *
 * ── `canReply` IS MISSING MORE OFTEN THAN IT IS FALSE ────────────────────────
 * The gate is `!== false`, not `=== true`. Zernio omits the field on some rows, and
 * treating absent as "cannot reply" would hide the control on comments that are
 * perfectly repliable. An absent permission is unknown, and the honest handling of
 * unknown here is to let the attempt happen and report the platform's own answer —
 * unlike a send window, a wrong guess costs a 403, not a message to the wrong person.
 */
export function CommentCard({
  comment,
  accountId,
  platformPostId,
}: {
  comment: ZernioComment
  accountId: string
  platformPostId: string
}) {
  const when = formatWhen(comment.createdTime)
  const who = comment.from?.name ?? comment.from?.username ?? 'Unknown'

  return (
    <article
      data-comment-id={comment.id}
      className="rounded-card border border-line bg-bg px-4 py-3 shadow-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-bold">{who}</span>
        {comment.from?.isOwner ? (
          <span className="rounded-pill bg-tint-100 px-2 py-[2px] text-[12px] leading-[18px] font-semibold text-accent dark:bg-s2">
            You
          </span>
        ) : null}
        {comment.isHidden ? (
          <span className="inline-flex items-center gap-1 rounded-pill bg-s2 px-2 py-[2px] text-[12px] leading-[18px] font-semibold text-muted">
            <EyeOff size={12} aria-hidden />
            Hidden
          </span>
        ) : null}
        {when ? <span className="text-[13px] text-muted tabular-nums">{when}</span> : null}
      </div>

      <p className="mt-1.5 max-w-[70ch] text-[14px] leading-[22px]">{comment.message}</p>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-muted">
        {typeof comment.likeCount === 'number' ? (
          <span className="inline-flex items-center gap-1">
            <Heart size={13} aria-hidden />
            <span className="tabular-nums">{comment.likeCount.toLocaleString('en-IN')}</span>
          </span>
        ) : null}
        {typeof comment.replyCount === 'number' && comment.replyCount > 0 ? (
          <span className="tabular-nums">
            {comment.replyCount.toLocaleString('en-IN')}{' '}
            {comment.replyCount === 1 ? 'reply' : 'replies'}
          </span>
        ) : null}
        {comment.canReply === false ? (
          <span>{comment.from?.isOwner ? 'No reply thread here' : 'Replies not allowed here'}</span>
        ) : null}
      </div>

      <CommentReply
        accountId={accountId}
        platformPostId={platformPostId}
        commentId={comment.id}
        canReply={comment.canReply !== false}
      />
    </article>
  )
}
