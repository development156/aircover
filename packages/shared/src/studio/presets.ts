import type { Channel } from '../enums'
import type { ConstraintViolation, MediaAttachment } from '../publishing/constraints'
import { CONSTRAINTS, validateMedia } from '../publishing/constraints'

/**
 * THE CANVAS SIZES THE STUDIO OFFERS, AND THE ONE THING THAT JUDGES THEM.
 *
 * ── THE CONSTRAINT ENGINE CANNOT PRODUCE A CANVAS SIZE, AND THE PLAN SAID IT COULD ──
 * The build spec for this feature says the presets "should be driven from"
 * `imageDims` "so they stay in sync with publishing rules". MEASURED, that is
 * not possible, and building it that way would have produced a 4x4 pixel
 * Instagram post:
 *
 *   x         imageDims { minW: 4,   minH: 4 }                    a floor of FOUR PIXELS
 *   gbp       imageDims { minW: 250, minH: 250 }                  a floor
 *   instagram imageDims { minW: 320, minH: 320, aspect .75-1.91 } a floor and a range
 *   linkedin  no imageDims at all
 *   facebook  no imageDims at all
 *   telegram  no imageDims at all
 *
 * `imageDims` is a FLOOR plus, on one channel, an aspect RANGE. Three of six
 * channels declare nothing. A floor cannot be turned into a target: every one of
 * those numbers is the smallest thing the platform will accept, not the size a
 * post should be. So the relationship is inverted here, and the inversion is the
 * whole design of this file.
 *
 * **The studio declares the sizes. The Constraint Engine is the judge.** Every
 * preset below names the channels it is offered for, and `presets.test.ts` puts
 * each one through `validateMedia` twice over: once to prove every channel it
 * claims accepts it, and once to prove every channel it does NOT claim would
 * have refused it. The second half is what stops this table drifting into a list
 * of arbitrary opinions. A channel cannot be quietly left off a preset that
 * would have worked, because the test demands a violation as the reason.
 *
 * ── AND THIS IS NOT THE THING `lib/media/targets.ts` FORBIDS ────────────────
 * That module states the rule this file has to answer to: "writing one here,
 * 1080x1080 for a feed post, 1200x628 for LinkedIn, would be this module
 * inventing the very thing it exists to read". Those exact numbers are below,
 * so the difference has to be written down rather than assumed.
 *
 * `targets.ts` CROPS A PHOTOGRAPH THAT ALREADY EXISTS. Its objection is stated
 * in its next sentence: cutting to invented numbers "would refuse photos the
 * engine accepts and accept photos it refuses". A size used as a JUDGE destroys
 * pixels the band would have kept, so it takes the band and cuts to the nearest
 * edge of it.
 *
 * A studio canvas is a different situation: THE CANVAS ITSELF HAS NO ORIGINAL.
 * A blank canvas cannot be a band, because a band is not a thing you can draw
 * on. Some width and some height have to be chosen before a single pixel
 * exists, and no contract anywhere contains them.
 *
 * That is a narrower defence than it first appears, and the narrowing matters. A
 * design can CONTAIN a customer's photograph, and `svg.ts` draws an image node
 * with `preserveAspectRatio="xMidYMid slice"`, which crops. So a photo dropped
 * into a 1080x1350 design IS cut to fit a number chosen here. The distinction
 * that survives is about which number is the JUDGE: `targets.ts` objects to a
 * folklore size deciding whether a photo is acceptable, and no size in this file
 * ever decides that. A design's own frame cropping a picture inside it is a
 * composition, and the exported result still faces `validateMedia` unchanged.
 *
 * So the numbers below are a STARTING POINT, never a verdict. Nothing in this
 * file refuses anything, nothing here is compared against a customer's image,
 * and no crop is cut to these values. The moment a design becomes bytes, the
 * question "will this channel take it?" goes to `validateMedia` exactly as it
 * does for an uploaded photo. `targets.ts` remains the only module allowed to
 * answer what shape an EXISTING picture should be cut to.
 *
 * ── NO LIMIT IS RESTATED IN THE CODE ────────────────────────────────────────
 * No executable line below reads a floor, an aspect range or a byte cap out of
 * anything but `CONSTRAINTS` itself. There is no second table of minimum widths
 * and no duplicated cap that could fall out of step, because there is no copy
 * for anything to fall out of step WITH: everything about what a platform will
 * accept is read back out of the engine at the moment it is asked.
 *
 * The engine's numbers DO appear a few lines above, in the block explaining why
 * a floor cannot become a canvas size. That is prose, and prose can go stale
 * without changing behaviour. It is written out because the argument is
 * unreadable without it, and it is worth knowing that it is the one part of
 * this file no test is checking.
 *
 * Pure: no I/O, no clock, no database.
 */

