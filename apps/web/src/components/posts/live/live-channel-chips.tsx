'use client'

import type { ChannelSet } from '@sahoda/shared'

import { ChannelChip } from '@/components/posts/channel-chip'
import { useLivePost } from '@/components/posts/live/publish-state-provider'
import type { VariantStatusRow } from '@/lib/posts/variant-status'

export interface LiveChannelChipsProps {
  postId: string
  /**
   * The post's channels. A `ChannelSet`, so the chips cannot key two children by
   * the same channel — see `packages/shared/src/db/channel-set.ts`.
   */
  channels: ChannelSet
  /** What the SERVER rendered. The floor, and the fallback. */
  initialRows: readonly VariantStatusRow[]
  className?: string
}

/**
 * The per-channel chips, following each channel's own outcome.
 *
 * This is where the LIVE LINK arrives. `ChannelChip` renders an anchor only when
 * `state.permalink` is truthy, and `variantStatusRow` supplies that field only
 * for a permalink that is not `fixture://`. So the link appearing here is the
 * platform's own URL landing on the row — never a placeholder, never an
 * optimistic guess, and never a fixture's marker dressed up as a destination.
 *
 * ── WHY THE ROWS ARE PASSED THROUGH UNTOUCHED ────────────────────────────────
 * `VariantStatusRow` carries `simulated` as its own field, computed in
 * `variant-status.ts:74-76` from the `fixture://` permalink BEFORE that permalink
 * is nulled — its own comment: "Computed once, before the id is erased, because
 * afterwards the difference is gone." Nothing on the wire reshapes it. A slimmer
 * payload carrying `status` and `permalink` but not `simulated` would look
 * complete and would silently relabel every fixture run as a real publish.
 *
 * Channels are the SERVER's list, always. A poll reports what each channel is
 * doing; it never changes which channels a post is aimed at, because that is the
 * writer's own edit and `use-autosave.ts` owns it.
 */
export function LiveChannelChips({
  postId,
  channels,
  initialRows,
  className,
}: LiveChannelChipsProps) {
  const live = useLivePost(postId)
  const rows = live?.variants ?? initialRows
  const byChannel = new Map(rows.map((row) => [row.channel, row]))

  if (channels.length === 0) return null

  return (
    <ul className={className}>
      {channels.map((channel) => (
        <li key={channel}>
          <ChannelChip channel={channel} state={byChannel.get(channel)} />
        </li>
      ))}
    </ul>
  )
}
