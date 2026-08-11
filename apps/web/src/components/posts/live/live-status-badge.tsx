'use client'

import type { PostStatus } from '@sahoda/shared'

import { StatusBadge } from '@/components/posts/status-badge'
import { useLivePost } from '@/components/posts/live/publish-state-provider'
import type { PostPublishMode } from '@/lib/posts/certainty'

export interface LiveStatusBadgeProps {
  postId: string
  /** What the SERVER rendered. Used until, and unless, a poll says otherwise. */
  status: PostStatus
  mode: PostPublishMode
  className?: string
}

/**
 * The lifecycle chip, following the row while the writer watches.
 *
 * `status` and `mode` move TOGETHER or not at all — that pairing is the honesty
 * rule, not a convenience. `certaintyFor(status, mode)` decides whether the chip
 * claims `.is-real` ("it happened"), and the only evidence for that claim is a
 * succeeded publish log with `mode = 'live'`. A live update that advanced the
 * status to `published` while leaving `mode` at whatever the page loaded with
 * would, on a post that published after the page opened, pin it to `null`
 * forever — a post that genuinely went out, permanently rendering the weaker
 * claim. So the snapshot carries both and this component takes both, or neither.
 *
 * The server props remain the floor. With no provider above it — a test, or a
 * surface not yet wired — this is exactly `StatusBadge`.
 */
export function LiveStatusBadge({ postId, status, mode, className }: LiveStatusBadgeProps) {
  const live = useLivePost(postId)
  return (
    <StatusBadge
      status={live?.status ?? status}
      // Read off the same `live` object as the status, never merged with the
      // server prop. Mixing a live status with a stale mode is the one
      // combination that can manufacture a claim neither read supports.
      mode={live ? live.mode : mode}
      className={className}
    />
  )
}