/** A canvas the studio can open. Sizes are pixels at 1x, before any export scaling. */
export interface StudioPreset {
  id: string
  /** What a person sees in the picker. Sentence case, verb-free, no channel jargon. */
  label: string
  width: number
  height: number
  /**
   * The channels this size is OFFERED for.
   *
   * Offered is narrower than accepted, and deliberately so. A 9:16 story is
   * legal on LinkedIn as far as the engine is concerned, because LinkedIn
   * declares no dimensions at all, but a full-height phone story in a LinkedIn
   * feed is not a thing anyone wants. Where this list is shorter than what the
   * engine permits, the reason is written next to the preset rather than left
   * for a reader to guess. Where it is shorter because the engine REFUSES, the
   * test proves the refusal.
   */
  channels: readonly Channel[]
}

/**
 * The sizes, and why each one exists.
 *
 * ── 1200x628 IS NOT ON INSTAGRAM, AND IT MISSES BY 0.0008 ───────────────────
 * 1200/628 is 1.9108. Instagram's feed range tops out at 1.91, MEASURED against
 * the vendor's own validator at the boundary (see `constraints.ts`). So the link
 * card is refused by Instagram, by less than a thousandth of a ratio. It is the
 * single most useful row in this table: it is the one that proves the check
 * below is a real check and not a formality, and `presets.test.ts` asserts that
 * exact violation by name.
 *
 * ── THE STORY PRESET LEAVES INSTAGRAM OFF, AND THAT IS A NARROWER CLAIM THAN
 *    IT LOOKS ───────────────────────────────────────────────────────────────
 * 1080/1920 is 0.5625, well under the 0.75 floor, so `validateMedia` refuses it
 * and the test below proves that refusal.
 *
 * But `validateMedia` only ever models the FEED rule. The real attach path does
 * not stop there: `FORMAT_MEDIA.story` in `@sahoda/publishing` declares its own
 * `maxAspect`, and `decideAttach` DROPS the engine's `MEDIA_ASPECT` violation
 * when a format rule is in force. MEASURED against Zernio's own validator, a
 * story carries no aspect check at all, and 1080x1920 publishes.
 *
 * So the honest statement is: **Instagram does not accept this size as a feed
 * post.** Whether it can go out as a story is a question this file cannot
 * answer, because the format rules live in a package `@sahoda/shared` cannot
 * import without a cycle. That path is `decideAttach`, and a session wiring the
 * studio to stories should go through it rather than widening the list here.
 */
export const STUDIO_PRESETS: readonly StudioPreset[] = [
  {
    id: 'square',
    label: 'Square post',
    width: 1080,
    height: 1080,
    channels: ['instagram', 'facebook', 'x', 'linkedin', 'telegram', 'gbp'],
  },
  {
    id: 'portrait',
    label: 'Tall post',
    width: 1080,
    height: 1350,
    channels: ['instagram', 'facebook', 'linkedin', 'x', 'telegram'],
  },
  {
    id: 'story',
    label: 'Story',
    width: 1080,
    height: 1920,
    // Not linkedin and not gbp: legal by the engine, wrong by the product.
    channels: ['facebook', 'telegram', 'x'],
  },
  {
    id: 'wide',
    label: 'Wide post',
    width: 1600,
    height: 900,
    // gbp is here because the test demanded it be here or be excused: a Google
    // Business post shows a landscape picture without cropping it, so there was
    // no honest reason to leave the channel off.
    channels: ['x', 'linkedin', 'facebook', 'telegram', 'instagram', 'gbp'],
  },
  {
    id: 'link-card',
    label: 'Link card',
    width: 1200,
    height: 628,
    // instagram refuses this one at 1.9108 against a 1.91 ceiling.
    channels: ['facebook', 'linkedin', 'x', 'telegram'],
  },
  {
    id: 'business-update',
    label: 'Business update',
    width: 1200,
    height: 900,
    channels: ['gbp', 'facebook', 'linkedin', 'x', 'telegram', 'instagram'],
  },
] as const

