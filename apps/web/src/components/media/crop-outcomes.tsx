'use client'

import { Check, X } from 'lucide-react'

import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import type { ChannelOutcome } from '@/lib/media/crop-offer'

/**
 * WHAT EACH CHANNEL ENDS UP WITH — one row per channel on the post.
 *
 * ── EVERY CHANNEL GETS THE SAME FILE, AND THE ROWS SAY SO BY AGREEING ───────
 * `post_media` has no channel column and the publisher's query has no channel
 * predicate: it reads a post's attachments and sends the same object to every
 * variant. So one crop is cut to the shape every selected channel can live
 * inside at once, and the dimensions on these rows are identical by
 * construction. They are printed per channel anyway, because the RULE differs
 * even when the file does not — and a person deciding whether to accept needs to
 * see that Instagram's band is what forced the crop while LinkedIn asked for
 * nothing.
 *
 * ── AND A CHANNEL THE CROP CANNOT HELP SAYS SO PLAINLY ──────────────────────
 * A photo under Google Business's 250px floor is still under it after a crop —
 * cropping only removes pixels. That row reads as a refusal, not as a fix, so
 * nobody accepts a crop believing it solved something it did not.
 *
 * ── THE GREYSCALE TEST ──────────────────────────────────────────────────────
 * The two states differ by ICON and by SENTENCE, never by colour alone. Printed
 * in grey, "Will not take this file" is still the row that failed.
 */
export function CropOutcomes({ outcomes }: { outcomes: readonly ChannelOutcome[] }) {
  if (outcomes.length === 0) return null

  return (
    <ul className="divide-y divide-line rounded-input border border-line">
      {outcomes.map((outcome) => (
        <li key={outcome.channel} className="flex items-start gap-2.5 px-3 py-2.5">
          {outcome.fixed ? (
            <Check size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink" aria-hidden />
          ) : (
            <X size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2 type-body font-[550] text-ink">
              {CHANNEL_LABELS[outcome.channel]}
              {outcome.format === null ? null : (
                <span className="type-eyebrow font-mono text-muted">{outcome.format}</span>
              )}
            </p>
            <p className="mt-0.5 type-sm text-muted">{outcome.note}</p>
          </div>
          <span className="mt-px shrink-0 type-sm tabular-nums text-muted">
            {outcome.fixed ? `${outcome.width}×${outcome.height}` : '—'}
          </span>
        </li>
      ))}
    </ul>
  )
}
