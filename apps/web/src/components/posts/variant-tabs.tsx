'use client'

import { useRef, useState } from 'react'
import type { Channel } from '@sahoda/shared'

import { CardLabel } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { blockingChannels, meterFor } from '@/lib/posts/counters'
import { hasLink } from '@/lib/posts/detect-link'

import { CHANNEL_SHORT } from './channel-label'
import { VariantPanel } from './variant-panel'
import type { VariantsApi } from './use-variants'

export interface VariantTabsProps {
  channels: Channel[]
  canonicalBody: string
  variants: VariantsApi
  /**
   * How many files are attached to this post. Media attaches to the POST
   * (`post_media.post_id`), not to a variant, so every channel is scored against
   * the same count — what differs is each spec's `maxMediaCount`.
   */
  mediaCount: number
}

/**
 * Per-channel variant tabs. Hand-built pills (docs/08 §6 delegates the look to
 * `sahoda_brand_brain_demo.html` `.tab`) — there is no tabs primitive in the repo.
 *
 * Blocking is strictly per channel: `blockingChannels` marks only the tabs whose
 * own draft violates its own spec, so an over-limit X post never blocks GBP.
 */
export function VariantTabs({ channels, canonicalBody, variants, mediaCount }: VariantTabsProps) {
  const [requested, setRequested] = useState<Channel | null>(null)

  const active = requested !== null && channels.includes(requested) ? requested : channels[0]

  const meters = channels.map((channel) => {
    const state = variants.states[channel]
    return meterFor(channel, {
      body: state.body,
      hashtags: state.extras.hashtags,
      hasLink: hasLink(state.body),
      mediaCount,
    })
  })
  const blocked = new Set(blockingChannels(meters))

  // Roving tabindex: selecting the next tab is only half the job. DOM focus has
  // to travel with it, or focus is stranded on a button that just became
  // tabIndex={-1} — and because the key handler is per-button, every further
  // arrow press would keep computing from the ORIGINAL tab and never advance.
  const tabRefs = useRef(new Map<Channel, HTMLButtonElement>())

  function moveFocus(from: Channel, delta: number) {
    const index = channels.indexOf(from)
    if (index === -1) return
    const next = channels[(index + delta + channels.length) % channels.length]
    if (next === undefined) return
    setRequested(next)
    tabRefs.current.get(next)?.focus()
  }

  if (active === undefined) {
    return (
      <section className="space-y-3" data-guide="post-variants">
        <CardLabel className="mb-0">Channel variants</CardLabel>
        <p className="rounded-card border border-line bg-bg p-4 text-[13px] text-muted">
          Pick a channel below and I&rsquo;ll open a tab for it here.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-3" data-guide="post-variants">
      <CardLabel className="mb-0">Channel variants</CardLabel>

      <div role="tablist" aria-label="Channel variants" className="flex flex-wrap gap-1.5">
        {channels.map((channel) => {
          const isActive = channel === active
          return (
            <button
              key={channel}
              type="button"
              role="tab"
              id={`variant-tab-${channel}`}
              ref={(node) => {
                if (node === null) tabRefs.current.delete(channel)
                else tabRefs.current.set(channel, node)
              }}
              aria-selected={isActive}
              aria-controls={`variant-panel-${channel}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setRequested(channel)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
                // Stop the arrow key from also scrolling the tab strip.
                event.preventDefault()
                moveFocus(channel, event.key === 'ArrowRight' ? 1 : -1)
              }}
              className={cn(
                'flex items-center gap-2 rounded-pill border px-3 py-[7px] text-[13px] font-semibold transition-micro',
                isActive
                  ? // dark: tint-50 stays warm-light while --acc flips to Orange300
                    'border-tint-300 bg-tint-50 text-accent dark:bg-s2'
                  : 'border-line bg-bg text-muted hover:border-faint hover:text-ink',
              )}
            >
              {CHANNEL_SHORT[channel]}
              {blocked.has(channel) ? (
                <span
                  className="size-1.5 rounded-pill bg-danger"
                  aria-label="has an issue to fix"
                />
              ) : null}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`variant-panel-${active}`}
        aria-labelledby={`variant-tab-${active}`}
        className="rounded-card border border-line bg-bg p-4 shadow-card"
      >
        <VariantPanel
          key={active}
          channel={active}
          state={variants.states[active]}
          canonicalBody={canonicalBody}
          mediaCount={mediaCount}
          onBodyChange={(body) => variants.setBody(active, body)}
          onExtrasChange={(patch) => variants.setExtras(active, patch)}
          onSave={() => variants.save(active)}
        />
      </div>
    </section>
  )
}
