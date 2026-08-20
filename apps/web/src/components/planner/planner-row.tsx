import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import type { Channel } from '@sahoda/shared'

import { CampaignTag } from '@/components/campaigns/campaign-tag'
import { ApproveButton } from '@/components/planner/approve-button'
import { PlannerReschedule } from '@/components/planner/planner-reschedule'
import { AutoPublishNote } from '@/components/posts/auto-publish-note'
import { LiveChannelChips } from '@/components/posts/live/live-channel-chips'
import type { VariantStatusRow } from '@/lib/posts/variant-status'
import { AgencyBlade } from '@/components/posts/agency-blade'
import { LiveStatusBadge } from '@/components/posts/live/live-status-badge'
import type { DisplayPost } from '@/lib/posts/display-post'
import { formatScheduledAt } from '@/lib/posts/schedule-format'
import { cn } from '@/lib/utils'

export interface PlannerRowProps {
  /**
   * Whether the scheduled dispatcher is on in this environment (server fact from
   * `autoPublishEnabled()`). Defaults false so a forgotten call site under-promises
   * rather than claiming an auto-publish that will not happen.
   */
  autoPublish?: boolean
  /**
   * Per-channel publish state, batched for the whole page by `listVariantStates`.
   * Required in position — it is the sole evidence behind the status chip. See
   * `PostCardProps.variantStates` for why it stopped being optional.
   */
  variantStates: readonly VariantStatusRow[]
  post: DisplayPost
  /** One instant for the whole list, read on the server. See `AutoPublishNote`. */
  now: Date
  /** Channels with a live connection. Passed through to the reschedule control. */
  connected?: ReadonlySet<Channel>
  /**
   * The campaigns this post is grouped under, if the membership read succeeded.
   *
   * `undefined` — not an empty array — is the shape for "we could not read the
   * memberships", and it renders nothing. An empty array claims the post is in
   * no campaign, and a hiccup that silently stripped a label the customer put
   * there would look like the app losing their grouping.
   */
  campaigns?: ReadonlyArray<{ id: string; name: string }>
}

/**
 * One post in the planner list — slimmer than `PostCard` (no excerpt, no
 * delete) because this screen is about states and times, not content. Server
 * component; the approve and reschedule controls are the client islands.
 */
export function PlannerRow({
  autoPublish = false,
  variantStates,
  post,
  now,
  connected,
  campaigns,
}: PlannerRowProps) {
  const title = post.title?.trim()
  const scheduledAt = formatScheduledAt(post.scheduled_at)
  // Distinct at the row boundary — see `post-card.tsx`. This row had the same
  // local de-dupe for its chips while handing the RAW array to `PlannerReschedule`
  // one branch below, which is the shape of every duplicate-channel defect so far.
  const channels = post.channels

  return (
    <div className="rounded-card border border-line bg-bg px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <AgencyBlade origin={post.origin} />
          <Link
            href={`/posts/${post.id}`}
            className={cn(
              'inline-flex max-w-[32ch] items-center truncate rounded-input text-[15px] font-bold transition-micro hover:text-accent max-narrow:min-h-[44px]',
              !title && 'font-semibold text-muted',
            )}
          >
            {title || 'Untitled post'}
          </Link>
          <LiveStatusBadge postId={post.id} intent={post.intent} variants={variantStates} />
          <CampaignTag campaigns={campaigns} />
          {channels.length > 0 ? (
            <LiveChannelChips
              postId={post.id}
              channels={channels}
              initialRows={variantStates}
              className="flex flex-wrap items-center gap-1.5 text-[12.5px]"
            />
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
          {/* Intent, legitimately: approving is a decision about the post, not a
              claim about what it did. */}
          <ApproveButton postId={post.id} status={post.intent} />
          <PlannerReschedule
            postId={post.id}
            channels={post.channels}
            value={post.scheduled_at}
            connected={connected}
            autoPublish={autoPublish}
          />
        </div>
      </div>

      {/* Full width under the row: this qualifies the badge and the time above
          it, and must not compete with them for space on a narrow screen. */}
      <AutoPublishNote
        intent={post.intent}
        scheduledAt={post.scheduled_at}
        now={now}
        variants={variantStates}
        autoPublish={autoPublish}
        className="mt-2"
      />
    </div>
  )
}
