import { CONSTRAINTS } from '@sahoda/shared'
import type { Channel } from '@sahoda/shared'
import type { PostFormat } from '@sahoda/publishing/format'

import type { ChannelRejection } from '../posts/attach-decision'
import { CENTRE, planCrop, type CropRect, type FocalPoint } from './crop-geometry'
import { targetsFor, type MediaTarget } from './targets'

/**
 * WHETHER A REFUSED FILE CAN HONESTLY BE OFFERED A FIX.
 *
 * ── THE REFUSAL DOES NOT GO AWAY ────────────────────────────────────────────
 * This module never turns a rejection into an acceptance. `decideAttach` returns
 * exactly what it returned before, the server action refuses exactly as it
 * refused before, and nothing is written. All this adds is an OFFER travelling
 * beside the refusal: here is the crop we would make, adjust it, and say yes.
 * Decline and the refusal that is already on screen is the whole outcome.
 *
 * That shape is deliberate. This is the publish path, and the safest possible
 * change to a refusal is one that leaves the refusal literally untouched.
 *
 * ── WHAT A CROP CAN AND CANNOT FIX ──────────────────────────────────────────
 * A crop removes pixels and a re-encode changes the container. Between them they
 * can fix a shape, a type and a size. They cannot fix:
 *
 *   MEDIA_DIMS       the photo is SMALLER than a channel's floor. Cropping makes
 *                    it smaller still, and the only other move is upscaling —
 *                    inventing pixels nobody photographed and calling the result
 *                    a fix. Refused, as today.
 *   MAX_MEDIA_COUNT  a fact about the post, not about the file.
 *   MEDIA_REQUIRED   a fact about the version having no photo at all.
 *   FORMAT_*         (except the aspect one) a contradiction between what the
 *                    writer said they were making and what they attached.
 *
 * A channel carrying any of those is dropped from the crop's TARGET SET rather
 * than blocking the offer: it was never going to accept this file, the crop is
 * not cut to its rules, and its objection is reported afterwards exactly as any
 * other unusable-channel warning is. An offer is made only when at least one
 * channel is left to make it for.
 */

/** Violation codes a crop or a re-encode genuinely resolves. */
const FIXABLE: ReadonlySet<string> = new Set([
  // The engine's own aspect band — Instagram's feed range today.
  'MEDIA_ASPECT',
  // The FORMAT's aspect rule, e.g. a landscape photo dropped into a story.
  'FORMAT_MEDIA_ASPECT',
  // A container no channel on this post takes. Re-encoding is a real fix.
  'MEDIA_TYPE',
  // Over the byte ceiling. Cropping and re-encoding both shrink it.
  'MEDIA_SIZE',
])

/** Is every objection this channel raised one a crop can actually resolve? */
export function isFixable(rejection: ChannelRejection): boolean {
  const violations = Array.isArray(rejection.violations) ? rejection.violations : []
  if (violations.length === 0) return true
  return violations.every((violation) => FIXABLE.has(violation.code))
}

export interface OfferCandidate {
  mime: string
  bytes: number
  width: number
  height: number
}

/** One channel's verdict on the crop, for the row the offer screen shows. */
export interface ChannelOutcome {
  channel: Channel
  format: PostFormat | null
  /** What this channel gets, in pixels. Identical across channels — see below. */
  width: number
  height: number
  /** The rule it now satisfies, or the honest "nothing is declared". */
  note: string
  /** False when this channel was excluded because its objection is not fixable. */
  fixed: boolean
}

export interface CropOffer {
  /** The rectangle, in the ORIGINAL's coordinates, at the suggested focal point. */
  rect: CropRect
  focal: FocalPoint
  /** The original's own facts, so the "before" can be drawn at the right scale. */
  original: OfferCandidate
  /** The container the derivative will be written in. */
  outputMime: string
  /** Per channel: what it ends up with and why that is now acceptable. */
  outcomes: ChannelOutcome[]
  /** The channels the crop is cut for. */
  targets: MediaTarget[]
}

export type OfferDecision =
  | { offered: true; offer: CropOffer }
  | {
      offered: false
      /**
       * Why not. Carried so the caller can say something specific rather than
       * silently showing the bare refusal — a fix that is impossible is worth a
       * sentence, and a fix that is merely not implemented is not the same thing.
       */
      reason: 'nothing_fixable' | 'bands_conflict' | 'below_floor' | 'no_fit' | 'no_common_type'
    }

