import Link from 'next/link'
import type { Post } from '@sahoda/shared'

import { PlannerRow } from '@/components/planner/planner-row'
import { AutoPublishNote } from '@/components/posts/auto-publish-note'
import { STATUS_STYLES } from '@/components/posts/status-badge'
import { formatScheduledTime } from '@/lib/posts/schedule-format'
import type { WeekBuckets } from '@/lib/planner/week'
import { cn } from '@/lib/utils'

/** Column header: weekday + date, in the same IST the buckets are keyed by. */
const DAY_LABEL = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
})

function DayChip({ post, now }: { post: Post; now: Date }) {
  const time = formatScheduledTime(post.scheduled_at)
  return (
    <Link
      href={`/posts/${post.id}`}
      // UXUI 4.4: chips are colored by status — same token pairs as StatusBadge.
      className={cn(
        'block space-y-0.5 rounded-input px-2 py-1.5 transition-micro hover:brightness-95',
        STATUS_STYLES[post.status].className,
      )}
    >
      <span className="block truncate text-[12.5px] leading-4 font-semibold">
        {post.title?.trim() || 'Untitled post'}
      </span>
      {time ? <span className="block text-[11.5px] tabular-nums opacity-80">{time}</span> : null}
      {/* A time in a calendar cell is the strongest auto-publish signal on any
          screen. The cell has no room for the sentence, so it abbreviates —
          and carries the full one for screen readers. */}
      <AutoPublishNote
        status={post.status}
        scheduledAt={post.scheduled_at}
        now={now}
        variant="compact"
      />
    </Link>
  )
}

export interface WeekGridProps {
  buckets: WeekBuckets
  /** One instant for the whole grid — the same one `bucketWeek` was given. */
  now: Date
}

/**
 * Rolling 7-day calendar (Alpha item 7's "week calendar"). Posts that do not
 * fit the window render below it — `bucketWeek` never drops a post, and neither
 * does this component.
 */
export function WeekGrid({ buckets, now }: WeekGridProps) {
  return (
    <div className="space-y-grid">
      <div className="overflow-x-auto">
        <ol className="grid min-w-[840px] grid-cols-7 gap-2" data-guide="planner.week">
          {buckets.days.map((day, index) => (
            <li
              key={day.key}
              className="space-y-1.5 rounded-card border border-line bg-bg p-2 shadow-card"
            >
              <p
                className={cn(
                  'text-[12px] font-semibold tabular-nums',
                  index === 0 ? 'text-accent' : 'text-muted',
                )}
              >
                {DAY_LABEL.format(day.date)}
                {index === 0 ? ' · Today' : ''}
              </p>
              {day.posts.map((post) => (
                <DayChip key={post.id} post={post} now={now} />
              ))}
            </li>
          ))}
        </ol>
      </div>

      {buckets.unscheduled.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-[13px] font-semibold text-muted">Unscheduled</h2>
          {buckets.unscheduled.map((post) => (
            <PlannerRow key={post.id} post={post} now={now} />
          ))}
        </section>
      ) : null}

      {buckets.outside.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-[13px] font-semibold text-muted">Outside this week</h2>
          {buckets.outside.map((post) => (
            <PlannerRow key={post.id} post={post} now={now} />
          ))}
        </section>
      ) : null}
    </div>
  )
}
