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
  // platformSpecificData.instagram.contentType = 'story' — SENT, see
  // `zernio/platform-data.ts` and the wire assertion in `adapters/zernio.test.ts`.
  instagram: ['story'],
  //
  // ── `thread` IS NOW OFFERED, AND HERE IS EACH OF THE THREE REASONS IT WAS NOT ─
  // It was withheld on 2026-08-20 pending three conditions. All three are now met,
  // and none was met by relaxing the condition.
  //
  //  1. THE REFUSAL GATE CAN SEE EVERY SEGMENT — because a thread is no longer
  //     new text. It is the ONE body, split (`thread-split.ts`). Every segment is
  //     a slice of `publishedTextOf(formatForPlatform(spec, draft))`, which is
  //     exactly the string the gate already checks, so a red line in segment three
  //     was in front of the classifier all along. The covering property is
  //     asserted in `thread-split.test.ts` and the gate is shown to BLOCK on a
  //     banned line placed in the last segment in `runPublishPost.test.ts` — a
  //     guard nobody has watched fail is not a guard.
  //
  //  2. THE CHARACTER LIMIT MEANS SOMETHING — `planThread` splits at the
  //     per-segment limit, deriving X's flat link weight from the frozen engine
  //     rather than restating it. `runPublishPost` swaps the whole-body MAX_CHARS
  //     for that plan and swaps NOTHING else, so every other engine violation
  //     still stands. MEASURED: Zernio does not apply 280 per segment — a
  //     400-character segment passes their dry run (docs/32 §4.1) — so this check
  //     is the only one there is.
  //
  //  3. `threadItems[].mediaItems` IS NOT USED. It remains [SPEC]-only, and the
  //     validator accepts it without checking anything inside it (docs/32 §3), so
  //     "accepted on the wire" is all anyone can honestly claim. A thread's media
  //     therefore stays on the post, where it is already proven, and the X card
  //     says so. Shipping the unverified half was never necessary to ship threads.
  //
  // What a thread IS still carries an honest caveat: SENT, NOT YET OBSERVED
  // (docs/31 §5.4). The payload is built and handed to the client, and no thread
  // has been watched going out.
  x: ['thread'],
}

/** How many media items a format needs, and what shape they must be. */
export interface FormatMediaRule {
  /** Fewest items this format can publish with. */
  minItems: number
  /** Most it can carry. `null` means the channel's own `maxMediaCount` is the cap. */
  maxItems: number | null
  /**
   * Widest an image may be, as width ÷ height.
   *
   * ── THIS REPLACES THE CHANNEL'S OWN `aspectRange`, IT DOES NOT ADD TO IT ────
   * MEASURED, and it is the reason this field exists at all:
   * `CONSTRAINTS.instagram.imageDims.aspectRange` is `[0.75, 1.91]`, which is the
   * FEED range — and a story is 9:16, i.e. 0.5625. Stacked, the engine's rule
   * refuses the exact photo a story requires, so a story would be unattachable
   * while every message on screen said the picture was the wrong shape.
   *
   * The channel's range is therefore not a channel rule at all. It is the feed
   * FORMAT's rule, living on the channel because the frozen contract has nowhere
   * else to put it. A format that states its own aspect rule is stating the one
   * that applies, and `decideAttach` drops the engine's verdict accordingly.
   *
   * Undefined leaves the engine's rule standing, which is right for every format
   * that IS a feed post.
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
 * ── `story` REFUSES LANDSCAPE AND NOTHING NARROWER, AND THAT IS OUR RULE ─────
 * Zernio documents the Story aspect as 9:16 (0.5625). Enforcing 0.5625 exactly
 * would refuse the 4:5 and 1:1 photos Instagram accepts and letterboxes, so the
 * rule is the one thing the documentation makes certain: a Story is not wider
 * than it is tall. `maxAspect: 1` catches the actual mistake — a feed photo
 * dropped into a Story — and refuses nothing that works.
 *
 * MEASURED 2026-08-20, and it settles the vendor's half: with
 * `contentType: 'story'` Zernio's validator drops the aspect check ENTIRELY.
 * 1080×1920 (0.5625) passes, and so does 1910×1000 — landscape. So this bound
 * refuses something the vendor accepts, and it is kept anyway: a landscape photo
 * in a Story is a mistake far more often than an intention. Recorded as a PRODUCT
 * decision rather than a platform limit, because that is what it is.
 *
 * There is deliberately NO lower bound. A very tall photo is a legal story and
 * an invented floor would refuse one. That band is OURS, not the vendor's, and
 * it is loose on purpose: a detector that refuses correct input is worse than
 * the mistake it prevents.
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
  // ── A THREAD'S PHOTOS STAY ON THE POST ─────────────────────────────────────
  // `threadItems[].mediaItems` exists and is NOT used. It is [SPEC]-only, and
  // Zernio's validator accepts it while checking nothing inside it — a dead URL
  // and five images on one segment both pass (MEASURED, docs/32 §3) — so nobody
  // can honestly say X will publish it. Photos therefore ride the post-level pool,
  // which is the path already proven, and land on the first post. Zero is normal.
  thread: { minItems: 0, maxItems: null, need: 'Photos are optional, and go on the first post.' },
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
