import { AlertCircle, CheckCircle2, Clock, ExternalLink, Loader2, MinusCircle } from 'lucide-react'
import type { VariantPublishStatus } from '@sahoda/shared'

import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { GateRefusalNote } from '@/components/posts/gate-refusal-note'
import { describePublishError } from '@/lib/posts/publish-error-copy'
import type { VariantStatusRow } from '@/lib/posts/variant-status'
import { cn } from '@/lib/utils'

/**
 * One post, one line per channel, each telling its own truth.
 *
 * ── WHY THIS IS THE FIX FOR A POST HELD FOREVER ──────────────────────────────
 * The dispatcher refused to settle a partly-published post and said exactly why:
 * "until apps/web can say 'went out on X, did not go out on Google' there is no
 * honest badge for it, so it waits". A hold is not a resting state, so those
 * posts were re-read and held again on every sweep, permanently. This component
 * is the sentence it was waiting for.
 *
 * Never one green tick for a post that half-worked. Each channel carries its own
 * icon, its own words, and — where the platform gave one — its own link.
 */

/** Exhaustive over the frozen enum: a new variant status is a compile error here. */
const STATUS_META = {
  pending: { label: 'Not sent yet', icon: Clock, tone: 'text-muted' },
  scheduled: { label: 'Waiting for its time', icon: Clock, tone: 'text-muted' },
  publishing: { label: 'Going out now', icon: Loader2, tone: 'text-warn' },
  published: { label: 'Live', icon: CheckCircle2, tone: 'text-ok' },
  failed: { label: 'Did not go out', icon: AlertCircle, tone: 'text-danger' },
  skipped: { label: 'Skipped', icon: MinusCircle, tone: 'text-muted' },
} satisfies Record<VariantPublishStatus, { label: string; icon: typeof Clock; tone: string }>

export interface ChannelStatusListProps {
  rows: readonly VariantStatusRow[]
  /** Rendered next to a failed channel. Omitted where no retry path exists. */
  renderRetry?: (row: VariantStatusRow) => React.ReactNode
}

export function ChannelStatusList({ rows, renderRetry }: ChannelStatusListProps) {
  if (rows.length === 0) return null

  return (
    <ul className="space-y-1.5" data-guide="post-channel-status">
      {rows.map((row) => {
        const meta = STATUS_META[row.status]
        const Icon = meta.icon
        return (
          <li
            key={row.channel}
            data-channel={row.channel}
            data-status={row.status}
            className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-input bg-s1 px-3 py-2"
          >
            <div className="flex min-w-0 items-start gap-2">
              <Icon size={14} aria-hidden className={cn('mt-[3px] shrink-0', meta.tone)} />
              <div className="min-w-0">
                <p className="text-[13px]">
                  <span className="font-semibold">{CHANNEL_LABELS[row.channel]}</span>
                  <span className={cn('ml-2', meta.tone)}>{meta.label}</span>
                </p>
                {/* Copy comes from the CODE, which is ours. `error.message` is
                    adapter-controlled and can carry text straight from Zernio or
                    Meta, so it is never rendered — an unknown code degrades to a
                    safe sentence rather than echoing an unreviewed string. */}
                {row.status === 'failed' && row.gateRefusal === null ? (
                  <p className="mt-0.5 text-[12.5px] text-danger">
                    {describePublishError(row.errorCode).message}
                  </p>
                ) : null}
                {/* The gate's own refusal REPLACES the one-line code copy rather
                    than sitting under it. Both would say the post was stopped,
                    and the generic sentence adds nothing next to a named rule. */}
                {row.status === 'failed' && row.gateRefusal ? (
                  <GateRefusalNote refusal={row.gateRefusal} />
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {/* `.is-real` keys off the LINK, never off the status. A variant can
                  say `published` while Instagram is still finishing its container
                  flow, and there is nothing real to point at until a URL exists. */}
              {row.permalink ? (
                <a
                  href={row.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-certainty="real"
                  className="is-real inline-flex items-center gap-1.5 rounded-input px-2 py-1 text-[12.5px] font-semibold underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <ExternalLink aria-hidden className="size-3.5" />
                  View
                </a>
              ) : null}
              {row.retryable && renderRetry ? renderRetry(row) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
