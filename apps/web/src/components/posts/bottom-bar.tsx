'use client'

import type { Channel } from '@sahoda/shared'

import type { GeneratedVariant } from '@/lib/posts/state'

import { ChannelPicker } from './channel-picker'
import { GeneratePanel } from './generate-panel'
import { PublishPreview } from './publish-preview'
import { ScheduleField } from './schedule-field'

export interface BottomBarProps {
  postId: string
  channels: Channel[]
  scheduledAt: string | null
  onChannelsChange: (channels: Channel[]) => void
  onScheduleChange: (iso: string | null) => void
  flush: () => Promise<boolean>
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
  onGenerated,
}: BottomBarProps) {
  return (
    <section className="space-y-4 rounded-card border border-line bg-bg p-4 shadow-card">
      <ChannelPicker selected={channels} onChange={onChannelsChange} />

      <div className="grid gap-4 wide:grid-cols-2">
        <div className="space-y-2">
          <GeneratePanel
            postId={postId}
            channels={channels}
            flush={flush}
            onGenerated={onGenerated}
          />
        </div>
        <ScheduleField channels={channels} value={scheduledAt} onChange={onScheduleChange} />
      </div>

      <div className="border-t border-line pt-4">
        <PublishPreview postId={postId} />
      </div>
    </section>
  )
}
