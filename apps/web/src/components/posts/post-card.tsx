import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import type { Post } from '@sahoda/shared'

import { AgencyBlade } from '@/components/posts/agency-blade'
import { AutoPublishNote } from '@/components/posts/auto-publish-note'
import { CHANNEL_SHORT } from '@/components/posts/channel-label'
import { DeletePostButton } from '@/components/posts/delete-post-button'
import { StatusBadge } from '@/components/posts/status-badge'
import { Card } from '@/components/ui/card'
import type { PostPublishMode } from '@/lib/posts/certainty'
import { formatScheduledAt } from '@/lib/posts/schedule-format'
import { cn } from '@/lib/utils'

/**
 * One post in the list. Server component — the only client island inside it is
 * the delete control, so the card itself costs no JS.
 */

const EXCERPT_MAX_CHARS = 220

function excerptOf(body: string | null): string | null {
  const trimmed = body?.trim()
  if (!trimmed) return null
  // Sliced by CODE POINT, not UTF-16 unit — the same unit `charCountFor` counts
  // in. A plain `.slice()` cuts an emoji in half when the boundary lands between
  // its surrogates and renders a replacement char.
  const chars = Array.from(trimmed)
  if (chars.length <= EXCERPT_MAX_CHARS) return trimmed
  return `${chars.slice(0, EXCERPT_MAX_CHARS).join('').trimEnd()}…`
}

export interface PostCardProps {
  /**
   * Whether the scheduled dispatcher is on in this environment (server fact from
   * `autoPublishEnabled()`). Defaults false so a forgotten call site under-promises
   * rather than claiming an auto-publish that will not happen.
   */
  autoPublish?: boolean
  post: Post
  /** One instant for the whole list, read on the server. See `AutoPublishNote`. */
  now: Date
  /**
   * What the publish logs prove about this post. Required, and `null` when
   * unknown — the chip then renders the weaker claim rather than "it happened".
   */
  mode: PostPublishMode
}

export function PostCard({ autoPublish = false, post, now, mode }: PostCardProps) {
  const title = post.title?.trim()
  const displayTitle = title || 'Untitled post'
  const excerpt = excerptOf(post.body)
  const scheduledAt = formatScheduledAt(post.scheduled_at)
  // `posts.channels` is a bare `text[]` with no unique constraint, so a repeated
  // value is storable. De-dupe for render: it keeps React keys unique and stops
  // the same channel showing twice, which would read as two destinations.
  const channels = [...new Set(post.channels)]

  return (
    // `group` drives the title hover. The focus ring is deliberately left to the
    // global `:focus-visible` rule in globals.css (the 2px --acc a11y floor):
    // the link below is `block`, so it already spans the card's whole content
    // area and the stock ring lands in the right place. No bespoke ring utility
    // here — an unverified colour utility that fails to compile would delete the
    // ring silently.
    <Card interactive className="group hover:shadow-pop active:translate-y-0">
      <Link href={`/posts/${post.id}`} data-guide="posts.card" className="block rounded-input">
        <div className="flex items-start justify-between gap-3">
          {/* The blade sits with the TITLE, never with the status chip: it says
              Sahoda drafted this post, and placing it beside a publish claim
              would read as "Sahoda published it" — which no column records. */}
          <h2
            className={cn(
              'flex items-center gap-2 text-[17px] leading-6 font-bold transition-micro group-hover:text-accent',
              !title && 'font-semibold text-muted',
            )}
          >
            <AgencyBlade origin={post.origin} />
            {displayTitle}
          </h2>
          <StatusBadge status={post.status} mode={mode} />
        </div>

        {excerpt ? (
          <p className="mt-2 line-clamp-2 text-[14px] text-muted">{excerpt}</p>
        ) : (
          <p className="mt-2 text-[14px] text-muted">No content written yet.</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12.5px]">
          {channels.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-1.5">
              {channels.map((channel) => (
                <li
                  key={channel}
                  className="rounded-pill bg-s2 px-2 py-[2px] font-medium text-muted"
                >
                  {CHANNEL_SHORT[channel]}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted">No channels picked yet</span>
          )}

          {scheduledAt ? (
            <span className="inline-flex items-center gap-1.5 text-muted">
              <CalendarClock size={14} strokeWidth={1.8} aria-hidden />
              <span className="tabular-nums">{scheduledAt}</span>
            </span>
          ) : null}
        </div>

        {/* Directly under the badge and the time it qualifies — the two things
            that together read as "this goes out on its own". */}
        <AutoPublishNote
          status={post.status}
          scheduledAt={post.scheduled_at}
          now={now}
          autoPublish={autoPublish}
          className="mt-2"
        />
      </Link>

      <div className="mt-4 flex justify-end border-t border-line pt-3">
        <DeletePostButton postId={post.id} title={displayTitle} />
      </div>
    </Card>
  )
}
