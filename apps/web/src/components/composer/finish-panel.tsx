'use client'

import type { Channel, ChannelSet } from '@sahoda/shared'

import { PublishNow } from '@/components/posts/publish-now'
import { PublishPreview } from '@/components/posts/publish-preview'
import { ScheduleField } from '@/components/posts/schedule-field'
import type { VariantStatusRow } from '@/lib/posts/variant-status'

export interface FinishPanelProps {
  postId: string | null
  channels: ChannelSet
  scheduledAt: string | null
  onScheduleChange: (iso: string | null) => void
  scheduleError: string | null
  autoPublish: boolean
  connected?: ReadonlySet<Channel>
  statusRows: readonly VariantStatusRow[]
  /** Write the post now. Resolves false when the save failed. */
  flush: () => Promise<boolean>
  /** Write one channel's variant and wait for it. */
  saveVariantNow: (channel: Channel) => Promise<boolean>
}

/**
 * What happens to the post once it is written: when it goes out, a dry run, and
 * publishing for real.
 *
 * ── WHY THIS IS AT THE END OF THE PAGE AND NOT IN THE STICKY BAR ─────────────
 * Publishing is irreversible and per channel, and it needs its own room: the
 * connection warnings, the per-channel status list and the retry all belong
 * beside the button rather than behind it. A one-tap Publish floating over the
 * writing surface is how a half-written post goes out on a phone.
 *
 * The sticky bar links here instead. A link that scrolls is honest navigation; a
 * button that opens a sheet that contains the real button is not.
 *
 * ── ORDER IS THE ARGUMENT ────────────────────────────────────────────────────
 * Schedule, then the dry run, then the live publish. The rehearsal comes before
 * the performance, and the two are never merged: `simulatePublish` writes nothing
 * and sends nothing, and it is labelled as a simulation everywhere it reports.
 */
export function FinishPanel({
  postId,
  channels,
  scheduledAt,
  onScheduleChange,
  scheduleError,
  autoPublish,
  connected,
  statusRows,
  flush,
  saveVariantNow,
}: FinishPanelProps) {
  return (
    <section
      id="finish"
      aria-labelledby="finish-heading"
      className="surface-ring scroll-mt-6 space-y-5 rounded-card bg-surface p-4"
    >
      <h2 id="finish-heading" className="type-h2">
        Send it
      </h2>

      <ScheduleField
        channels={channels}
        value={scheduledAt}
        onChange={onScheduleChange}
        autoPublish={autoPublish}
        error={scheduleError}
        connected={connected}
      />

      {postId === null ? (
        // Not a disabled button. Nothing is broken and nothing is coming soon —
        // there is simply no row yet, and saying so is the whole answer.
        <p className="border-t border-line pt-5 text-[12.5px] text-muted">
          Write a line first. Sahoda saves the post, and the publish checks open here.
        </p>
      ) : (
        <div className="space-y-5 border-t border-line pt-5">
          <PublishPreview postId={postId} />
          <PublishNow
            postId={postId}
            channels={channels}
            flush={flush}
            saveVariantNow={saveVariantNow}
            statusRows={statusRows}
            connected={connected}
          />
        </div>
      )}
    </section>
  )
}
