import type { PlatformSpec } from '@sahoda/shared'

import type { PostFormat } from './format-vocabulary'
import {
  CHANNEL_FORMATS,
  acceptsMultipleMedia,
  acceptsTextOnly,
  acceptsVideo,
  mediaRuleFor,
} from './format-rules'

/**
 * WHY A CHANNEL CANNOT PUBLISH THIS VERSION AS THE KIND IT SAYS IT IS.
 *
 * ── WHAT A FORMAT IS FOR ─────────────────────────────────────────────────────
 * It is a DECLARATION OF INTENT that publishing enforces. Without one, a writer
 * who meant a photo post and attached nothing publishes bare text and is told it
 * worked; a writer who meant text-only and left a stray image attached publishes
 * the image. Neither is caught anywhere else, because the Constraint Engine
 * checks the media against the CHANNEL and finds both perfectly legal. Only the
 * format knows what the writer meant.
 *
 * ── NULL RETURNS NULL, AND THAT IS THE WHOLE COMPATIBILITY STORY ─────────────
 * Every variant written before migration 20260819000200 has no format, and none
 * of them changes behaviour. Only a version that states an intent is held to it.
 *
 * Pure: no I/O, no clock, no database, and only type imports from outside.
 */

/** A refusal, in the shape `runPublishPost` already fails with. */
export interface FormatRefusal {
  code: string
  message: string
}

/** Whether this channel offers this format at all. */
function channelOffers(spec: PlatformSpec, format: PostFormat): boolean {
  return (CHANNEL_FORMATS[spec.channel] ?? []).includes(format)
}

/**
 * Why this channel cannot publish this variant as the format it declares, or null.
 *
 * Counting only — dimensions are deliberately absent. FSD §3.1 is explicit that
 * media is *"validated per target platform (dims/size/type) **at attach time**,
 * not at publish"*, and the publish path could not honour a dimension rule even
 * if it wanted to: `PublishRequestMedia` carries `storagePath`, `mime` and
 * `bytes` and no pixels. A check written here against a width that is never
 * present would pass for every post, forever, and read as a guard. See
 * `refuseFormatMedia` for the rule that runs where the pixels are.
 */
export function refuseFormat(
  spec: PlatformSpec,
  format: PostFormat | null | undefined,
  mediaCount: number,
): FormatRefusal | null {
  if (format === null || format === undefined) return null

  const channel = spec.channel

  // ── FORMATS THIS CHANNEL DOES NOT HAVE ──────────────────────────────────────
  if (format === 'video' && !acceptsVideo(spec)) {
    // Derived: no `video/*` in this channel's mediaTypes. Every channel is in
    // that position today, which is why the picker never offers video — but the
    // refusal reads the contract rather than repeating that fact.
    // ── NO CHANNEL NAME MID-SENTENCE ─────────────────────────────────────────
    // MEASURED: apps/web's `presentViolation` rewrites the channel key into its
    // display label ONLY when the key LEADS the message, because anchoring is
    // what stops a channel word inside prose from being rewritten. So
    // "…video to gbp yet." rendered the raw enum, in lowercase, to a shop owner.
    // The message sits on that channel's own card, so naming it adds nothing.
    return {
      code: 'FORMAT_UNSUPPORTED',
      message: 'Sahoda can’t publish video yet.',
    }
  }

  if ((format === 'story' || format === 'thread') && !channelOffers(spec, format)) {
    return {
      code: 'FORMAT_UNSUPPORTED',
      message:
        format === 'story'
          ? `${channel} has no stories.`
          : `${channel} posts don’t chain into a thread.`,
    }
  }

  if (format === 'carousel' && !acceptsMultipleMedia(spec)) {
    // Restored: my own rewrite of this file dropped it, and without it a gbp
    // carousel still refused — but as "gbp allows 1 media items", which is a
    // sentence about a file count rather than about the kind of post the writer
    // chose. Derived from `maxMediaCount`, so a channel that one day carries
    // more than one image stops being refused on its own.
    return {
      code: 'FORMAT_UNSUPPORTED',
      message: `${channel} takes one photo per post, so there is no set to swipe through.`,
    }
  }

  if (format === 'text' && !acceptsTextOnly(spec)) {
    // Instagram. The engine already says this through `requiresMedia`; stating it
    // against the DECLARED format catches it at the point the writer chose, with
    // a sentence about their choice rather than about a missing file.
    return {
      code: 'FORMAT_NEEDS_MEDIA',
      message: `${channel} has no text-only post. This one needs at least one photo.`,
    }
  }

  // ── THE COUNT, AGAINST THE FORMAT'S OWN RULE ────────────────────────────────
  // One resolved rule, so the media well's ceiling and this refusal cannot
  // disagree — `mediaRuleFor` folds the channel's `maxMediaCount` in.
  const rule = mediaRuleFor(spec, format)

  if (mediaCount < rule.minItems) {
    if (rule.minItems === 1) {
      return {
        code: 'FORMAT_NEEDS_MEDIA',
        message:
          format === 'story'
            ? 'A story is a picture. This one has none attached.'
            : 'This was written as a photo post but has no image attached.',
      }
    }
    return { code: 'FORMAT_NEEDS_MEDIA', message: 'A set needs at least two images.' }
  }

  if (mediaCount > rule.maxItems) {
    if (rule.maxItems === 0) {
      // The mirror of the missing photo, and the one nothing else can see: the
      // media is legal on this channel, so the Constraint Engine is content.
      return {
        code: 'FORMAT_CONTRADICTED',
        message: `This was written as a text-only post but has ${mediaCount === 1 ? 'an image' : 'images'} attached.`,
      }
    }
    if (format === 'image' || format === 'story') {
      return {
        code: 'FORMAT_CONTRADICTED',
        message: `This was written as a single photo but has ${mediaCount} attached. Choose a set instead.`,
      }
    }
    // The engine's own sentence for this code, deliberately word for word, so
    // apps/web's message allowlist recognises it as the shape it already knows.
    // Its "allows 1 media items" plural is repaired by `presentViolation` on the
    // way to the screen; `packages/shared` is frozen and cannot be edited.
    return {
      code: 'MAX_MEDIA_COUNT',
      message: `${channel} allows ${rule.maxItems} media items.`,
    }
  }

  return null
}

/** One attachment, as much of it as the browser or the sniffer could establish. */
export interface FormatAttachment {
  width?: number
  height?: number
}

/**
 * Why this FILE cannot be part of a version in this format, or null.
 *
 * Separate from `refuseFormat` because it runs somewhere else: at attach time,
 * where the pixel dimensions exist, which is where FSD §3.1 puts media
 * validation. `refuseFormat` runs at publish time, where they do not.
 *
 * An unknown dimension is not a failure — it is an unknown, and refusing on it
 * would block a perfectly good file because a sniff came back short.
 */
export function refuseFormatMedia(
  spec: PlatformSpec,
  format: PostFormat | null | undefined,
  media: FormatAttachment,
): FormatRefusal | null {
  if (format === null || format === undefined) return null
  const rule = mediaRuleFor(spec, format)
  if (rule.maxAspect === undefined) return null
  const { width, height } = media
  if (width === undefined || height === undefined || height <= 0) return null

  const aspect = width / height
  if (aspect <= rule.maxAspect) return null

  // Same rule as above: no channel name mid-sentence. "A instagram story" was
  // wrong twice over — the article and the case — and it rendered exactly like that.
  return {
    code: 'FORMAT_MEDIA_ASPECT',
    message: `A story is taller than it is wide. This photo is ${aspect.toFixed(2)}:1. Crop it upright, or post it to the feed instead.`,
  }
}
