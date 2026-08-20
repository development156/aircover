'use client'

import { EyeOff } from 'lucide-react'
import { CONSTRAINTS, type Channel } from '@sahoda/shared'

import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { meterFor } from '@/lib/posts/counters'
import { hasLink } from '@/lib/posts/detect-link'
import { gbpCtaTypes, isValidGbpCta } from '@/lib/posts/variant-extras'

import { CHANNEL_LABELS } from './channel-label'
import { ChannelMeterView } from './channel-meter'
import { InlineError } from './inline-error'
import { VariantConflictNotice } from './variant-conflict-notice'
import type { VariantState } from './use-variants'

export interface VariantPanelProps {
  channel: Channel
  state: VariantState
  canonicalBody: string
  /** Files attached to this post — scored against this channel's `maxMediaCount`. */
  mediaCount: number
  onBodyChange: (body: string) => void
  onExtrasChange: (patch: { gbpCta?: string; hashtags?: string[] }) => void
  onSave: () => void
  /** Re-send the local text against the version the refusal carried. */
  onKeepMine: () => void
  /** Load the stored text into the box. Writes nothing. */
  onUseTheirs: (theirs: string) => void
}

const MAX_TRIM_PASSES = 200

/**
 * Shorten `body` until the engine stops reporting an over-limit.
 *
 * Not a plain `slice(0, maxChars)`: on X a link counts as a fixed 23 characters
 * whatever its real length, so the character budget and the string length are
 * different numbers. Each pass removes at least one character, so this ends.
 *
 * Scores the character budget only, so it passes no `mediaCount`: `meter.over`
 * is set by `charCount > maxChars` alone, and trimming text cannot clear a
 * media-count violation anyway.
 */
function trimToFit(channel: Channel, body: string, hashtags: string[] | undefined): string {
  let next = body
  for (let pass = 0; pass < MAX_TRIM_PASSES && next.length > 0; pass += 1) {
    const meter = meterFor(channel, { body: next, hashtags, hasLink: hasLink(next) })
    if (!meter.over) return next
    const excess = Math.max(1, meter.charCount - meter.maxChars)
    next = next.slice(0, Math.max(0, next.length - excess))
  }
  return next
}

