import type { Channel } from '@sahoda/shared'

import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import type { ConnectedChannelsRead } from '@/lib/connections/read'
import type { DisplayPost } from '@/lib/posts/display-post'
import { formatScheduledAt } from '@/lib/posts/schedule-format'

import {
  authorshipLine,
  excerpt,
  latestReturnReason,
  reviewLine,
  type ApprovalRow,
  type CommentRow,
} from './context'
import type { VariantBody } from './history'

/**
 * EVERYTHING A REVIEWER SEES ON ONE ROW, BUILT ON THE SERVER AS PLAIN DATA.
 *
 * The queue is a client component (it holds a selection), so what crosses the
 * boundary has to be serialisable: no Maps, no Sets, no Dates. This shape is
 * built once by `/approvals` from the five reads that run in parallel there
 * and handed over as a record keyed by post id.
 *
 * Three states per read, kept apart on purpose: `undefined` on a field means
 * that read could not be made ("Sahoda could not read the history"), an empty
 * list means it was made and found nothing. A row must never say "no history"
 * over a failed read.
 */

export type Readiness = 'live' | 'off' | 'unknown'

export interface ChannelReadiness {
  channel: Channel
  label: string
  state: Readiness
}

export interface RowContext {
  /** "02 Sept 2026, 09:00 am IST", in the workspace zone, or null with no time. */
  when: string | null
  /** The first ~160 characters of the body, or null with none. */
  excerpt: string | null
  /** The full body, for the preview. */
  body: string | null
  /** A signed preview URL for the first attachment; null when it could not be signed. */
  thumbnail: string | null | undefined
  readiness: ChannelReadiness[]
  /** "Written by Sahoda" / "Written by you" / "Written by a teammate". */
  authorship: string
  /** The latest history row as a sentence, null with no history, undefined when unreadable. */
  review: string | null | undefined
  /** The most recent return's reason, for the preview. */
  returnedReason: string | null
  /** The last three comments, oldest first. Undefined when unreadable. */
  comments: CommentRow[] | undefined
  /** Each channel version's body. Undefined when unreadable. */
  versions: VariantBody[] | undefined
}

export type QueueContext = Readonly<Record<string, RowContext>>

export interface QueueReads {
  zone: string
  userId: string | null
  approvals: Map<string, ApprovalRow[]> | null
  comments: Map<string, CommentRow[]> | null
  thumbnails: Map<string, string | null> | null
  versions: Map<string, VariantBody[]> | null
  connected: ConnectedChannelsRead
}

function readinessFor(
  channels: readonly Channel[],
  read: ConnectedChannelsRead,
): ChannelReadiness[] {
  return channels.map((channel) => ({
    channel,
    label: CHANNEL_LABELS[channel],
    state:
      read.status === 'ok'
        ? read.channels.has(channel)
          ? 'live'
          : 'off'
        : read.status === 'no-workspace'
          ? 'off'
          : 'unknown',
  }))
}

export function buildQueueContext(posts: readonly DisplayPost[], reads: QueueReads): QueueContext {
  const out: Record<string, RowContext> = {}
  for (const post of posts) {
    const history = reads.approvals?.get(post.id) ?? (reads.approvals === null ? undefined : [])
    out[post.id] = {
      when: formatScheduledAt(post.scheduled_at, reads.zone),
      excerpt: excerpt(post.body),
      body: post.body,
      thumbnail: reads.thumbnails === null ? undefined : (reads.thumbnails.get(post.id) ?? null),
      readiness: readinessFor(post.channels, reads.connected),
      authorship: authorshipLine(post, reads.userId),
      review: history === undefined ? undefined : reviewLine(history, reads.userId),
      returnedReason: history === undefined ? null : latestReturnReason(history),
      comments: reads.comments === null ? undefined : (reads.comments.get(post.id) ?? []),
      versions: reads.versions === null ? undefined : (reads.versions.get(post.id) ?? []),
    }
  }
  return out
}
