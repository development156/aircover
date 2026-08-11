'use client'

import type { Channel, ChannelSet } from '@sahoda/shared'

import type { GeneratedVariant } from '@/lib/posts/state'
import type { VariantStatusRow } from '@/lib/posts/variant-status'

import { ChannelPicker } from './channel-picker'
import { GeneratePanel } from './generate-panel'
import { PublishNow } from './publish-now'
import { PublishPreview } from './publish-preview'
import { ScheduleField } from './schedule-field'

export interface BottomBarProps {
  postId: string
  channels: ChannelSet
  scheduledAt: string | null
  onChannelsChange: (channels: ChannelSet) => void
  onScheduleChange: (iso: string | null) => void
  flush: () => Promise<boolean>
  /**
   * Save one channel's variant and wait for it. Distinct from `flush`, which
   * writes the canonical post — publishing sends the VARIANT row, so that is the
   * one that has to be current before anything goes out.
   */
  saveVariantNow: (channel: Channel) => Promise<boolean>
  /** Per-channel publish state, read from post_variants on the server. */
  statusRows: readonly VariantStatusRow[]
  /** Whether the dispatcher is on HERE. Server fact; false under-promises. */
  autoPublish: boolean
  /** The server's answer to the last schedule change, when it refused. */
  scheduleError: string | null
  /** Channels with a live connection, read on the server. */
  connected?: ReadonlySet<Channel>
  onGenerated: (variants: GeneratedVariant[]) => void
}

/**
 * Everything that acts on the whole post: which channels it targets, generating
 * per-channel copy, when it should go out, and the publish dry run.
 *
 * No Twin score is rendered here. `twin_preflight` has a credit price but no
 * mesh task and no backend, so any number in that slot would be invented.
 */
export function BottomBar({
  postId,
  channels,
  scheduledAt,
  onChannelsChange,
  onScheduleChange,
  flush,
  saveVariantNow,
  statusRows,
  autoPublish,
  scheduleError,
  connected,
  onGenerated,
}: BottomBarProps) {
  return (
    <section className="space-y-4 rounded-card border border-line bg-bg p-4 shadow-card">
      <ChannelPicker selected={channels} onChange={onChannelsChange} connected={connected} />

      <div className="grid gap-4 wide:grid-cols-2">
        <div className="space-y-2">
          <GeneratePanel
            postId={postId}
            channels={channels}
            flush={flush}
            onGenerated={onGenerated}
          />
        </div>
        <ScheduleField
          channels={channels}
          value={scheduledAt}
          onChange={onScheduleChange}
          autoPublish={autoPublish}
          error={scheduleError}
          connected={connected}
        />
      </div>

      <div className="space-y-4 border-t border-line pt-4">
        <PublishPreview postId={postId} />
        {/* Below the dry run on purpose: the preview is the rehearsal, this is the
            performance, and the order on screen matches the order they belong in. */}
        <PublishNow
          postId={postId}
          channels={channels}
          flush={flush}
          saveVariantNow={saveVariantNow}
          statusRows={statusRows}
          connected={connected}
        />
      </div>
    </section>
  )
}
