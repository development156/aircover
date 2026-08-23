'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Plug, Send } from 'lucide-react'
import Link from 'next/link'
import { filterChannelSet, type Channel, type ChannelSet } from '@sahoda/shared'

import { Button } from '@/components/ui/button'
import { joinNames, unconnectedFrom } from '@/lib/posts/connection-gap'
import { LIVE_RAIL } from '@/lib/posts/live-rail'
import type { VariantStatusRow } from '@/lib/posts/variant-status'

import { ChannelStatusList } from './channel-status-list'

import { CHANNEL_LABELS } from './channel-label'
import { InlineError } from './inline-error'
import { PendingLines } from './pending-lines'

const PENDING_LINES = [
  'Saving your latest edits…',
  'Sending the post to Instagram…',
  'Waiting for Instagram to finish processing. This takes about fifteen seconds.',
] as const

export interface PublishNowProps {
  postId: string
  /**
   * The post's channels. A SET, not an array: this component splits them into a
   * button rail and a warning, and those two branches must be reading the same
   * distinct list. See the `onRail` note below.
   */
  channels: ChannelSet
  /** Persist the canonical post (title, body, channels, schedule). */
  flush: () => Promise<boolean>
  /** Persist the channel variant that is actually about to be sent. */
  saveVariantNow: (channel: Channel) => Promise<boolean>
  /**
   * Channels with a live connection, from the server.
   *
   * A channel on the live rail but WITHOUT a connection cannot publish, and the
   * only way the composer used to convey that was to let the person press
   * Publish and fail. Undefined means "not known" and is treated as connected —
   * a missing prop must not silently hide a working button.
   */
  connected?: ReadonlySet<Channel>
  /**
   * What each channel is doing right now, straight off post_variants.
   *
   * One post can be live on Instagram and failed on X at the same moment, and
   * this is where that is said. A single success banner over a post that half
   * worked is the thing this whole surface exists to prevent.
   */
  statusRows: readonly VariantStatusRow[]
}

interface Published {
  channel: Channel
  permalink: string
  alreadyPublished: boolean
}

/**
 * Publish one channel for real, now.
 *
 * ── WHY THIS SHOWS A LINK AND NOTHING ELSE ────────────────────────────────────
 * Instagram's publish call returns 201 with `status: processing` and no URL, and
 * the post is not yet real at that point — Meta may still fail it. The route waits
 * for a `platformPostUrl` before reporting success, and this component renders the
 * URL it gets back. There is no "published!" banner without a link, because a
 * banner without a link is exactly the false certainty the whole rail is built to
 * avoid.
 *
 * Edits are flushed BEFORE the request. Publishing what is in the database while
 * the writer looks at something newer on screen would put out the wrong words.
 */
