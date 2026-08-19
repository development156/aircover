'use client'

import type { Channel, ChannelSet, PostMedia } from '@sahoda/shared'

import { MediaPane } from '@/components/posts/media-pane'
import { TemplateCard } from '@/components/composer/template-card'
import type { MediaPreview } from '@/lib/posts/media-url'
import type { TemplatesRead } from '@/lib/templates/read'

export interface ExtrasPaneProps {
  body: string
  onBodyChange: (body: string) => void
  channels: ChannelSet
  postId: string | null
  media: PostMedia[]
  previews: MediaPreview[]
  templates: TemplatesRead
}

/**
 * What travels WITH the post rather than being the post: the pictures, and the
 * saved starting points.
 *
 * ── WHY MEDIA IS HERE AND NOT ON A VERSION CARD ──────────────────────────────
 * Because `post_media.post_id` is the shape of the table: a file is attached to
 * the POST, and what differs per channel is the RULE applied to it — Google
 * Business Profile takes one image, Instagram takes ten and refuses a text-only
 * post entirely. So each version card scores the same count against its own
 * `maxMediaCount`, and there is exactly one place to add or remove a file.
 *
 * ── AND WHY A TEMPLATE FILLS THE POST, NOT A CHANNEL ─────────────────────────
 * A template is a starting point for a piece of writing; a version is that
 * writing adapted to one platform's rules. Loading one into X's box would make
 * X's 280-character constraints authoritative over every future post that starts
 * from it — the exact collapse this product exists to avoid.
 */
export function ExtrasPane({
  body,
  onBodyChange,
  channels,
  postId,
  media,
  previews,
  templates,
}: ExtrasPaneProps) {
  return (
    <div className="space-y-4">
      <TemplateCard
        read={templates}
        body={body}
        channel={(channels[0] as Channel | undefined) ?? null}
        onUse={(template) => onBodyChange(template.body)}
      />

      {postId === null ? (
        // Not a disabled button. Nothing is broken and nothing is coming soon —
        // there is simply no row yet, and saying so is the whole answer.
        <p className="surface-ring rounded-card bg-surface p-3 text-[12.5px] text-muted">
          Photos attach to a saved post. Write a line and Sahoda saves it, then this becomes a place
          to add one.
        </p>
      ) : (
        <MediaPane media={media} channels={channels} postId={postId} previews={previews} />
      )}
    </div>
  )
}