/**
 * The container the cropped copy is written in.
 *
 * ── "WEBP WHERE THE CHANNEL ACCEPTS IT" IS ONE CHANNEL ──────────────────────
 * Only `x` lists `image/webp` in `mediaTypes`. gbp, linkedin and instagram list
 * jpeg and png and nothing else. So webp is chosen when x is the only channel
 * the crop is cut for, and the original's own container is kept everywhere else
 * — which is exactly the rule, once the specs are read rather than assumed.
 * Minting a webp for a Google Business post would produce a file `validateMedia`
 * then refuses with MEDIA_TYPE: a derivative that fails the gate that asked for
 * it.
 *
 * Transcoding is a last resort and it picks by what the original IS: a gif or a
 * png is graphics or line art and goes to png, which is lossless; a jpeg or webp
 * is a photograph and goes to jpeg.
 */
export function outputMimeFor(originalMime: string, targets: readonly MediaTarget[]): string | null {
  if (targets.length === 0) return null
  let accepted: Set<string> | null = null
  for (const target of targets) {
    const mimes = new Set(target.mimes)
    if (accepted === null) {
      accepted = mimes
      continue
    }
    accepted = new Set([...accepted].filter((mime) => mimes.has(mime)))
  }
  if (accepted === null || accepted.size === 0) return null

  if (accepted.has('image/webp')) return 'image/webp'
  if (accepted.has(originalMime)) return originalMime

  const preferred =
    originalMime === 'image/gif' || originalMime === 'image/png' ? 'image/png' : 'image/jpeg'
  if (accepted.has(preferred)) return preferred
  if (accepted.has('image/jpeg')) return 'image/jpeg'
  if (accepted.has('image/png')) return 'image/png'
  return null
}

/** The sentence under each channel on the offer screen. Never invents a rule. */
function noteFor(target: MediaTarget, fixed: boolean): string {
  if (!fixed) return 'Will not take this file — cropping cannot fix it.'
  const parts: string[] = []
  if (target.aspect !== null) {
    const { min, max } = target.aspect
    if (min !== null && max !== null) parts.push(`inside the ${min}–${max} shape range`)
    else if (max !== null) parts.push(`no wider than ${max}:1`)
    else if (min !== null) parts.push(`no narrower than ${min}:1`)
  }
  if (target.minW !== null && target.minH !== null) {
    parts.push(`at least ${target.minW}×${target.minH}`)
  }
  // The honest answer for LinkedIn, which declares nothing at all. Saying
  // "1200×628" here would be this file inventing a rule the engine does not have.
  if (parts.length === 0) return 'States no size or shape rule — takes it as it is.'
  return `Needs ${parts.join(', ')}.`
}

/**
 * Build the offer, or explain why there is not one.
 *
 * `rejections` is `decideAttach`'s own output, so the split between fixable and
 * not is made against the violations the engine actually raised rather than
 * against a second guess at what it would have raised.
 */
export function buildOffer(
  channels: readonly Channel[],
  formats: Readonly<Partial<Record<Channel, PostFormat | null>>>,
  candidate: OfferCandidate,
  rejections: readonly ChannelRejection[],
  focal: FocalPoint = CENTRE,
): OfferDecision {
  const objectionBy = new Map<Channel, ChannelRejection>()
  for (const rejection of rejections) {
    if (typeof rejection.channel === 'string' && rejection.channel in CONSTRAINTS) {
      objectionBy.set(rejection.channel, rejection)
    }
  }

  const selected = [...new Set(channels)].filter((channel) => channel in CONSTRAINTS)
  // A channel with no objection is IN the target set: the crop must not break a
  // channel that was already happy with the file.
  const fixableChannels = selected.filter((channel) => {
    const objection = objectionBy.get(channel)
    return objection === undefined || isFixable(objection)
  })
  const excluded = selected.filter((channel) => !fixableChannels.includes(channel))

  if (fixableChannels.length === 0) return { offered: false, reason: 'nothing_fixable' }

  const targets = targetsFor(fixableChannels, formats)
  const plan = planCrop(candidate, targets, focal)
  if (!plan.ok) return { offered: false, reason: plan.reason }

  const outputMime = outputMimeFor(candidate.mime, targets)
  if (outputMime === null) return { offered: false, reason: 'no_common_type' }

  // Nothing to fix and nothing to change: the file already fits every channel it
  // is cut for and its container is fine. Offering a crop that removes no pixels
  // would be a button that mints an identical copy.
  if (!plan.changed && outputMime === candidate.mime && objectionBy.size === 0) {
    return { offered: false, reason: 'nothing_fixable' }
  }

  const outcomes: ChannelOutcome[] = [
    ...targets.map((target) => ({
      channel: target.channel,
      format: target.format,
      width: plan.rect.width,
      height: plan.rect.height,
      note: noteFor(target, true),
      fixed: true,
    })),
    ...targetsFor(excluded, formats).map((target) => ({
      channel: target.channel,
      format: target.format,
      width: plan.rect.width,
      height: plan.rect.height,
      note: noteFor(target, false),
      fixed: false,
    })),
  ]

  return {
    offered: true,
    offer: {
      rect: plan.rect,
      focal,
      original: candidate,
      outputMime,
      outcomes,
      targets,
    },
  }
}