/** The preset with this id, or null. Null rather than a throw: an unknown id arrives from a stored row. */
export function presetById(id: string): StudioPreset | null {
  return STUDIO_PRESETS.find((preset) => preset.id === id) ?? null
}

/** Every preset offered for a channel, in table order. */
export function presetsForChannel(channel: Channel): StudioPreset[] {
  return STUDIO_PRESETS.filter((preset) => preset.channels.includes(channel))
}

/** One channel's answer about one rendered image. */
export interface ChannelFit {
  channel: Channel
  violations: ConstraintViolation[]
}

/**
 * Ask the Constraint Engine what each channel makes of a rendered design.
 *
 * This is a THIN pass-through and it is meant to stay thin. It builds the
 * `MediaAttachment` the engine already understands and hands back the engine's
 * own verdicts, messages and codes untouched. Nothing here decides anything: if
 * a limit changes in `constraints.ts`, this function changes its answer without
 * being edited, which is the entire reason it does no thinking of its own.
 *
 * `bytes` is the size of the file that will actually be uploaded, so this must
 * be called AFTER rendering rather than on the preset alone. A 1080x1350 PNG can
 * pass every dimension rule and still be refused by X for weighing more than 5
 * MB, and a check run before the bytes exist would have called that one green.
 */
export function fitDesignToChannels(
  render: { width: number; height: number; mime: string; bytes: number },
  channels: readonly Channel[],
): ChannelFit[] {
  const specs = channels.map((channel) => CONSTRAINTS[channel])
  const media: MediaAttachment = {
    mime: render.mime,
    bytes: render.bytes,
    width: render.width,
    height: render.height,
  }
  return validateMedia(specs, media)
}

/** What a design's export means for the channels it was checked against. */
export type ChannelFitSummary =
  | { kind: 'nothing-checked' }
  | { kind: 'all-accepted' }
  | { kind: 'refused'; refusals: { channel: Channel; reasons: string[] }[] }

/**
 * Sort the engine's verdicts into the three answers a screen can act on.
 *
 * ── THE THREE ANSWERS ARE DIFFERENT FACTS, NOT ONE HEDGED ONE ───────────────
 * "Nobody was asked", "everybody accepts it" and "two of five refuse it" are
 * three separate things, and a screen that blurs them is worse than one that
 * says nothing. An empty list means nobody asked, which must never be printed
 * as an all-clear.
 *
 * ── AND THIS RETURNS DATA, NOT A SENTENCE, FOR TWO MEASURED REASONS ─────────
 * The first version built the sentence here and got both halves wrong.
 *
 * It named EVERY refusing channel and then appended `refused[0]`'s first
 * violation message as though it explained all of them. Two channels refusing
 * for different reasons, an aspect problem on one and a byte cap on the other,
 * produced a sentence that was true of the first and false of the second, and
 * gave the reader a remedy that could not fix what they were looking at. This
 * codebase has a rule against exactly that.
 *
 * It also wrote the raw enum key into prose, so a customer read "gbp" rather
 * than "Google Business". `@sahoda/shared` cannot know display names: the
 * exhaustive `CHANNEL_LABELS` lives in `apps/web`, which imports this package
 * and not the other way round. Sorting the verdicts here and letting the screen
 * that owns the labels write the sentence is the only arrangement where neither
 * half has to guess.
 *
 * Each refusal carries ITS OWN reasons, so a per-channel line can never quote
 * another channel's problem.
 */
export function summariseChannelFit(fits: readonly ChannelFit[]): ChannelFitSummary {
  if (fits.length === 0) return { kind: 'nothing-checked' }
  const refusals = fits
    .filter((fit) => fit.violations.length > 0)
    .map((fit) => ({
      channel: fit.channel,
      reasons: fit.violations.map((violation) => violation.message),
    }))
  if (refusals.length === 0) return { kind: 'all-accepted' }
  return { kind: 'refused', refusals }
}
