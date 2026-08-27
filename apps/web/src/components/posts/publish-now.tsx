'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plug } from 'lucide-react'
import Link from 'next/link'
import { filterChannelSet, type Channel, type ChannelSet } from '@sahoda/shared'

import { Button } from '@/components/ui/button'
import { joinNames, unconnectedFrom } from '@/lib/posts/connection-gap'
import { LIVE_RAIL } from '@/lib/posts/live-rail'
import { publishEach, type PublishOutcome } from '@/lib/posts/publish-one'
import type { VariantStatusRow } from '@/lib/posts/variant-status'

import { ChannelStatusList } from './channel-status-list'

import { CHANNEL_LABELS } from './channel-label'
import { InlineError } from './inline-error'
import { PendingLines } from './pending-lines'
import { SendControls } from './send-controls'
import { SendOutcomes } from './send-outcomes'

const PENDING_LINES = [
  'Saving your latest edits…',
  'Sending the post to each connected channel…',
  'Waiting for the last one to finish. Instagram takes about fifteen seconds.',
] as const

export interface PublishNowProps {
  postId: string
  /**
   * The post's channels. A SET, not an array: this component splits them into a
   * live list and a warning, and those two branches must be reading the same
   * distinct list.
   */
  channels: ChannelSet
  /** Persist the canonical post (title, body, channels, schedule). */
  flush: () => Promise<boolean>
  /** Persist the channel variant that is actually about to be sent. */
  saveVariantNow: (channel: Channel) => Promise<boolean>
  /**
   * Persist the post AND every channel version that is not in its row yet.
   *
   * Both buttons below run this first. "Send now" that published the row while
   * four edited variants sat only on screen would put out the wrong words, which
   * is the same defect the single-channel path already guarded with `flush` plus
   * `saveVariantNow`, widened to the whole post.
   */
  saveAllVersions?: () => Promise<boolean>
  /** How many versions are not in their row yet, for the note under the buttons. */
  unsavedVersions?: number
  /**
   * Channels with a live connection, from the server.
   *
   * Undefined means "not known" and is treated as connected — a missing prop
   * must not silently hide a working button.
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

/**
 * Publish for real, to every connected channel, from one press.
 *
 * ── WHY THERE IS NOW ONE BUTTON WHERE THERE WERE N ───────────────────────────
 * This file used to carry the argument against a single Send button: one post
 * can be live on Instagram and failed on X in the same second, and a single
 * verdict cannot cover both. That was right about the REPORT and wrong about the
 * BUTTON. One press with N results says the same true thing as N presses and
 * asks the reader for one decision instead of four. `SendOutcomes` is where the
 * per-channel truth now lives, and it is a list, never a banner.
 *
 * ── WHAT SURVIVES UNCHANGED ──────────────────────────────────────────────────
 * Every refusal. `publishOne` still declines a fixture response, still refuses
 * to call a permalink-less 201 a publish, and still reads the body rather than
 * the HTTP status for the verdict — and those three branches are now tested,
 * which they never were while they lived inside this component.
 *
 * Edits are flushed BEFORE the request. Publishing what is in the database while
 * the writer looks at something newer on screen would put out the wrong words.
 */
export function PublishNow({
  postId,
  channels,
  flush,
  saveVariantNow,
  saveAllVersions,
  unsavedVersions = 0,
  connected,
  statusRows,
}: PublishNowProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [outcomes, setOutcomes] = useState<readonly PublishOutcome[]>([])

  // `channels` is a `ChannelSet`, deduplicated once when the row was parsed.
  const onRail = filterChannelSet(channels, (channel) => LIVE_RAIL.has(channel))
  // Split rather than filtered: the unconnected ones still need saying out loud.
  const unconnected = unconnectedFrom(onRail, connected)
  const live = filterChannelSet(onRail, (channel) => !unconnected.includes(channel))
  const anyAttempted = statusRows.some((row) => row.status !== 'pending')

  /**
   * Save the post and every version, in the order the rows require.
   *
   * Falls back to the single-channel pair when the composer did not hand down a
   * save-everything function, so this component still works wherever it is
   * mounted without one rather than silently publishing unsaved copy.
   */
  async function saveEverything(): Promise<boolean> {
    if (saveAllVersions !== undefined) return saveAllVersions()
    const savedPost = await flush()
    if (!savedPost) return false
    for (const channel of live) {
      if (!(await saveVariantNow(channel))) return false
    }
    return true
  }

  function sendNow() {
    setError(null)
    setOutcomes([])
    startTransition(async () => {
      if (!(await saveEverything())) {
        setError('Sahoda couldn’t save your latest edits, so nothing was published.')
        return
      }
      setOutcomes(await publishEach(postId, live))
      // The variant rows now carry their permalinks; refresh so the tabs' live
      // links reflect them too, rather than only this panel.
      router.refresh()
    })
  }

  return (
    <div className="space-y-3" data-guide="post-publish-now">
      {/* Above the buttons: what already happened comes before what to do next.
          A retry offered without the failure beside it is a button with no reason. */}
      {anyAttempted ? (
        <ChannelStatusList
          rows={statusRows}
          renderRetry={(row) =>
            row.status === 'failed' && live.includes(row.channel) ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  startTransition(async () => {
                    if (!(await saveEverything())) {
                      setError('Sahoda couldn’t save your latest edits, so nothing was published.')
                      return
                    }
                    setOutcomes(await publishEach(postId, [row.channel]))
                    router.refresh()
                  })
                }
              >
                Try again
              </Button>
            ) : null
          }
        />
      ) : null}

      {/* Said BEFORE the buttons, not after a failed publish. The work is
          already done by the time someone presses Send; learning there is no
          account then is the whole problem this replaces. */}
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

      {pending ? (
        <PendingLines lines={PENDING_LINES} />
      ) : (
        <SendControls
          channels={channels}
          live={live}
          connected={connected}
          unsavedVersions={unsavedVersions}
          onSaveDraft={saveEverything}
          onSendNow={sendNow}
          sending={pending}
        />
      )}

      {error !== null ? <InlineError>{error}</InlineError> : null}

      <SendOutcomes outcomes={outcomes} />
    </div>
  )
}