export function PublishNow({
  postId,
  channels,
  flush,
  saveVariantNow,
  statusRows,
  connected,
}: PublishNowProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [published, setPublished] = useState<Published | null>(null)

  // Already distinct — `channels` is a `ChannelSet`, deduplicated once when the row
  // was parsed. This line used to deduplicate here instead, because `post.channels`
  // arrived as a raw `text[]` and only ONE of the two branches below was defended:
  // the warning went through `unconnectedFrom`, which deduplicated, while `live` did
  // not, so a repeated CONNECTED channel rendered two identical Publish buttons under
  // one React key. Two dedupes in two branches is what let that happen; there is now
  // one, and it is upstream of both.
  const onRail = filterChannelSet(channels, (channel) => LIVE_RAIL.has(channel))
  // Split rather than filtered: the unconnected ones still need saying out loud.
  // `unconnectedFrom` is shared with the schedule picker, which says the same fact
  // in different words at a different moment — one rule, two sentences.
  const unconnected = unconnectedFrom(onRail, connected)
  const live = filterChannelSet(onRail, (channel) => !unconnected.includes(channel))
  const anyAttempted = statusRows.some((row) => row.status !== 'pending')

  // Nothing to publish, nothing to report, and nothing to fix. A button that
  // cannot work is worse than no button, and an empty status list reads as "all
  // fine" when it is "not started".
  if (live.length === 0 && unconnected.length === 0 && !anyAttempted) return null

  function run(channel: Channel) {
    setError(null)
    setPublished(null)
    startTransition(async () => {
      // BOTH, and in this order. `flush` writes the canonical post; the variant
      // row is what actually goes to the platform, and it has its own save.
      // Publishing after only one of them sends words the writer is not looking at.
      const savedPost = await flush()
      const savedVariant = savedPost ? await saveVariantNow(channel) : false
      if (!savedPost || !savedVariant) {
        setError('Couldn’t save your latest edits, so nothing was published.')
        return
      }

      let body: {
        ok?: boolean
        message?: string
        permalink?: string
        mode?: string
        alreadyPublished?: boolean
      }
      try {
        const res = await fetch(`/api/posts/${postId}/publish`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ channel }),
        })
        body = (await res.json()) as typeof body
        if (!res.ok || body.ok !== true) {
          setError(body.message ?? 'Publishing didn’t go through. Try again.')
          return
        }
      } catch {
        setError('Couldn’t reach the server. Check your connection and try again.')
        return
      }

      // A fixture result is not a publish. It can only appear if the rail is
      // misconfigured, and rendering it as success is the one thing this must never do.
      if (body.mode === 'fixture') {
        setError('Publishing isn’t switched on for this workspace yet.')
        return
      }
      if (!body.permalink) {
        setError('Instagram accepted the post but hasn’t given us a link yet. Check back shortly.')
        return
      }

      setPublished({
        channel,
        permalink: body.permalink,
        alreadyPublished: body.alreadyPublished === true,
      })
      // The variant row now carries the permalink; refresh so the tab's live link
      // reflects it too, rather than only this panel.
      router.refresh()
    })
  }

  return (
    <div className="space-y-2" data-guide="post-publish-now">
      {/* Above the button: what already happened comes before what to do next.
          A retry offered without the failure beside it is a button with no reason. */}
      {anyAttempted ? (
        <ChannelStatusList
          rows={statusRows}
          renderRetry={(row) =>
            row.status === 'failed' && LIVE_RAIL.has(row.channel) ? (
              <Button size="sm" variant="secondary" onClick={() => run(row.channel)}>
                Try again
              </Button>
            ) : null
          }
        />
      ) : null}

      {/* Said BEFORE the button, not after a failed publish. The work is already
          done by the time someone presses Publish; learning there is no account
          then is the whole problem this replaces. */}
      {unconnected.length > 0 ? (
        <div className="space-y-1.5 rounded-input border border-warn bg-warn-bg p-3">
          <p className="text-[13px] text-warn">
            {unconnected.length === 1
              ? `${CHANNEL_LABELS[unconnected[0]!]} isn’t connected yet, so this can’t go out there.`
              : `${joinNames(unconnected.map((c) => CHANNEL_LABELS[c]))} aren’t connected yet, so this can’t go out there.`}
          </p>
          <Link
            href="/connections"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-warn underline underline-offset-2"
          >
            <Plug size={13} aria-hidden />
            Connect {unconnected.length === 1 ? CHANNEL_LABELS[unconnected[0]!] : 'a channel'}
          </Link>
        </div>
      ) : null}

      {live.length === 0 ? null : pending ? (
        <PendingLines lines={PENDING_LINES} />
      ) : (
        <div className="flex flex-wrap gap-2">
          {live.map((channel) => (
            <Button key={channel} onClick={() => run(channel)} className="flex-1">
              <Send size={14} aria-hidden />
              Publish to {CHANNEL_LABELS[channel]}
            </Button>
          ))}
        </div>
      )}
      <p className="text-[12px] text-muted">
        This posts for real, straight away. Instagram takes about fifteen seconds to finish.
      </p>

      {error !== null ? <InlineError>{error}</InlineError> : null}

      {published !== null ? (
        <div className="space-y-1.5 rounded-input border border-ok bg-ok-bg p-3">
          <p className="type-eyebrow text-ok">
            {published.alreadyPublished
              ? `Already live on ${CHANNEL_LABELS[published.channel]}`
              : `Live on ${CHANNEL_LABELS[published.channel]}`}
          </p>
          <a
            href={published.permalink}
            target="_blank"
            rel="noopener noreferrer"
            data-certainty="real"
            className="is-real inline-flex items-center gap-1.5 text-[13px] font-semibold text-ok underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ExternalLink aria-hidden className="size-3.5" />
            View the post
          </a>
        </div>
      ) : null}
    </div>
  )
}