export function VariantPanel({
  channel,
  state,
  canonicalBody,
  mediaCount,
  onBodyChange,
  onExtrasChange,
  onSave,
  onKeepMine,
  onUseTheirs,
}: VariantPanelProps) {
  const spec = CONSTRAINTS[channel]
  const hashtags = state.extras.hashtags
  const meter = meterFor(channel, {
    body: state.body,
    hashtags,
    hasLink: hasLink(state.body),
    mediaCount,
  })

  // MAX_MEDIA_COUNT deliberately gets no entry here. Media lives on the post and
  // this panel has no way to detach a file, so a "Remove extra media" button
  // would do nothing; `ChannelMeterView` renders the label as plain text when no
  // handler exists, which states the problem without faking an affordance.
  const fixes: Partial<Record<string, () => void>> = {
    MAX_CHARS: () => onBodyChange(trimToFit(channel, state.body, hashtags)),
  }
  if (spec.maxHashtags !== undefined && hashtags !== undefined) {
    const limit = spec.maxHashtags
    fixes['MAX_HASHTAGS'] = () => onExtrasChange({ hashtags: hashtags.slice(0, limit) })
  }

  const storedCta = state.extras.gbpCta
  const ctaUnknown = storedCta !== undefined && storedCta !== '' && !isValidGbpCta(storedCta)

  return (
    <div className="space-y-3">
      {!spec.publishable ? (
        <p className="flex items-start gap-2 rounded-input bg-warn-bg px-3 py-2.5 type-body text-warn">
          <EyeOff size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {CHANNEL_LABELS[channel]} is preview-only in Alpha. I can draft and check this caption,
            but nothing here can publish it.
          </span>
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor={`variant-${channel}`}>{CHANNEL_LABELS[channel]} copy</Label>
        <Textarea
          id={`variant-${channel}`}
          value={state.body}
          error={meter.violations.length > 0}
          rows={8}
          placeholder={`Write the ${CHANNEL_LABELS[channel]} version…`}
          onChange={(event) => onBodyChange(event.target.value)}
        />
      </div>

      {state.body === '' ? (
        <p className="type-sm text-muted">
          Nothing drafted for this channel yet.{' '}
          {canonicalBody.trim() !== '' ? (
            <button
              type="button"
              className="font-semibold text-accent underline underline-offset-2 transition-micro hover:opacity-80"
              onClick={() => onBodyChange(canonicalBody)}
            >
              Copy the post body
            </button>
          ) : (
            'Write the post body first, or generate variants below.'
          )}
        </p>
      ) : null}

      <ChannelMeterView meter={meter} fixes={fixes} />

      {hashtags !== undefined && hashtags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {/* `Chip`, not a hand-rolled pill. docs/26 §10.1: a chip is data the
              USER put there and a badge is a status the SYSTEM computed. A
              hashtag is the writer's own input, so it is a chip — and rendering
              it as a bespoke pill is how the same object ends up with three
              looks across three screens. No `onRemove`: this panel cannot edit
              the list one tag at a time, and a remove affordance that does
              nothing is worse than none. */}
          {hashtags.map((tag) => (
            <Chip key={tag}>{tag}</Chip>
          ))}
        </div>
      ) : null}

      {spec.gbp !== undefined ? (
        <div className="space-y-1.5">
          <Label htmlFor={`cta-${channel}`}>Call to action</Label>
          {/* The `Select` primitive, not a hand-rolled `<select>`. The local copy
              set `text-[14px]`, which is not a step on the scale (docs/26 §5),
              and carried no `max-narrow:min-h-[44px]` — so on a phone the one
              control whose hit area is exactly its box was under the 44px floor
              (§9). Both come free from the primitive. */}
          <Select
            id={`cta-${channel}`}
            value={storedCta ?? ''}
            onChange={(event) =>
              onExtrasChange({
                gbpCta: event.target.value === '' ? undefined : event.target.value,
              })
            }
          >
            <option value="">No call to action</option>
            {gbpCtaTypes().map((cta) => (
              <option key={cta} value={cta}>
                {cta}
              </option>
            ))}
          </Select>
          {ctaUnknown ? (
            <p className="type-sm text-warn">
              The saved call to action is not one Google accepts — pick one from the list.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── ABOVE THE SAVE BUTTON, AND ONLY ONE OF THE TWO EVER SHOWS ─────────
          A clash is not an error and must not be dressed as one: the writer has
          a choice to make, and `use-variants` already clears `error` whenever it
          sets `conflict` so the two cannot stack. Placed directly above the
          button that was just pressed, because that is where the eye already is. */}
      {state.conflict !== null ? (
        <VariantConflictNotice
          conflict={state.conflict}
          onKeepMine={onKeepMine}
          onUseTheirs={onUseTheirs}
        />
      ) : null}

      {state.error !== null ? <InlineError>{state.error}</InlineError> : null}

      {/* ── ONE THING PER STATE, AND NEVER A CLAIM ABOUT A WRITE THAT DID NOT
             HAPPEN ─────────────────────────────────────────────────────────
          This was a single `<Button>` whose label was chosen by `dirty` and
          which went `disabled` when there was nothing to save. Two defects,
          and the second is the serious one:

          1. It rendered STATE as a disabled control. A disabled button is
             still announced as a button (docs/26 §10.2), so a screen reader
             offers "Saved, button", the reader takes it, and nothing happens.
             This is the defect docs/28 removed from /planner; it survived here.

          2. `!dirty` chose the word "Saved" — and a channel that has never
             been written to seeds as `{ body: '', dirty: false }`
             (`use-variants.ts` EMPTY). So an untouched channel said "Saved"
             directly beneath this panel's own "Nothing drafted for this
             channel yet." One screen, two contradictory sentences, and the
             wrong one was a claim about the database.

          Now: an action when there IS something to save, a plain status when
          there is not, and nothing at all when nothing has ever been written —
          the sentence above already covers that case, and saying it twice is
          what /home was demoted for. */}
      <div className="flex items-center gap-3">
        {state.saving ? (
          <Button size="sm" onClick={onSave} loading>
            Saving
          </Button>
        ) : state.dirty && state.body !== '' ? (
          // The ENABLED button is itself the "not saved" signal, so it carries
          // no companion line repeating it.
          <Button size="sm" onClick={onSave}>
            Save variant
          </Button>
        ) : state.body !== '' ? (
          <p className="type-sm text-muted">Saved</p>
        ) : null}
      </div>
    </div>
  )
}
