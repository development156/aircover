'use client'

import type { PostStatus } from '@sahoda/shared'

import { StatusBadge } from '@/components/posts/status-badge'
import { useLivePost } from '@/components/posts/live/publish-state-provider'
import { outcomeOf } from '@/lib/posts/publish-evidence'
import type { VariantStatusRow } from '@/lib/posts/variant-status'

export interface LiveStatusBadgeProps {
  postId: string
  /** What the SERVER rendered. Used until, and unless, a poll says otherwise. */
  intent: PostStatus
  /**
   * The server-rendered variant rows. Required in position: these are the whole
   * basis for what the chip may claim, and a call site that forgot them would
   * get `unknown` — silently falling back to the stale intent word, which is the
   * exact defect this component was changed to stop.
   */
  variants: readonly VariantStatusRow[]
  className?: string
}

/**
 * The lifecycle chip, following the row while the writer watches.
 *
 * ── INTENT AND EVIDENCE MOVE TOGETHER OR NOT AT ALL ──────────────────────────
 * That pairing is the honesty rule, not a convenience. `certaintyFor(intent,
 * outcome)` decides whether the chip claims `.is-real`, and the only evidence
 * for that claim is the post's variant rows. A live update that advanced the
 * intent while leaving the rows at whatever the page loaded with would, on a
 * post that published after the page opened, pin it to the stale answer
 * forever. So the snapshot carries both and this reads both off the SAME `live`
 * object, or neither.
 *
 * This used to take `mode` from `post_publish_logs` for the same purpose. That
 * was a second derivation of "did it publish, and was it real" off a different
 * table — see `publish-evidence.ts`. The variant rows were already in the
 * snapshot and are the table the publish path actually writes, so the log read
 * is gone rather than kept in parallel.
 *
 * The server props remain the floor. With no provider above it — a test, or a
 * surface not yet wired — this is exactly `StatusBadge`.
 */
export function LiveStatusBadge({ postId, intent, variants, className }: LiveStatusBadgeProps) {
  const live = useLivePost(postId)
  return (
    <StatusBadge
      intent={live?.intent ?? intent}
      // Read off the same `live` object as the intent, never merged with the
      // server prop. Mixing a fresh intent with stale rows is the one
      // combination that can manufacture a claim neither read supports.
      outcome={outcomeOf(live ? live.variants : variants)}
      className={className}
    />
  )
}
