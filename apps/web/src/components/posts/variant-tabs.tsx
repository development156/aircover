'use client'

import { useRef, useState } from 'react'
import type { Channel, ChannelSet } from '@sahoda/shared'

import { CardEmpty } from '@/components/empty-state'
import { CardLabel } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { blockingChannels, meterFor } from '@/lib/posts/counters'
import { hasLink } from '@/lib/posts/detect-link'

import { CHANNEL_SHORT } from './channel-label'
import { LiveLink } from './live-link'
import { VariantPanel } from './variant-panel'
import type { VariantsApi } from './use-variants'

export interface VariantTabsProps {
  channels: ChannelSet
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
 * Per-channel variant tabs.
 *
 * ── WHY THESE ARE BUTTONS, AND NOT THE `Tabs` PRIMITIVE ──────────────────────
 * This note used to read "there is no tabs primitive in the repo", citing
 * docs/08, which docs/26 supersedes. `components/ui/tabs.tsx` exists — but it is
 * NAVIGATION: `TabItem` requires an `href` and it renders `<Link>`s, because
 * docs/26 §10.2 rules that a tab which changes the URL must be a link.
 *
 * These tabs change no URL. They switch which per-channel draft the editor is
 * showing, and those drafts hold UNSAVED text. Routing here would put a
 * writer's unsaved caption behind a navigation, and reload — the property
 * §10.2 wants links for — is precisely the event that would destroy it. So the
 * rule's rationale points the other way for this one control, and a `role=
 * "tablist"` of buttons with a roving tabindex is the correct shape.
 *
 * They still owe everything else the primitive provides, and one of those was
 * missing until 2026-08-20: the `max-narrow:min-h-[44px]` touch floor.
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
        {/* `CardEmpty` — the SECTION level of the absence vocabulary (docs/26
            §4.1). This was a hand-built paragraph, which is one more visual
            language for "nothing here" on a screen that already has several.
            The claim is unchanged; only the treatment moved. */}
        <div className="rounded-card border border-line bg-bg">
          <CardEmpty body="Pick a channel below and Sahoda opens a tab for it here." />
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-3" data-guide="post-variants">
      {/* The same 20px header row Media and Post use, even with nothing trailing.
          Those two carry a 12px/20px value beside the label, so `items-center`
          settles their 14px label 3px down the row — and this one, unwrapped, sat
          at the container top. Three adjacent column labels, one type, three
          baselines. `min-h-5` states the row height instead of inheriting it from
          whatever happens to sit next to the label. */}
      <div className="flex min-h-5 items-center justify-between gap-2">
        <CardLabel className="mb-0">Channel variants</CardLabel>
      </div>

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
                // Same `.sl-chip` shape as the picker. These tabs are the
                // PER-CHANNEL VARIANTS — one body and one publish state each —
                // so the selected tab has to read as "you are editing this one",
                // which solid ink does more plainly than a wash.
                // The touch floor (docs/26 §9: "at narrow widths EVERY
                // interactive control grows to it"). These tabs are h-7 — 28px,
                // 16px under the floor — and they are how a phone user reaches
                // any channel but the first, so they were the most important
                // controls on the screen to have missed it. The `Tabs` primitive
                // already carries this line; these tabs cannot use it because it
                // is navigation-only (links with an href), and a variant tab
                // switches an editing pane holding unsaved text.
                'inline-flex h-7 items-center gap-2 rounded-full px-[10px] text-[13px] font-[550] transition-micro max-narrow:min-h-[44px]',
                isActive
                  ? 'bg-ink text-white dark:bg-white dark:text-[var(--canvas)]'
                  : 'text-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink hover:shadow-[inset_0_0_0_1px_var(--line-firm)]',
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
        className="space-y-3 rounded-card border border-line bg-bg p-4 shadow-card"
      >
        {/* Above the editor, because a post that is already live changes what the
            writer is doing: they are looking at what went out, not drafting it. */}
        <LiveLink channel={active} permalink={variants.states[active].permalink} />

        <VariantPanel
          key={active}
          channel={active}
          state={variants.states[active]}
          canonicalBody={canonicalBody}
          mediaCount={mediaCount}
          onBodyChange={(body) => variants.setBody(active, body)}
          onExtrasChange={(patch) => variants.setExtras(active, patch)}
          onSave={() => variants.save(active)}
          onKeepMine={() => variants.keepMine(active)}
          onUseTheirs={(theirs) => variants.useTheirs(active, theirs)}
        />
      </div>
    </section>
  )
}
