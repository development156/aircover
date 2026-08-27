'use client'

import type { Channel, ChannelSet } from '@sahoda/shared'

import { PublishNow } from '@/components/posts/publish-now'
import { PublishPreview } from '@/components/posts/publish-preview'
import type { VariantStatusRow } from '@/lib/posts/variant-status'

export interface FinishPublishProps {
  postId: string | null
  channels: ChannelSet
  connected?: ReadonlySet<Channel>
  statusRows: readonly VariantStatusRow[]
  flush: () => Promise<boolean>
  saveVariantNow: (channel: Channel) => Promise<boolean>
  /** Save the post and every dirty version, and report whether all of it landed. */
  saveAllVersions: () => Promise<boolean>
  /** How many versions are not in their row yet. */
  unsavedVersions: number
}

/**
 * PUBLISHING, FOR REAL, ONE CHANNEL AT A TIME.
 *
 * ── THE DRY RUN STAYS BEFORE THE LIVE ONE ────────────────────────────────────
 * The rehearsal comes before the performance, and the two are never merged:
 * `simulatePublish` writes nothing and sends nothing, and it is labelled as a
 * simulation everywhere it reports.
 *
 * ── WHY THIS IS A SEPARATE FILE ──────────────────────────────────────────────
 * So `FinishPanel` can load it on demand — see `finish-schedule.tsx` for the
 * measurement. It is the heavier of the two halves: `PublishNow` alone is 266
 * lines and pulls in the channel status list, the live rail, the connection-gap
 * copy and the pending-line ticker, and `PublishPreview` pulls the whole
 * violation-copy table.
 */
export default function FinishPublish({
  postId,
  channels,
  connected,
  statusRows,
  flush,
  saveVariantNow,
  saveAllVersions,
  unsavedVersions,
}: FinishPublishProps) {
  return (
    <div className="space-y-5 border-t border-line pt-4">
      {postId === null ? (
        // Not a disabled button. Nothing is broken and nothing is coming soon —
        // there is simply no row yet, and saying so is the whole answer.
        <p className="type-sm text-muted">
          Write a line first. Sahoda saves the post, and the publish checks open here.
        </p>
      ) : (
        <>
          <PublishPreview postId={postId} />
          <PublishNow
            postId={postId}
            channels={channels}
            flush={flush}
            saveVariantNow={saveVariantNow}
            saveAllVersions={saveAllVersions}
            unsavedVersions={unsavedVersions}
            statusRows={statusRows}
            connected={connected}
          />
        </>
      )}
    </div>
  )
}
