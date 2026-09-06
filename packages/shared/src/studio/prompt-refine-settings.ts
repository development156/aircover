import { z } from 'zod'

import { GenerationModeSchema } from './generation'
import { StampAnchorSchema } from './generation'
import { REFERENCE_FOLLOW_STEPS } from './generation'
import { LEAVE_OUT_MAX_CHARS } from './generation'

/**
 * WHAT THE PROMPT REFINER MAY KNOW ABOUT THE CONTROLS, WITHOUT NAMING ONE.
 *
 * Founder's ruling, 2026-09-06: `studio_prompt_refine` must compose FOR the
 * screen's own settings, not merely rewrite the words typed in isolation from
 * them. His example is the logo: if the stamp is on, the refined prompt should
 * know that.
 *
 * ── THE DISTINCTION THE WHOLE FILE TURNS ON ─────────────────────────────────
 * Knowing a setting and RESTATING one are different acts. `mesh/prompt-refine.ts`
 * already forbids the model from naming a ratio, a pixel size, a count, a model
 * or the logo, because the screen sends those as real parameters and a prompt
 * that repeats one can contradict it. That rule is untouched. What changes is
 * that the model now sees enough about the SHAPE of the request to compose
 * toward it without ever saying the setting's name.
 *
 * ── WHY EACH FIELD HERE AND NOT THE RAW CONTROL VALUE ───────────────────────
 *   shape          Never the exact ratio or the pixel size, both of which the
 *                  strip in `mesh/prompt-refine.ts` exists to remove from the
 *                  model's ANSWER. Only whether the canvas draws taller,
 *                  wider or square, which is all a diffusion model needs to
 *                  compose the right kind of headroom.
 *   stampEnabled / stampAnchor
 *                  Whether a corner should stay calm and uncluttered, and
 *                  which corner. Never "logo", never "watermark": the model
 *                  is told to leave space, not to draw a mark.
 *   mode / hasReference
 *                  Whether this is a fresh scene or a variation on a picture
 *                  already attached, and whether Explore's own looseness
 *                  applies. Never the reference image itself, which the model
 *                  is never shown by this task.
 *   excludeText    The same free text `LeaveOutSchema` already carries,
 *                  folded into the guidance so the refiner can weave it into
 *                  one sentence instead of leaving a bolted-on clause that
 *                  would duplicate what `conditionPrompt` appends downstream.
 *   referenceFollow
 *                  How closely to match a reference, in the model's own
 *                  words, never the control's name. Meaningless without a
 *                  reference, so it is only ever honoured when
 *                  `hasReference` is true; a caller with no reference picked
 *                  must not send anything other than `undefined` here, the
 *                  same rule `ReferenceFollowSchema`'s own header states.
 *
 * Pure: no I/O, no clock, no database.
 */

/**
 * The shape a canvas draws as, never the ratio or the pixel size.
 *
 * `shapeFromDimensions` below is how every caller derives this, from the
 * SAME width and height the format picker already resolved, so the value
 * that reaches the model can never disagree with the canvas actually chosen.
 */
export const PROMPT_REFINE_SHAPES = ['square', 'tall', 'wide'] as const
export const PromptRefineShapeSchema = z.enum(PROMPT_REFINE_SHAPES)
export type PromptRefineShape = z.infer<typeof PromptRefineShapeSchema>

/**
 * A canvas exactly as wide as it is tall reads as `square`. Otherwise the
 * longer side decides. No tolerance band: a caller that wants "close enough
 * to square" to count as square would be inventing a threshold this module
 * has no basis to choose, and the four current presets never need one
 * (`packages/shared/src/studio/presets.ts` offers no near-square shape).
 */
export function shapeFromDimensions(width: number, height: number): PromptRefineShape {
  if (width === height) return 'square'
  return height > width ? 'tall' : 'wide'
}

export const PromptRefineSettingsSchema = z.object({
  mode: GenerationModeSchema,
  shape: PromptRefineShapeSchema,
  /** Whether a reference picture is attached to this press, for this mode. */
  hasReference: z.boolean(),
  stampEnabled: z.boolean(),
  stampAnchor: StampAnchorSchema,
  /** Same bound as `LeaveOutSchema`. Absent means nothing was excluded. */
  excludeText: z.string().trim().min(1).max(LEAVE_OUT_MAX_CHARS).optional(),
  /**
   * Deliberately NOT `ReferenceFollowSchema`: that schema defaults to
   * `'balanced'` on `undefined`, which would turn "no reference picked, so
   * nothing was sent" into a value. This stays a plain optional enum so
   * `undefined` means exactly what the caller sent: nothing.
   */
  referenceFollow: z.enum(REFERENCE_FOLLOW_STEPS).optional(),
})
export type PromptRefineSettings = z.infer<typeof PromptRefineSettingsSchema>
