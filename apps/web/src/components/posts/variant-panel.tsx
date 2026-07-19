'use client'

import { EyeOff } from 'lucide-react'
import { CONSTRAINTS, type Channel } from '@sahoda/shared'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { meterFor } from '@/lib/posts/counters'
import { hasLink } from '@/lib/posts/detect-link'
import { gbpCtaTypes, isValidGbpCta } from '@/lib/posts/variant-extras'

import { CHANNEL_LABELS } from './channel-label'
import { ChannelMeterView } from './channel-meter'
import { InlineError } from './inline-error'
import type { VariantState } from './use-variants'

export interface VariantPanelProps {
  channel: Channel
  state: VariantState
  canonicalBody: string
  onBodyChange: (body: string) => void
  onExtrasChange: (patch: { gbpCta?: string; hashtags?: string[] }) => void
  onSave: () => void
}

const MAX_TRIM_PASSES = 200

/**
 * Shorten `body` until the engine stops reporting an over-limit.
 *
 * Not a plain `slice(0, maxChars)`: on X a link counts as a fixed 23 characters
 * whatever its real length, so the character budget and the string length are
 * different numbers. Each pass removes at least one character, so this ends.
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
  onBodyChange,
  onExtrasChange,
  onSave,
}: VariantPanelProps) {
  const spec = CONSTRAINTS[channel]
  const hashtags = state.extras.hashtags
  const meter = meterFor(channel, { body: state.body, hashtags, hasLink: hasLink(state.body) })

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
        <p className="flex items-start gap-2 rounded-input bg-warn-bg px-3 py-2.5 text-[13px] text-warn">
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
        <p className="text-[12.5px] text-faint">
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
          {hashtags.map((tag) => (
            <span
              key={tag}
              className="rounded-pill bg-s2 px-2.5 py-1 text-[12px] font-semibold text-ink"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {spec.gbp !== undefined ? (
        <div className="space-y-1.5">
          <Label htmlFor={`cta-${channel}`}>Call to action</Label>
          <select
            id={`cta-${channel}`}
            value={storedCta ?? ''}
            onChange={(event) =>
              onExtrasChange({
                gbpCta: event.target.value === '' ? undefined : event.target.value,
              })
            }
            className="w-full rounded-input border border-line bg-s1 px-3 py-2.5 text-[14px] text-ink transition-micro focus:bg-bg focus:outline-none"
          >
            <option value="">No call to action</option>
            {gbpCtaTypes().map((cta) => (
              <option key={cta} value={cta}>
                {cta}
              </option>
            ))}
          </select>
          {ctaUnknown ? (
            <p className="text-[12.5px] text-warn">
              The saved call to action is not one Google accepts — pick one from the list.
            </p>
          ) : null}
        </div>
      ) : null}

      {state.error !== null ? <InlineError>{state.error}</InlineError> : null}

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={onSave}
          loading={state.saving}
          disabled={!state.dirty || state.body === ''}
        >
          {state.saving ? 'Saving' : state.dirty ? 'Save variant' : 'Saved'}
        </Button>
        {state.dirty && !state.saving ? (
          <span className="text-[12px] text-faint">Not saved yet</span>
        ) : null}
      </div>
    </div>
  )
}
