import type { PlatformSpec } from '@sahoda/shared'

/**
 * What KIND of post a channel version is meant to be, and whether the channel can
 * actually publish it.
 *
 * ── WHY THIS LIVES HERE AND NOT IN @sahoda/shared ────────────────────────────
 * The Constraint Engine is the natural home and it is a frozen contract, so the
 * format dimension cannot be added to `PlatformSpec`. Everything below is
 * therefore DERIVED from the fields the spec already has — `mediaTypes`,
 * `requiresMedia`, `maxMediaCount` — rather than restating rules beside them.
 *
 * That is not merely a workaround; it is the more honest shape. If the frozen
 * contract ever gains a video mime, `video` stops being refused here on its own,
 * with no second list to remember. A hardcoded "video is impossible" would go on
 * refusing a format the engine had started to allow.
 *
 * ── WHAT A FORMAT IS FOR ─────────────────────────────────────────────────────
 * It is a DECLARATION OF INTENT that publishing enforces. Today a writer who
 * meant a photo post and attached nothing publishes text and is told it worked;
 * a writer who meant text-only and left a stray image attached publishes the
 * image. Neither is caught anywhere, because nothing records what was intended.
 *
 * ── AND IT IS A LEAF, WHICH IS LOAD-BEARING ─────────────────────────────────
 * `@sahoda/publishing/format` is exported as its own entry point so a BROWSER
 * bundle can reach these rules without reaching the package barrel. The barrel
 * pulls `oauth/x.ts`, which imports `node:crypto`; a client component that
 * value-imports from it fails the production build with
 * `UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins`.
 *
 * That is not hypothetical — it broke the 2026-08-19 deploy, and nothing caught
 * it, because `turbo build` sits OUTSIDE `pnpm gate`. A type-only import from the
 * barrel is erased and harmless, which is why the inbox has done it for months;
 * a value import is not. `no-client-barrel.test.ts` now fails on the value form.
 *
 * So the only import here is a TYPE, and nothing may be added to this file that
 * is not.
 *
 * Pure: no I/O, no clock, no database.
 */

/** The four values `post_variants.format` accepts (migration 20260819000200). */
export const POST_FORMATS = ['text', 'image', 'carousel', 'video'] as const
export type PostFormat = (typeof POST_FORMATS)[number]

export function isPostFormat(value: unknown): value is PostFormat {
  return typeof value === 'string' && (POST_FORMATS as readonly string[]).includes(value)
}

/** A refusal, in the shape `runPublishPost` already fails with. */
export interface FormatRefusal {
  code: string
  message: string
}

/** Does this channel declare any moving-image mime at all? Read, never assumed. */
export function acceptsVideo(spec: PlatformSpec): boolean {
  return spec.mediaTypes.some((mime) => mime.startsWith('video/'))
}

/** Can this channel publish a post with no media? */
export function acceptsTextOnly(spec: PlatformSpec): boolean {
  return spec.requiresMedia !== true
}

/** Can this channel carry more than one media item? */
export function acceptsMultipleMedia(spec: PlatformSpec): boolean {
  return spec.maxMediaCount > 1
}

/**
 * Which formats this channel can genuinely publish today.
 *
 * Offered to the writer, so a format that cannot go out is never a choice rather
 * than a choice that fails later. A picker that accepts an answer publishing will
 * refuse is the fake-success state this product refuses to ship.
 */
export function formatsFor(spec: PlatformSpec): PostFormat[] {
  const formats: PostFormat[] = []
  if (acceptsTextOnly(spec)) formats.push('text')
  formats.push('image')
  if (acceptsMultipleMedia(spec)) formats.push('carousel')
  if (acceptsVideo(spec)) formats.push('video')
  return formats
}

/**
 * Why this channel cannot publish this variant as the format it declares, or null.
 *
 * `null` FORMAT RETURNS NULL, and that is the whole compatibility story: every
 * variant written before migration 20260819000200 has no format, and none of them
 * changes behaviour. Only a variant that states an intent is held to it.
 */
export function refuseFormat(
  spec: PlatformSpec,
  format: PostFormat | null | undefined,
  mediaCount: number,
): FormatRefusal | null {
  if (format === null || format === undefined) return null

  const channel = spec.channel

  if (format === 'video' && !acceptsVideo(spec)) {
    // Derived: no `video/*` in this channel's mediaTypes. Every channel is in that
    // position today, which is why the picker keeps video as coming-soon — but the
    // refusal reads the contract rather than repeating that fact.
    return {
      code: 'FORMAT_UNSUPPORTED',
      message: `Sahoda can’t publish video to ${channel} yet.`,
    }
  }

  if (format === 'carousel' && !acceptsMultipleMedia(spec)) {
    return {
      code: 'FORMAT_UNSUPPORTED',
      message: `${channel} takes one image per post, so there is no set to swipe through.`,
    }
  }

  if (format === 'text' && !acceptsTextOnly(spec)) {
    // Instagram. The engine already says this through `requiresMedia`; stating it
    // against the DECLARED format catches it at the point the writer chose, with
    // a sentence about their choice rather than about a missing file.
    return {
      code: 'FORMAT_NEEDS_MEDIA',
      message: `${channel} has no text-only post — this one needs at least one photo.`,
    }
  }

  // ── THE TWO CONTRADICTIONS, WHICH ARE THE POINT ─────────────────────────────
  // Nothing else in the pipeline can see these. The Constraint Engine checks the
  // media against the channel; only the format says what the WRITER meant, so only
  // this can notice that the post about to go out is not the post they described.
  if (format === 'text' && mediaCount > 0) {
    return {
      code: 'FORMAT_CONTRADICTED',
      message: `This was written as a text-only post but has ${mediaCount === 1 ? 'an image' : 'images'} attached.`,
    }
  }

  if ((format === 'image' || format === 'carousel') && mediaCount === 0) {
    return {
      code: 'FORMAT_NEEDS_MEDIA',
      message: 'This was written as a photo post but has no image attached.',
    }
  }

  if (format === 'carousel' && mediaCount < 2) {
    return {
      code: 'FORMAT_NEEDS_MEDIA',
      message: 'A set needs at least two images.',
    }
  }

  return null
}
