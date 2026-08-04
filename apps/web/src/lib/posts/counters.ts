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

/** Score one draft against every selected channel, preserving the caller's order. */
export function metersFor(channels: readonly Channel[], draft: VariantDraft): ChannelMeter[] {
  return channels.map((channel) => meterFor(channel, draft))
}

/** Channels the writer must fix before publishing — any violation blocks, not just length. */
export function blockingChannels(meters: readonly ChannelMeter[]): Channel[] {
  return meters.filter((meter) => meter.violations.length > 0).map((meter) => meter.channel)
}
