'use client'

import type { Channel, ChannelSet } from '@sahoda/shared'

import { ChannelPicker } from '@/components/posts/channel-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface ComposerHeaderProps {
  title: string
  onTitleChange: (title: string) => void
  channels: ChannelSet
  onChannelsChange: (channels: ChannelSet) => void
  connected?: ReadonlySet<Channel>
}

/**
 * The two decisions that apply to the whole post: what to call it, and where it
 * is going.
 *
 * ── THE CHANNEL ROW IS AT THE TOP AND IT IS NEVER A STEP ─────────────────────
 * The deleted wizard made channels step 1 of 5, which meant changing your mind
 * halfway through writing was a navigation. Here it is a row of toggles that sits
 * above the work the whole time: picking one opens its version, dropping one
 * closes it, and neither loses a word of anything else.
 *
 * The title is a plain `Input` rather than a borderless display-weight field.
 * docs/26 §5 forbids hand-writing a font shorthand and §10 lists the primitives
 * that exist; a document-title input is not one of them, and inventing it at a
 * call site is exactly how the type scale drifted in the first place.
 */
export function ComposerHeader({
  title,
  onTitleChange,
  channels,
  onChannelsChange,
  connected,
}: ComposerHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="post-title">Name this post</Label>
        <Input
          id="post-title"
          value={title}
          placeholder="Only you see this"
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </div>

      <ChannelPicker
        selected={channels}
        onChange={onChannelsChange}
        connected={connected}
        hideLabel={false}
      />
    </div>
  )
}
