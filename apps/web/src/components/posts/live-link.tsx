import { ExternalLink } from 'lucide-react'

import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import type { Channel } from '@sahoda/shared'

/**
 * The live link to a published post.
 *
 * ── THE ONLY THING THAT MAKES A POST REAL ─────────────────────────────────────
 * This renders if and only if `permalink` is present. Not when the status says
 * published, not when the publish call returned 200 — those both happen while an
 * Instagram post is still in Zernio's container flow, with no URL and no certainty
 * it will finish (doc 13 §5, observed [LIVE] 2026-07-31).
 *
 * A post is real when there is a link to it on the internet. `.is-real` keys off
 * this field's presence, and so does this component: no permalink, nothing shown.
 */
export function LiveLink({ channel, permalink }: { channel: Channel; permalink: string | null }) {
  if (!permalink) return null

  // A fixture permalink is a simulation marker, never a destination. Rendering it
  // as a link would offer the reader a page that does not exist.
  if (permalink.startsWith('fixture://')) return null

  return (
    <a
      href={permalink}
      target="_blank"
      rel="noopener noreferrer"
      data-certainty="real"
      className="is-real inline-flex items-center gap-1.5 rounded-input px-2 py-1 text-[12.5px] font-semibold underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <ExternalLink aria-hidden className="size-3.5" />
      View on {CHANNEL_LABELS[channel]}
    </a>
  )
}
