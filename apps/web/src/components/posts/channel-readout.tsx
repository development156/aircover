'use client'

import Link from 'next/link'
import { Check, Plug } from 'lucide-react'
import type { Channel, ChannelSet } from '@sahoda/shared'

import { ChannelMark } from '@/components/posts/channel-mark'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { LIVE_RAIL } from '@/lib/posts/live-rail'
import { cn } from '@/lib/utils'

export interface ChannelReadoutProps {
  channels: ChannelSet
  /** Channels with a live connection. Undefined means NOT KNOWN, never "no". */
  connected?: ReadonlySet<Channel>
}

/**
 * WHERE THIS IS ACTUALLY GOING, LISTED BEFORE THE READER COMMITS.
 *
 * ── WHY A LIST AND NOT A SENTENCE ────────────────────────────────────────────
 * The composer already warns about unconnected channels in prose, once, in a
 * line that has to name them: "X and LinkedIn aren't connected yet, so this
 * can't go out there." That sentence is correct and it does not scale — at four
 * channels with two connected it is a paragraph the reader has to parse into a
 * list they could have been shown.
 *
 * This is that list. One row per channel the post is going to, each carrying its
 * own verdict, directly above the button that acts on it. A person about to
 * schedule or publish gets to see the whole answer at a glance instead of
 * reconstructing it.
 *
 * ── "NOT KNOWN" IS NOT "NOT CONNECTED" ───────────────────────────────────────
 * `connected` is undefined when the server could not read the connection rows.
 * Rendering that as a red cross would be inventing a fact, and it is the same
 * distinction `unconnectedFrom` already makes: an absent answer warns about
 * nothing. Those rows say so in their own words rather than guessing.
 */
export function ChannelReadout({ channels, connected }: ChannelReadoutProps) {
  if (channels.length === 0) return null

  return (
    <div className="surface-ring rounded-sm bg-surface p-3" data-channel-readout>
      <p className="type-eyebrow mb-2 text-muted">
        {channels.length === 1 ? 'Going to' : `Going to ${channels.length} channels`}
      </p>
      <ul className="space-y-1.5">
        {channels.map((channel) => {
          const onRail = LIVE_RAIL.has(channel)
          // Three states, and the third is not a failure: unknown.
          const status =
            connected === undefined ? 'unknown' : connected.has(channel) ? 'live' : 'off'

          return (
            <li key={channel} className="flex flex-wrap items-center gap-2">
              <ChannelMark channel={channel} size={16} />
              <span className="type-sm font-[550] text-ink">{CHANNEL_LABELS[channel]}</span>
              <span
                data-channel-status={channel}
                className={cn(
                  'type-meta ml-auto inline-flex items-center gap-1',
                  status === 'live' && onRail ? 'text-ok' : 'text-warn',
                  status === 'unknown' ? 'text-muted' : null,
                )}
              >
                {status === 'live' && onRail ? (
                  <>
                    <Check size={13} strokeWidth={2.4} aria-hidden />
                    Connected
                  </>
                ) : status === 'unknown' ? (
                  // The claim is exact: Sahoda could not READ the connection,
                  // which is a different sentence from "you have no account".
                  'Connection not checked'
                ) : (
                  <>
                    <Plug size={13} strokeWidth={2} aria-hidden />
                    <Link
                      href="/connections"
                      className="font-semibold underline underline-offset-2"
                    >
                      Connect it
                    </Link>
                  </>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
