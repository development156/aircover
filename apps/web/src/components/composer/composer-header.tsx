'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
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
 *
 * ── THE WAY BACK ─────────────────────────────────────────────────────────────
 * `docs/34` §10 named this screen the worst in the product and listed "no page
 * title, no back link" among the reasons. Only half of that is a defect: the
 * page's heading IS the title input, deliberately, and a visible "Write a post"
 * above a field labelled "Name this post" would be the second `type-h1` §16
 * forbids saying the same thing twice.
 *
 * The BACK LINK is a real gap and it is a momentum one. A person arrives here
 * by clicking a row on /posts, and the only route back was the rail — which on
 * a phone is behind "More", and which loses the list position either way. Same
 * treatment `radar/[id]` and the inbox threads use, so the product has one way
 * of returning from a detail screen rather than three.
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
      <Link
        href="/posts"
        className="type-sm inline-flex items-center gap-1.5 text-muted transition-micro hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden />
        All posts
      </Link>

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
