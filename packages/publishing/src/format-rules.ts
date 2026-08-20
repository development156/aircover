import type { Channel, PlatformSpec } from '@sahoda/shared'

import { type PostFormat } from './format-vocabulary'

/**
 * WHAT EACH FORMAT NEEDS, PER CHANNEL — the rules that make a format real.
 *
 * ── WHY THIS IS A SEPARATE FILE FROM THE VOCABULARY ──────────────────────────
 * `format-vocabulary.ts` holds the strings the database column accepts and
 * nothing else, so a migration and a type can be checked against each other
 * without dragging in the rules. This file is everything a format MEANS.
 *
 * Both are leaves: the only import is a TYPE from `@sahoda/shared`. That is
 * load-bearing and not stylistic — `@sahoda/publishing`'s barrel reaches
 * `oauth/x.ts`, which imports `node:crypto`, and a `'use client'` module that
 * value-imports from the barrel fails the production BUILD with
 * `UnhandledSchemeError`. It broke the 2026-08-19 deploy and `turbo build` sits
 * outside `pnpm gate`, so nothing caught it. Nothing may be added here that is
 * not a type import.
 *
 * ── DERIVED WHERE IT CAN BE, DECLARED WHERE IT CANNOT ────────────────────────
 * The shape formats — text, image, carousel, video — are DERIVED from the frozen
 * Constraint Engine's own fields (`requiresMedia`, `maxMediaCount`,
 * `mediaTypes`). A second list of "which channel takes a set" beside the engine
 * would go stale silently, and this repo has a standing rule about exactly that.
 *
 * The channel formats — story, thread — cannot be derived, and pretending
 * otherwise would be worse than declaring them. Nothing in `PlatformSpec`
 * distinguishes "Instagram has Stories" from "LinkedIn does not"; that is a fact
 * about what product a platform sells, not about media shape. So they are
 * declared, in ONE table, with the vendor field that reaches each one named
 * beside it — and `formatsFor` composes the two sources rather than replacing
 * derivation with a list.
 */

/**
 * The channel-specific formats, and the Zernio field that publishes each.
 *
 * A format may only appear here once the field beside it is actually sent. An
 * entry with no publishing behind it is the fake-success state this product
 * refuses: the writer chooses "Story", it saves, and a feed post goes out.
 */
export const CHANNEL_FORMATS: Readonly<Partial<Record<Channel, readonly PostFormat[]>>> = {
  // platformSpecificData.instagram.contentType = 'story'
  instagram: ['story'],
  // platformSpecificData.x.threadItems = [{ content, mediaItems }, …]
  x: ['thread'],
}

/** How many media items a format needs, and what shape they must be. */
export interface FormatMediaRule {
  /** Fewest items this format can publish with. */
  minItems: number
  /** Most it can carry. `null` means the channel's own `maxMediaCount` is the cap. */
  maxItems: number | null
  /**
   * Widest an image may be, as width ÷ height, when this format overrides the
   * channel's own `aspectRange`. Undefined leaves the engine's rule standing.
   */
  maxAspect?: number
  /** What the media well asks for, in the writer's words. */
  need: string
}

/**
 * The per-format media rules.
 *
 * ── `image` IS CAPPED AT ONE, AND THAT IS A REAL TIGHTENING ──────────────────
 * It reads "One photo" in the picker, so a variant declaring `image` with four
 * files attached is not a near-miss — it is a post that is not what it says it
 * is, which is the whole reason the column exists. A writer who means four
 * pictures picks the set. Nothing existing breaks: every variant written before
 * 2026-08-19 has `format: null`, and null states no intent.
 *
 * ── `story` REFUSES LANDSCAPE AND NOTHING NARROWER ───────────────────────────
 * Zernio documents the Story aspect as 9:16 (0.5625). Enforcing 0.5625 exactly
 * would refuse the 4:5 and 1:1 photos Instagram accepts and letterboxes, so the
 * rule is the one thing the documentation makes certain: a Story is not wider
 * than it is tall. `maxAspect: 1` catches the actual mistake — a feed photo
 * dropped into a Story — and refuses nothing that works.
 *
 * That band is OURS, not the vendor's, and it is deliberately loose. A detector
 * that refuses correct input is worse than the mistake it prevents.
 */
export const FORMAT_MEDIA: Readonly<Record<PostFormat, FormatMediaRule>> = {
  text: { minItems: 0, maxItems: 0, need: 'No photo — words only.' },
  image: { minItems: 1, maxItems: 1, need: 'One photo.' },
  carousel: { minItems: 2, maxItems: null, need: 'Two or more photos, in order.' },
  story: {
    minItems: 1,
    maxItems: 1,
    maxAspect: 1,
    need: 'One upright photo — 9:16 is the shape Instagram fills.',
  },
  // A thread's media rides on its segments, so the post-level pool is whatever
  // the channel allows overall and zero is perfectly normal.
  thread: { minItems: 0, maxItems: null, need: 'Photos are optional, and attach to a step.' },
  video: { minItems: 1, maxItems: 1, need: 'One video.' },
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
 *
 * Order is the order they appear in the picker: the plainest first, the
 * channel's own speciality last, because that is the one worth noticing.
 */
export function formatsFor(spec: PlatformSpec): PostFormat[] {
  const formats: PostFormat[] = []
  if (acceptsTextOnly(spec)) formats.push('text')
  formats.push('image')
  if (acceptsMultipleMedia(spec)) formats.push('carousel')
  if (acceptsVideo(spec)) formats.push('video')
  for (const extra of CHANNEL_FORMATS[spec.channel] ?? []) formats.push(extra)
  return formats
}

/**
 * The format a channel OPENS on, for a version the writer has just added.
 *
 * Derived, not tabulated: a channel that cannot publish words alone opens on a
 * single photo, and every other channel opens on words. That is the same
 * `requiresMedia` field the rest of this file reads, so a channel whose media
 * rules change carries its own default with it.
 *
 * ── AND IT IS ONLY EVER APPLIED TO A NEW CARD ────────────────────────────────
 * Never written over a stored `null`. Null means "nobody said", which is the
 * truth about every variant written before the column existed, and stamping a
 * default onto those would invent an intent the writer never expressed — on
 * rows that publishing now holds to their declared format.
 */
export function defaultFormatFor(spec: PlatformSpec): PostFormat {
  return acceptsTextOnly(spec) ? 'text' : 'image'
}

/**
 * A rule with the channel's cap already folded in, so `maxItems` is a NUMBER.
 *
 * The distinction is worth a type rather than a comment: `FormatMediaRule.maxItems`
 * is `null` for "whatever the channel allows", and every caller that compared a
 * count against it without resolving first would be comparing against nothing.
 */
export type ResolvedMediaRule = Omit<FormatMediaRule, 'maxItems'> & { maxItems: number }

/**
 * The media rule in force for this channel's version, with the channel's own cap
 * folded in.
 *
 * `maxItems: null` resolves to `spec.maxMediaCount` here rather than at the call
 * site, so the media well and the refusal cannot disagree about a set's ceiling.
 * A format whose minimum exceeds what the channel can carry is impossible, and
 * `formatsFor` never offers it — but the resolved rule still reports the truth
 * rather than an inverted range.
 */
export function mediaRuleFor(spec: PlatformSpec, format: PostFormat): ResolvedMediaRule {
  const rule = FORMAT_MEDIA[format]
  return {
    ...rule,
    maxItems:
      rule.maxItems === null ? spec.maxMediaCount : Math.min(rule.maxItems, spec.maxMediaCount),
  }
}
