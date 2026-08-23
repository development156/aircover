import type { FormatRefusal } from '@sahoda/publishing/format'
import {
  CONSTRAINTS,
  validateVariant,
  type Channel,
  type ConstraintViolation,
  type VariantDraft,
} from '@sahoda/shared'

/**
 * Live per-channel meter for the post editor.
 *
 * Counting and validation are NOT reimplemented here — every number comes from the
 * frozen Constraint Engine in @sahoda/shared, so the meter the writer sees and the
 * rules the adapters enforce can never drift. This module only reshapes the engine's
 * answer into what the meter UI renders.
 *
 * Pure: no React, no I/O, no clock.
 */
export interface ChannelMeter {
  channel: Channel
  charCount: number
  maxChars: number
  /** maxChars - charCount; goes negative once the draft is over. */
  remaining: number
  /** True only when the character budget is blown — other violations do not set this. */
  over: boolean
  violations: ConstraintViolation[]
  /** From the spec. A channel the engine cannot format is not a violation. */
  publishable: boolean
}

/** Score one draft against one channel's spec. */
export function meterFor(channel: Channel, draft: VariantDraft): ChannelMeter {
  const spec = CONSTRAINTS[channel]
  const { violations, charCount } = validateVariant(spec, draft)

  return {
    channel,
    charCount,
    maxChars: spec.maxChars,
    remaining: spec.maxChars - charCount,
    over: charCount > spec.maxChars,
    violations,
    publishable: spec.publishable,
  }
}

/**
 * The same meter, with the format's own verdict folded into its violations.
 *
 * ── WHY A SECOND FUNCTION AND NOT A THIRD ARGUMENT TO `meterFor` ────────────
 * Two reasons, and the second is the important one.
 *
 * An optional parameter that silently defaults is the exact shape of two defects
 * this repo shipped in two days — `lagHours?` and `simulated?` — and a call site
 * that forgot it would go on rendering a green card for a post publishing will
 * refuse. A separate, named call cannot be forgotten by omission: it is either
 * in the file or it is not.
 *
 * And it mirrors the publish path exactly. `runPublishPost` runs
 * `validateVariant` and THEN `refuseFormat`, as two verdicts from two sources —
 * the Constraint Engine says what the channel allows, the format says what the
 * writer meant. Composing them in one function here would model them as one
 * thing, which is the confusion the format dimension exists to end.
 *
 * The refusal is appended rather than prepended: the channel's own rules are the
 * more fundamental problem, and a writer who is over the character limit AND has
 * the wrong number of photos should read them in that order.
 */
export function withFormat(meter: ChannelMeter, refusal: FormatRefusal | null): ChannelMeter {
  if (refusal === null) return meter

  // ── ONE PROBLEM, ONE SENTENCE ───────────────────────────────────────────────
  // MEASURED in a 1440 screenshot of an Instagram carousel with nothing
  // attached: the card showed BOTH "Instagram needs at least one photo. There
  // is no text-only post." and "A set needs at least two images." Two rules, two
  // sources, and to the person reading them one problem — there are no photos.
  //
  // The channel's rule is the more fundamental of the two and it is the one the
  // engine emits, so the format's version is dropped rather than stacked. The
  // moment a photo IS attached, `MEDIA_REQUIRED` clears and the format's own
  // "a set needs at least two" appears on its own, which is when it is the
  // sentence that helps.
  const alreadySaid =
    refusal.code === 'FORMAT_NEEDS_MEDIA' &&
    meter.violations.some((v) => v.code === 'MEDIA_REQUIRED')
  if (alreadySaid) return meter

  return {
    ...meter,
    violations: [...meter.violations, { code: refusal.code, message: refusal.message }],
  }
}

/** Score one draft against every selected channel, preserving the caller's order. */
export function metersFor(channels: readonly Channel[], draft: VariantDraft): ChannelMeter[] {
  return channels.map((channel) => meterFor(channel, draft))
}

/** Channels the writer must fix before publishing — any violation blocks, not just length. */
export function blockingChannels(meters: readonly ChannelMeter[]): Channel[] {
  return meters.filter((meter) => meter.violations.length > 0).map((meter) => meter.channel)
}
