'use client'

import { CONSTRAINTS, type Channel } from '@sahoda/shared'
import {
  defaultFormatFor,
  formatsFor,
  mediaRuleFor,
  type PostFormat,
} from '@sahoda/publishing/format'

import { Label } from '@/components/ui/label'
import type { VariantExtras } from '@/lib/posts/variant-extras'

import { GbpOptions } from './gbp-options'

/** The word a person uses, per stored value. Never the enum. */
const FORMAT_LABEL: Readonly<Record<PostFormat, string>> = {
  text: 'Text only',
  image: 'One photo',
  // NOT "a set to swipe". Swiping is Instagram's word for it; on X the same
  // format renders as a grid and on LinkedIn as a multi-image post, and one
  // label sits on all three cards.
  carousel: 'A set of photos',
  story: 'A story — gone in 24 hours',
  thread: 'A thread',
  video: 'Video',
}

const SELECT_CLASS =
  'h-input w-full rounded-sm bg-s1 px-2.5 text-[13px] text-ink transition-micro shadow-[inset_0_0_0_1px_var(--line)] focus:bg-surface focus:outline-none max-narrow:min-h-[44px]'

export interface VersionOptionsProps {
  channel: Channel
  format: PostFormat | null
  onFormatChange: (format: PostFormat | null) => void
  extras: VariantExtras
  onExtrasChange: (patch: VariantExtras) => void
}

/**
 * The per-channel settings that are not the text: what KIND of post this is, and
 * Google's button.
 *
 * ── FORMAT IS PER CHANNEL, AND WAS NOT ──────────────────────────────────────
 * `post_variants.format` has always been a per-channel column, but the deleted
 * wizard collected ONE answer on a Format step and wrote it to every variant, so
 * choosing a carousel for Instagram forced a carousel on X. It lives here now,
 * beside the body it describes, and changing it changes THIS card's media rules
 * and nothing else.
 *
 * ── WHAT IS OFFERED IS WHAT CAN PUBLISH ─────────────────────────────────────
 * `formatsFor` derives the list from the channel's own spec — `mediaTypes`,
 * `requiresMedia`, `maxMediaCount` — and adds the channel formats that have a
 * Zernio field behind them. A format that publishing would refuse is never a
 * choice rather than a choice that fails days later. Instagram has no "Text only"
 * here because Instagram has no text-only post, and only Instagram has a story.
 *
 * ── AND WHAT IT NEEDS IS SAID BEFORE ANYTHING GOES WRONG ────────────────────
 * The sentence under the picker is the format's own media rule, resolved against
 * this channel's cap — so "Two or more photos, in order" appears next to a set
 * before the writer attaches anything, rather than as a refusal afterwards.
 */
export function VersionOptions({
  channel,
  format,
  onFormatChange,
  extras,
  onExtrasChange,
}: VersionOptionsProps) {
  const spec = CONSTRAINTS[channel]
  const available = formatsFor(spec)
  const rule = format === null ? null : mediaRuleFor(spec, format)

  return (
    <div className="grid gap-3 narrow:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`format-${channel}`}>Kind of post</Label>
        <select
          id={`format-${channel}`}
          data-variant-format={channel}
          value={format ?? ''}
          onChange={(event) =>
            onFormatChange(event.target.value === '' ? null : (event.target.value as PostFormat))
          }
          className={SELECT_CLASS}
        >
          {/* Nobody has said, and that is a real answer: every variant written
              before the column existed is in it, and none of them is held to
              anything. Clearing back to it must stay possible. */}
          <option value="">Not stated</option>
          {available.map((option) => (
            <option key={option} value={option}>
              {FORMAT_LABEL[option]}
              {option === defaultFormatFor(spec) ? ' · usual' : ''}
            </option>
          ))}
        </select>
        {rule === null ? (
          <p className="text-[12.5px] text-muted">
            Nothing is checked against a kind until you pick one.
          </p>
        ) : (
          <p className="text-[12.5px] text-muted" data-format-need={channel}>
            {rule.need}
            {rule.maxItems > 1 ? (
              <>
                {' '}
                Up to <span className="tabular-nums">{rule.maxItems}</span> here.
              </>
            ) : null}
          </p>
        )}
      </div>

      {spec.gbp !== undefined ? (
        <GbpOptions extras={extras} onExtrasChange={onExtrasChange} />
      ) : null}
    </div>
  )
}
