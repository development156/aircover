import Link from 'next/link'
import { CalendarClock, FileText, Timer } from 'lucide-react'
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
import { needsAPerson } from '@/lib/approvals/queue'
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
 * The glyph that opens a row, chosen from the post's own intent.
 *
 * It is a READING of the row, not decoration: a scheduled post gets the clock,
 * one waiting on a person gets the timer that the approvals queue uses, and
 * everything else gets the page. Three marks and no more — a fourth would need a
 * legend, and a legend beside a list is a list that failed to explain itself.
 */
function rowGlyph(post: DisplayPost): typeof FileText {
  if (post.intent === 'scheduled') return CalendarClock
  if (needsAPerson(post.intent)) return Timer
  return FileText
}

/**
 * One post in the planner list — slimmer than `PostCard` (no excerpt, no
 * delete) because this screen is about states and times, not content. Server
 * component; the approve and reschedule controls are the client islands.
 *
 * ── THE 2026-08-28 RESHAPE, AND WHAT DID NOT CHANGE ──────────────────────────
 * Every control, every server action, every copy string and every `data-guide`
 * anchor is exactly as it was. What moved is the SHAPE: the title used to sit in
 * one wrapping flex line with the badge, the campaign tags, six channel chips and
 * the time, so at 1440 the strongest element on the row was whichever of those
 * happened to be widest. Now the title owns the first line and everything that
 * qualifies it sits on the second, quieter, line beneath.
 *
 * The row also lost its own border. Rows are separated by the list's hairline
 * dividers instead, which is the same information at a fraction of the ink —
 * 40 bordered cards in a column read as a spreadsheet, which the founder's brief
 * names as the thing to avoid.
 *
 * `type-h3` and `type-meta` replace the four hand-written pixel sizes this file
 * carried (`text-[15px]`, `text-[12.5px]` ×3). That is a real reduction in
 * `design-lint`'s ratchet, not a wash: the file's baseline goes 4 → 0.
 */
export function PlannerRow({
  zone,
  autoPublish = false,
  variantStates,
  post,
  now,
  connected,
  campaigns,
}: PlannerRowProps & { zone?: string | null }) {
  const title = post.title?.trim()
  const scheduledAt = formatScheduledAt(post.scheduled_at, zone)
  // Distinct at the row boundary — see `post-card.tsx`. This row had the same
  // local de-dupe for its chips while handing the RAW array to `PlannerReschedule`
  // one branch below, which is the shape of every duplicate-channel defect so far.
  const channels = post.channels
  const Glyph = rowGlyph(post)

  return (
    /* The hover warms the GROUND, and that is all it does. Not a `translate`:
       docs/37 §12 forbids animating layout properties and warns off motion on
       list rows, and a row that lifts under the cursor is a row the reader is
       trying to read while it moves. An earlier version of this comment claimed
       a shadow as well; there is no shadow, and saying so was the same defect as
       a comment describing a guarantee its code does not provide. */
    <div className="group relative flex gap-3 px-4 py-3.5 transition-micro hover:bg-s2 narrow:px-5">
      <span
        aria-hidden
        className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-sm bg-s2 text-ink-mute transition-micro group-hover:bg-surface group-hover:text-accent"
      >
        <Glyph size={15} strokeWidth={1.8} />
      </span>

      <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          {/* ── LINE ONE · THE TITLE, AND NOTHING COMPETING WITH IT ────────── */}
          <div className="flex min-w-0 items-center gap-2">
            <AgencyBlade origin={post.origin} />
            <Link
              href={`/posts/${post.id}`}
              className={cn(
                'min-w-0 truncate rounded-input type-h3 transition-micro hover:text-accent',
                // The 44px touch floor, kept from the shape this replaced.
                'max-narrow:inline-flex max-narrow:min-h-11 max-narrow:items-center',
                title ? 'text-ink' : 'text-muted',
              )}
            >
              {title || 'Untitled post'}
            </Link>
          </div>

          {/* ── LINE TWO · EVERYTHING THAT QUALIFIES IT ─────────────────────── */}
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <LiveStatusBadge postId={post.id} intent={post.intent} variants={variantStates} />
            <CampaignTag campaigns={campaigns} />
            {channels.length > 0 ? (
              <LiveChannelChips
                postId={post.id}
                channels={channels}
                initialRows={variantStates}
                className="flex flex-wrap items-center gap-1.5 type-meta"
              />
            ) : null}
            {scheduledAt ? (
              <span className="inline-flex items-center gap-1.5 type-meta text-muted">
                <CalendarClock size={13} strokeWidth={1.8} aria-hidden />
                <span className="tabular-nums">{scheduledAt}</span>
              </span>
            ) : (
              <span className="type-meta text-muted">Not scheduled</span>
            )}
          </div>
        </div>

        {/* Always rendered, never revealed on hover. A control that appears on
            hover is a control a touch screen cannot find, and `Approve` is the
            seeded tour's anchor — a tour cannot point at something not there. */}
        <div className="flex shrink-0 items-start gap-2">
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

        {/* Full width under the row: this qualifies the badge and the time above
            it, and must not compete with them for space on a narrow screen. */}
        <AutoPublishNote
          intent={post.intent}
          scheduledAt={post.scheduled_at}
          now={now}
          variants={variantStates}
          autoPublish={autoPublish}
          className="w-full"
        />
      </div>
    </div>
  )
}
