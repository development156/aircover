import Link from 'next/link'
import { CalendarClock } from 'lucide-react'

import { AgencyBlade } from '@/components/posts/agency-blade'
import { AutoPublishNote } from '@/components/posts/auto-publish-note'
import { LiveChannelChips } from '@/components/posts/live/live-channel-chips'
import type { VariantStatusRow } from '@/lib/posts/variant-status'
import { DeletePostButton } from '@/components/posts/delete-post-button'
import { MetricStrip } from '@/components/posts/metric-strip'
import { LiveStatusBadge } from '@/components/posts/live/live-status-badge'
import type { ChannelMetrics } from '@/lib/analytics/post-metrics'
import { Card } from '@/components/ui/card'
import type { DisplayPost } from '@/lib/posts/display-post'
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
  post: DisplayPost
  /**
   * Per-channel publish state, batched for the whole page by `listVariantStates`.
   *
   * Required in position. It used to be optional, which was survivable while it
   * only fed the auto-publish note; now it is the sole evidence behind the
   * status chip, and a call site that forgot it would get `unknown` and quietly
   * fall back to the stale intent word — the defect this card was changed to fix.
   * Pass `[]` to mean "no rows".
   */
  variantStates: readonly VariantStatusRow[]
  /**
   * Per-channel metrics, batched for the whole page by `listPostMetrics`.
   *
   * Absent means the page did not ask (no workspace, no key) — which renders
   * nothing rather than zeroes, the same rule the strip itself follows.
   */
  metrics?: readonly ChannelMetrics[]
  /** One instant for the whole list, read on the server. See `AutoPublishNote`. */
  now: Date
}

export function PostCard({
  autoPublish = false,
  post,
  now,
  variantStates,
  metrics,
}: PostCardProps) {
  const title = post.title?.trim()
  const displayTitle = title || 'Untitled post'
  const excerpt = excerptOf(post.body)
  const scheduledAt = formatScheduledAt(post.scheduled_at)
  // Distinct already: `post.channels` is a `ChannelSet`, deduplicated once when
  // the row was parsed. `posts.channels` is still a bare `text[]` with no unique
  // constraint, so a repeated value is storable — it just cannot survive the read.
  // This used to de-dupe here, one of four component-local copies of the same
  // three characters, and the copies are what let the bug keep moving.
  const channels = post.channels

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
          {/* Live: a publisher can move this row while the list is open, and
              the badge is the first place that shows. Intent and evidence travel
              together — see `live-status-badge.tsx`. */}
          <LiveStatusBadge postId={post.id} intent={post.intent} variants={variantStates} />
        </div>

        {excerpt ? (
          <p className="mt-2 line-clamp-2 text-[14px] text-muted">{excerpt}</p>
        ) : (
          <p className="mt-2 text-[14px] text-muted">No content written yet.</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12.5px]">
          {channels.length > 0 ? (
            /* Live: this is where the platform link appears, the moment the
               permalink lands on the variant row. */
            <LiveChannelChips
              postId={post.id}
              channels={channels}
              initialRows={variantStates}
              className="flex flex-wrap items-center gap-1.5"
            />
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
          intent={post.intent}
          scheduledAt={post.scheduled_at}
          now={now}
          variants={variantStates}
          autoPublish={autoPublish}
          className="mt-2"
        />

        {/* Below the publish claim, because a metric only means anything once the
            post is out — and above the fold of the card, because "how did it do"
            is the question this screen gets opened for. */}
        <MetricStrip metrics={metrics ?? []} className="mt-3" />
      </Link>

      <div className="mt-4 flex justify-end border-t border-line pt-3">
        <DeletePostButton postId={post.id} title={displayTitle} />
      </div>
    </Card>
  )
}
