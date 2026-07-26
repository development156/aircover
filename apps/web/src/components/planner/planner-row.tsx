import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import type { Post } from '@sahoda/shared'

import { ApproveButton } from '@/components/planner/approve-button'
import { PlannerReschedule } from '@/components/planner/planner-reschedule'
import { AutoPublishNote } from '@/components/posts/auto-publish-note'
import { CHANNEL_SHORT } from '@/components/posts/channel-label'
import { StatusBadge } from '@/components/posts/status-badge'
import { formatScheduledAt } from '@/lib/posts/schedule-format'
import { cn } from '@/lib/utils'

export interface PlannerRowProps {
  post: Post
  /** One instant for the whole list, read on the server. See `AutoPublishNote`. */
  now: Date
}

/**
 * One post in the planner list — slimmer than `PostCard` (no excerpt, no
 * delete) because this screen is about states and times, not content. Server
 * component; the approve and reschedule controls are the client islands.
 */
export function PlannerRow({ post, now }: PlannerRowProps) {
  const title = post.title?.trim()
  const scheduledAt = formatScheduledAt(post.scheduled_at)
  const channels = [...new Set(post.channels)]

  return (
    <div className="rounded-card border border-line bg-bg px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <Link
            href={`/posts/${post.id}`}
            className={cn(
              'max-w-[32ch] truncate rounded-input text-[15px] font-bold transition-micro hover:text-accent',
              !title && 'font-semibold text-muted',
            )}
          >
            {title || 'Untitled post'}
          </Link>
          <StatusBadge status={post.status} />
          {channels.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
              {channels.map((channel) => (
                <li
                  key={channel}
                  className="rounded-pill bg-s2 px-2 py-[2px] font-medium text-muted"
                >
                  {CHANNEL_SHORT[channel]}
                </li>
              ))}
            </ul>
          ) : null}
          {scheduledAt ? (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
              <CalendarClock size={14} strokeWidth={1.8} aria-hidden />
              <span className="tabular-nums">{scheduledAt}</span>
            </span>
          ) : (
            <span className="text-[12.5px] text-muted">Not scheduled</span>
          )}
        </div>

        <div className="flex items-start gap-2">
          <ApproveButton postId={post.id} status={post.status} />
          <PlannerReschedule postId={post.id} channels={post.channels} value={post.scheduled_at} />
        </div>
      </div>

      {/* Full width under the row: this qualifies the badge and the time above
          it, and must not compete with them for space on a narrow screen. */}
      <AutoPublishNote
        status={post.status}
        scheduledAt={post.scheduled_at}
        now={now}
        className="mt-2"
      />
    </div>
  )
}
