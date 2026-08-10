'use client'

/**
 * A client component for ONE reason: the `onClick` below.
 *
 * `post-card.tsx` wraps the whole card in a Link to the editor and renders this chip
 * INSIDE it, so a chip that did not stop the click would send a reader who asked for the
 * live post to the draft instead. That handler is load-bearing, and a handler means this
 * file cannot render on the server.
 *
 * It was missing until 2026-08-10 and nothing caught it, because the anchor only renders
 * when `state.permalink` is truthy — and until the first live publish on 2026-08-09 every
 * permalink in the database was `fixture://`, which `variant-status.ts` nulls. The throw
 * was shipped by data, not by a deploy. `server-event-handler.guard.test.ts` now walks the
 * server graph so the next one fails a test instead of a page.
 */
import { AlertCircle, Check, Clock, ExternalLink } from 'lucide-react'
import type { Channel } from '@sahoda/shared'

import { CHANNEL_SHORT } from '@/components/posts/channel-label'
import type { VariantStatusRow } from '@/lib/posts/variant-status'
import { cn } from '@/lib/utils'

/**
 * One channel on a post card, carrying its own outcome.
 *
 * ── WHY THE CHIP HAD TO LEARN A STATE ────────────────────────────────────────
 * The list rendered these as flat grey labels — the channels a post TARGETS. Put
 * beside a single post-level badge, that answers "where was this meant to go" and
 * never "did it go out", which is the only question a shop owner opens this screen
 * to ask. For a `partial` post the post-level badge cannot answer it even in
 * principle: the true answer is different per channel, which is exactly why
 * `partial` exists.
 *
 * A live chip is a LINK, and it is a link only when there is a permalink to point
 * at — the same `.is-real` rule the whole rail follows. A published variant with
 * no URL yet renders as waiting, because there is nothing to show anybody.
 */
export function ChannelChip({ channel, state }: { channel: Channel; state?: VariantStatusRow }) {
  const label = CHANNEL_SHORT[channel]

  // No variant row at all: the channel is picked but nothing has been written or
  // attempted. Grey, exactly as before.
  if (!state) {
    return <span className="rounded-pill bg-s2 px-2 py-[2px] font-medium text-muted">{label}</span>
  }

  if (state.permalink) {
    return (
      <a
        href={state.permalink}
        target="_blank"
        rel="noopener noreferrer"
        data-certainty="real"
        // Stops the click bubbling to the card's own link to the editor: the
        // reader asked for the post on the platform, not the draft.
        onClick={(event) => event.stopPropagation()}
        className="is-real inline-flex items-center gap-1 rounded-pill px-2 py-[2px] font-semibold underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ExternalLink size={11} aria-hidden />
        {label}
      </a>
    )
  }

  const tone =
    state.status === 'failed'
      ? 'bg-danger-bg text-danger'
      : state.status === 'published'
        ? 'bg-ok-bg text-ok'
        : state.status === 'publishing'
          ? 'bg-warn-bg text-warn'
          : 'bg-s2 text-muted'

  const Icon =
    state.status === 'failed'
      ? AlertCircle
      : state.status === 'published'
        ? Check
        : state.status === 'publishing'
          ? Clock
          : null

  return (
    <span
      data-status={state.status}
      className={cn('inline-flex items-center gap-1 rounded-pill px-2 py-[2px] font-medium', tone)}
    >
      {Icon ? <Icon size={11} aria-hidden /> : null}
      {label}
      {/* Sighted readers get the colour and the icon; nobody gets less of the
          truth. A "published" with no link is deliberately not called live. */}
      <span className="sr-only">
        {state.status === 'failed'
          ? ' — did not go out'
          : state.status === 'published'
            ? ' — published, no link yet'
            : state.status === 'publishing'
              ? ' — going out now'
              : ' — not sent yet'}
      </span>
    </span>
  )
}
