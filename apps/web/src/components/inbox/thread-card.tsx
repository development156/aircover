import type { InboxMessage, InboxThread } from '@sahoda/shared'

import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { isSentMessage } from '@sahoda/shared'
import { cn } from '@/lib/utils'

import { RatingStars } from './rating-stars'
import { ReplyBox } from './reply-box'

/**
 * One review or comment, with whatever has been written back.
 *
 * A saved-but-unposted reply is labelled as one. That label is the whole point:
 * `platform_message_id` is null until a platform names the message, so the
 * component can tell the two apart without being told, and a draft can never be
 * mistaken for an answer the customer actually gave.
 */
export function ThreadCard({
  thread,
  messages,
}: {
  thread: InboxThread
  messages: readonly InboxMessage[]
}) {
  const replies = messages.filter((m) => m.direction === 'outbound')

  return (
    <article className="space-y-3 rounded-card border border-line bg-bg p-4 shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-bold">{thread.author_name ?? 'Someone'}</span>
            <span className="rounded-pill bg-s1 px-2 py-[2px] text-[12px] text-muted">
              {CHANNEL_LABELS[thread.channel]}
            </span>
            {thread.rating !== null ? <RatingStars rating={thread.rating} /> : null}
          </div>
          {/* The platform's clock, not ours. `first_seen_at` would tell the reader
              when our poll ran, which is not a fact about their customer. */}
          {thread.posted_at ? (
            <p className="text-[12px] text-muted tabular-nums">
              {new Date(thread.posted_at).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          ) : null}
        </div>
        <span
          data-status={thread.status}
          className={cn(
            'rounded-pill px-2 py-[2px] text-[12px] font-semibold',
            thread.status === 'resolved'
              ? 'bg-ok-bg text-ok'
              : thread.status === 'snoozed'
                ? 'bg-s2 text-muted'
                : 'bg-warn-bg text-warn',
          )}
        >
          {thread.status === 'resolved'
            ? 'Replied'
            : thread.status === 'snoozed'
              ? 'Later'
              : 'Open'}
        </span>
      </header>

      {thread.body ? <p className="text-[13.5px] whitespace-pre-wrap">{thread.body}</p> : null}

      {replies.length > 0 ? (
        <ul className="space-y-2 border-l-2 border-line pl-3">
          {replies.map((reply) => (
            <li key={reply.id} className="space-y-0.5">
              <p className="text-[13px] whitespace-pre-wrap">{reply.body}</p>
              <p className={cn('text-[12px]', isSentMessage(reply) ? 'text-ok' : 'text-warn')}>
                {isSentMessage(reply) ? 'Posted on the platform.' : 'Saved here — not posted yet.'}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <ReplyBox threadId={thread.id} permalink={thread.permalink} />
    </article>
  )
}
