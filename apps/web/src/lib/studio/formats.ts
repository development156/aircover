import {
  CONSTRAINTS,
  ChannelSchema,
  STUDIO_PRESETS,
  presetById,
  type Channel,
  type StudioPreset,
} from '@sahoda/shared'

/**
 * WHAT SIZE CAN THE STUDIO ACTUALLY MAKE, AND FOR WHICH CHANNEL.
 *
 * ── THE RULE THIS FILE EXISTS TO KEEP ───────────────────────────────────────
 * A format the product cannot publish is not offered. That sounds obvious and is
 * easy to break, because the tempting way to build a size picker is to type six
 * plausible dimensions into an array. This codebase forbids that in writing:
 * `imageDims` in the Constraint Engine is a FLOOR (x's is four pixels by four)
 * plus, on instagram alone, an aspect BAND. A floor cannot be turned into a
 * target, and inventing "1080x1080 for a feed post" is named as a defect in
 * `lib/media/targets.ts`.
 *
 * So nothing here invents a number. `STUDIO_PRESETS` is the vocabulary, it
 * already declares which channels each size is OFFERED for, and `presets.test.ts`
 * already puts every one of them through the engine's own `validateMedia`. This
 * module only chooses among them.
 *
 * ── AND THE SECOND HALF, WHICH IS NEW ───────────────────────────────────────
 * A format the MODEL cannot draw is also not offered. Until this lane widened
 * `ImageGenerateInputSchema` to take exact dimensions, the mesh knew three
 * aspect ratios: 1.0, 0.8 and 1.25. Three of the six presets match none of them,
 * so asking for a story would have returned a landscape picture with nothing
 * saying so. `canGenerate` is where that judgement lives, in one place, so it
 * cannot drift between the picker and the action that spends the credits.
 *
 * Pure: no I/O, no clock, no database.
 */

/** A size the Studio offers, and the channels it is offered for. */
export type StudioFormat = {
  id: string
  label: string
  width: number
  height: number
  channels: readonly Channel[]
  /** Long side over short side, for a picker that groups shapes. */
  aspect: number
}

/**
 * The provider bounds the mesh will accept, mirrored from
 * `ImageGenerateInputSchema.dims`. Mirrored rather than imported because this is
 * a REFUSAL the picker makes before spending, and a picker that silently offered
 * a size the mesh would reject would charge for a call that cannot succeed.
 */
export const GENERATABLE_MIN = 512
export const GENERATABLE_MAX = 2048

/**
 * Can a model be asked for this canvas at all?
 *
 * The honest half of the picker. A preset outside the provider's bounds is not
 * offered for GENERATION even though it remains perfectly publishable for an
 * upload, and the two are different questions that a single "is it allowed"
 * flag would conflate.
 */
export function canGenerate(preset: { width: number; height: number }): boolean {
  const within = (n: number) => n >= GENERATABLE_MIN && n <= GENERATABLE_MAX
  return within(preset.width) && within(preset.height)
}

function toFormat(preset: StudioPreset): StudioFormat {
  const long = Math.max(preset.width, preset.height)
  const short = Math.min(preset.width, preset.height)
  return {
    id: preset.id,
    label: preset.label,
    width: preset.width,
    height: preset.height,
    channels: preset.channels,
    // Rounded to three places so two canvases that are the same shape compare
    // equal. 1080/1350 and 1024/1280 are both 0.8 and a picker should not treat
    // them as different shapes because of floating point.
    aspect: Math.round((short / long) * 1000) / 1000,
  }
}

/**
 * Every size the Studio can generate, in preset order.
 *
 * Preset order rather than sorted: the presets are declared in the order a
 * person meets them, squares first, and re-sorting by size would put the least
 * used one at the top.
 */
export function generatableFormats(): StudioFormat[] {
  return STUDIO_PRESETS.filter(canGenerate).map(toFormat)
}

/**
 * The sizes offered for one channel.
 *
 * `channels` on a preset is OFFERED, which is deliberately narrower than what
 * the engine permits: a 9:16 story is legal on LinkedIn only because LinkedIn
 * declares no dimensions at all, and a full-height phone story in a LinkedIn
 * feed is not a thing anybody wants. This function honours that narrowing and
 * does not second-guess it.
 */
export function formatsForChannel(channel: Channel): StudioFormat[] {
  return generatableFormats().filter((format) => format.channels.includes(channel))
}

/** The channels that can actually publish, in the engine's own order. */
export function publishableChannels(): Channel[] {
  return ChannelSchema.options.filter((channel) => CONSTRAINTS[channel].publishable)
}

/**
 * One format by id, or null.
 *
 * Null for a size Sahoda no longer offers AND for one it offers but cannot
 * generate, and the caller has to keep those apart in its copy: the first is
 * "that size is gone", the second is "we cannot draw that shape yet". Both are
 * honest, and neither is "something went wrong".
 */
export function formatById(id: string): StudioFormat | null {
  const preset = presetById(id)
  if (preset === null) return null
  return canGenerate(preset) ? toFormat(preset) : null
}

/**
 * Is this format publishable on this channel, asked of the engine rather than
 * of the preset's own list?
 *
 * The preset's `channels` is a product choice about what to OFFER. This is the
 * engine's answer about what is PERMITTED, and they are allowed to differ in one
 * direction only: offered must be a subset of permitted. `formats.test.ts`
 * asserts that direction, so a preset that starts offering a channel the engine
 * would refuse fails the build rather than a customer's post.
 */
export function channelPermits(channel: Channel, format: StudioFormat): boolean {
  const spec = CONSTRAINTS[channel]
  if (!spec.publishable) return false
  const dims = spec.imageDims
  if (dims === undefined) return true
  if (format.width < dims.minW || format.height < dims.minH) return false
  if (dims.aspectRange === undefined) return true
  const ratio = format.width / format.height
  return ratio >= dims.aspectRange[0] && ratio <= dims.aspectRange[1]
}
