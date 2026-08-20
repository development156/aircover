'use client'

import type { Channel, ChannelSet } from '@sahoda/shared'
import type { PostFormat } from '@sahoda/publishing/format'

import { GeneratePanel } from '@/components/posts/generate-panel'
import type { GeneratedVariant } from '@/lib/posts/state'
import type { VariantsApi } from '@/components/posts/use-variants'

import { VersionCard } from './version-card'
import type { VariantFormatApi } from './use-variant-format'

export interface VersionsPaneProps {
  channels: ChannelSet
  variants: VariantsApi
  formats: VariantFormatApi
  mediaCount: number
  /** Write the post now; resolves to the row it landed in, or null. */
  flush: () => Promise<string | null>
  onGenerated: (items: GeneratedVariant[]) => void
  /** True when the composer's single primary action belongs to Generate. */
  generateIsPrimary: boolean
  onSaved: (channel: Channel) => void
}

/**
 * THE CENTRE OF THE SCREEN: every channel's version of the post, at once.
 *
 * ── WHAT THIS PANE IS FOR ────────────────────────────────────────────────────
 * "I write once, pick channels, and Sahoda shows me each version to approve."
 * Everything here serves that sentence. The stack is the demonstration; the
 * Adapt button is the moment the product does the thing.
 *
 * ── THE EMPTY STATE IS NOT AN APOLOGY ────────────────────────────────────────
 * With no channel picked there is nothing to show and one thing to do, so it says
 * that once, in one sentence. docs/27 §1 counted six different ways of saying
 * "nothing yet" on one screen; this pane gets exactly one.
 */
export function VersionsPane({
  channels,
  variants,
  formats,
  mediaCount,
  flush,
  onGenerated,
  generateIsPrimary,
  onSaved,
}: VersionsPaneProps) {
  return (
    <section className="space-y-3" data-guide="post-variants" aria-labelledby="versions-heading">
      <div className="flex min-h-5 flex-wrap items-baseline justify-between gap-2">
        <h2 id="versions-heading" className="type-h2">
          Each channel&rsquo;s version
        </h2>
        {channels.length > 0 ? (
          <p className="text-[12.5px] text-muted">
            One body per channel. Edit any of them without touching the others.
          </p>
        ) : null}
      </div>

      {channels.length === 0 ? (
        <p className="surface-ring rounded-card bg-surface p-4 text-[13px] text-muted">
          Pick a channel above and its version opens here.
        </p>
      ) : (
        <>
          <GeneratePanel
            channels={channels}
            flush={flush}
            onGenerated={onGenerated}
            emphasis={generateIsPrimary ? 'primary' : 'secondary'}
          />

          <div className="space-y-3">
            {channels.map((channel) => (
              <VersionCard
                key={channel}
                channel={channel}
                state={variants.states[channel]}
                mediaCount={mediaCount}
                format={formats.chosen[channel] ?? null}
                onFormatChange={(format) => formats.set(channel, format)}
                onBodyChange={(body) => variants.setBody(channel, body)}
                onExtrasChange={(patch) => variants.setExtras(channel, patch)}
                onSave={() => onSaved(channel)}
                onKeepMine={() => variants.keepMine(channel)}
                onUseTheirs={(theirs) => variants.useTheirs(channel, theirs)}
              />
            ))}
          </div>

          {formats.error !== null ? (
            <p role="alert" className="text-[12.5px] text-danger">
              {formats.error}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
