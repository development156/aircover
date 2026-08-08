import type { ZernioCommentedPost } from '@sahoda/publishing'
import { ChevronRight, ExternalLink, MessageSquare } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'

import { platformLabel } from './platform-label'

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
 * `GET /inbox/comments` returns the POSTS that have comments, not the comments — the
 * comments themselves need a second, account-scoped call per post. So this row is a
 * link into that call, carrying both halves of the key for the same reason a thread
 * link does: a post id alone would read against whichever account matched.
 */
export function commentsHref({
  accountId,
  platformPostId,
}: {
  accountId: string
  platformPostId: string
}): Route {
  return `/inbox/comments/${encodeURIComponent(accountId)}/${encodeURIComponent(platformPostId)}` as Route
}

export function CommentedPostRow({ post }: { post: ZernioCommentedPost }) {
  const when = formatWhen(post.createdTime)

  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-bg px-4 py-3 shadow-card transition-micro hover:border-ink">
      <Link
        href={commentsHref({ accountId: post.accountId, platformPostId: post.id })}
        className="min-w-0 flex-1"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-pill bg-s2 px-2 py-[2px] text-[12px] leading-[18px] font-semibold text-muted">
            {platformLabel(post.platform)}
          </span>
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted">
            <MessageSquare size={13} aria-hidden />
            <span className="tabular-nums">{post.commentCount.toLocaleString('en-IN')}</span>
            <span>{post.commentCount === 1 ? 'comment' : 'comments'}</span>
          </span>
          {when ? <span className="text-[13px] text-muted tabular-nums">{when}</span> : null}
        </div>
        <p className="mt-1 line-clamp-2 max-w-[70ch] text-[14px] leading-[21px]">
          {post.content ?? 'This post has no caption.'}
        </p>
      </Link>

      {/* The permalink is a separate control, not the row target — a row that
          sometimes leaves the app and sometimes does not is a coin toss. */}
      {post.permalink ? (
        <a
          href={post.permalink}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Open the original post"
          className="shrink-0 rounded-pill p-1.5 text-muted transition-micro hover:bg-s2 hover:text-ink"
        >
          <ExternalLink size={15} aria-hidden />
        </a>
      ) : null}
      <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden />
    </div>
  )
}
