import Link from 'next/link'
import type { Post } from '@sahoda/shared'

import { PlannerRow } from '@/components/planner/planner-row'
import { AutoPublishNote } from '@/components/posts/auto-publish-note'
import type { VariantStatusRow } from '@/lib/posts/variant-status'
import { AgencyBlade } from '@/components/posts/agency-blade'
import { certaintyFor, type PostPublishMode } from '@/lib/posts/certainty'
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

/**
 * Certainty level -> the same structural signature the chip uses. The week grid
 * is the surface the system has to work on AT A GLANCE, so a cell carries the
 * dash/hairline/hatch itself rather than only a colour: seven columns of pills
 * distinguished by hue alone are unreadable the moment a tenant re-themes.
 */
const CELL_CERTAINTY: Record<string, string> = {
  real: 'is-real',
  committed: 'is-committed',
  proposed: 'is-proposed',
  simulated: 'is-simulated',
  failed: 'border border-danger bg-transparent text-danger',
  neutral: 'border border-line bg-transparent text-muted',
}

function DayChip({
  post,
  now,
  mode,
  autoPublish,
  variants,
}: {
  post: Post
  now: Date
  mode: PostPublishMode
  autoPublish: boolean
  /** Required, like the note's own prop: see `AutoPublishNote.variants`. */
  variants: readonly VariantStatusRow[]
}) {
  const time = formatScheduledTime(post.scheduled_at)
  const certainty = certaintyFor(post.status, mode)
  return (
    <Link
      href={`/posts/${post.id}`}
      data-certainty={certainty.level}
      className={cn(
        'block space-y-0.5 rounded-input px-2 py-1.5 transition-micro hover:brightness-95',
        CELL_CERTAINTY[certainty.level],
      )}
    >
      <span className="flex items-center gap-1.5 truncate text-[12.5px] leading-4 font-semibold">
        <AgencyBlade origin={post.origin} />
        {post.title?.trim() || 'Untitled post'}
      </span>
      {/* The hatch alone is not a claim — a simulated cell says so in words,
          even here where space is tightest. */}
      {certainty.label !== null ? (
        <span className="type-eyebrow block text-ink-mute">{certainty.label}</span>
      ) : null}
      {time ? <span className="block text-[11.5px] tabular-nums opacity-80">{time}</span> : null}
      {/* A time in a calendar cell is the strongest auto-publish signal on any
          screen. The cell has no room for the sentence, so it abbreviates —
          and carries the full one for screen readers. */}
      <AutoPublishNote
        status={post.status}
        scheduledAt={post.scheduled_at}
        now={now}
        variants={variants}
        autoPublish={autoPublish}
        variant="compact"
      />
    </Link>
  )
}

export interface WeekGridProps {
  /**
   * Whether the scheduled dispatcher is on in this environment (server fact from
   * `autoPublishEnabled()`). Defaults false so a forgotten call site under-promises
   * rather than claiming an auto-publish that will not happen.
   */
  autoPublish?: boolean
  /** Per-channel publish state by post id, batched for the whole page. */
  variantStates?: ReadonlyMap<string, readonly VariantStatusRow[]>
  buckets: WeekBuckets
  /** One instant for the whole grid — the same one `bucketWeek` was given. */
  now: Date
  /** post id -> what the publish logs prove. Absent means unknown, never live. */
  modes: ReadonlyMap<string, PostPublishMode>
}

/**
 * Rolling 7-day calendar (Alpha item 7's "week calendar"). Posts that do not
 * fit the window render below it — `bucketWeek` never drops a post, and neither
 * does this component.
 */
export function WeekGrid({
  autoPublish = false,
  variantStates,
  buckets,
  now,
  modes,
}: WeekGridProps) {
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
                <DayChip
                  key={post.id}
                  post={post}
                  now={now}
                  mode={modes.get(post.id) ?? null}
                  autoPublish={autoPublish}
                  variants={variantStates?.get(post.id) ?? []}
                />
              ))}
            </li>
          ))}
        </ol>
      </div>

      {buckets.unscheduled.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-[13px] font-semibold text-muted">Unscheduled</h2>
          {buckets.unscheduled.map((post) => (
            <PlannerRow
              key={post.id}
              post={post}
              now={now}
              mode={modes.get(post.id) ?? null}
              autoPublish={autoPublish}
              variantStates={variantStates?.get(post.id)}
            />
          ))}
        </section>
      ) : null}

      {buckets.outside.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-[13px] font-semibold text-muted">Outside this week</h2>
          {buckets.outside.map((post) => (
            <PlannerRow
              key={post.id}
              post={post}
              now={now}
              mode={modes.get(post.id) ?? null}
              autoPublish={autoPublish}
              variantStates={variantStates?.get(post.id)}
            />
          ))}
        </section>
      ) : null}
    </div>
  )
}
