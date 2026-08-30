import { z } from 'zod'

/**
 * WHAT A GENERATION IS, AS A CONTRACT.
 *
 * The Studio asks a model for an image. This file is the shape of that request,
 * of what conditioned it, and of what came back. It is the SOURCE OF TRUTH: the
 * migration stores `brand_signals` as unvalidated `jsonb` precisely because
 * Postgres cannot express a list of tagged records cheaply, so the shape is
 * enforced here instead and nowhere else.
 *
 * Pure: no I/O, no clock, no database, no React.
 */

/**
 * The four modes, and each means something different about how the prompt was
 * built rather than being a preference somebody sets.
 *
 *   on_brand  full Brand Brain conditioning plus the workspace's approved
 *             reference images. The default, and the one that needs a brain.
 *   explore   loose, high variation, cheap model. For finding a direction
 *             BEFORE spending on a finish, which is the whole economic argument
 *             for having two tiers at all.
 *   match     conditioned on one existing image the person picked: a past post,
 *             an upload, an earlier generation. This is how a business builds a
 *             look over time rather than a folder of unrelated pictures.
 *   series    N slides with consistency locked across them. The carousel.
 */
export const GENERATION_MODES = ['on_brand', 'explore', 'match', 'edit', 'series'] as const
export const GenerationModeSchema = z.enum(GENERATION_MODES)
export type GenerationMode = z.infer<typeof GenerationModeSchema>

/**
 * Where a generation has got to.
 *
 * ── THERE IS DELIBERATELY NO 'partial' ──────────────────────────────────────
 * `ready` means AT LEAST ONE picture arrived and is in the library. How many
 * were asked for is already on the row (`requested_count`) and how many arrived
 * is countable from the child rows, so partialness is a FACT the data carries
 * rather than a status word, and the screen states it in a sentence that names
 * both numbers.
 *
 * ── AND WHY THAT IS RIGHT FOR OPTIONS AND WOULD BE WRONG FOR A SET ──────────
 * Three of four OPTIONS is a usable result: they were never meant to relate to
 * each other, the person picks one, and marking it `failed` would hide three
 * pictures they paid for and can use. Three of five SLIDES is not a usable
 * result, because a carousel with two slides missing cannot be posted, and
 * calling that `ready` would be a claim the row cannot support.
 *
 * The distinction is the mode's, not the status's. Today only options ship;
 * `series` is refused outright rather than faked (`lib/studio/modes.ts`), so no
 * row can currently be a partial SET. When a model that draws a whole set in one
 * call is routed, that mode settles its own partial as `failed`, and this
 * comment is where to come back to.
 */
export const GENERATION_STATUSES = ['queued', 'running', 'ready', 'failed', 'cancelled'] as const
export const GenerationStatusSchema = z.enum(GENERATION_STATUSES)
export type GenerationStatus = z.infer<typeof GenerationStatusSchema>

/** Settled means finished in one way or another, and a settled row must carry a finish time. */
export function isSettled(status: GenerationStatus): boolean {
  return status === 'ready' || status === 'failed' || status === 'cancelled'
}

/** Still owed an answer. What the queue polls for, and what a person is waiting on. */
export function isPending(status: GenerationStatus): boolean {
  return !isSettled(status)
}

/**
 * DRAFT OR FINISH, AND THIS IS NOT THE MESH'S `ModelTier`.
 *
 * `ModelTierSchema` in `enums.ts` is the Model Mesh's ROUTING tier, five deep:
 * nano, economy, standard, premium, research. That is an engineering decision
 * about which model answers a call.
 *
 * This is the PRODUCT decision a person makes, and it has exactly two values,
 * because a shop owner is choosing between "I am still looking for the idea" and
 * "this is the one". Collapsing the two concepts would mean either exposing five
 * engineering tiers on a screen, or losing the ability to record what somebody
 * actually chose. An image tier MAPS ONTO a mesh tier; it is not one.
 *
 * The reason it exists at all is cost. Most generations are thrown away, so
 * paying finish prices to discover a direction is wrong is the single largest
 * avoidable spend in this feature. It is RECORDED on every row rather than
 * derived from the model id, because the routing table changes monthly and a row
 * must still be able to say which tier it was after its rule has gone.
 */
export const IMAGE_TIERS = ['draft', 'finish'] as const
export const ImageTierSchema = z.enum(IMAGE_TIERS)
export type ImageTier = z.infer<typeof ImageTierSchema>

/**
 * ONE BRAND FACT THAT CONDITIONED A GENERATION, AND HOW SURE WE WERE OF IT.
 *
 * ── WHY THE CERTAINTY IS PART OF THE RECORD AND NOT A DISPLAY DETAIL ────────
 * A picture built from facts the customer confirmed is not the same artefact as
 * one built partly from something Sahoda guessed, and the screen is required to
 * say which. Storing the field NAMES without their certainty makes that
 * distinction unrecoverable afterwards: the brain's certainty can change, so
 * reading it back from the brain's CURRENT state would answer a different
 * question from the one asked.
 *
 * ── AND A FIELD THAT WAS EMPTY IS ABSENT, NEVER GUESSED ─────────────────────
 * There is no third certainty for "we made this up". A brand fact Sahoda does
 * not hold does not appear in this list and does not appear in the prompt.
 * `value` is what was actually folded in, so the answer to "why does it look
 * like this" is the text itself rather than a field name a reader has to go and
 * look up.
 */
export const BrandSignalSchema = z.object({
  /** The Brand Brain field, e.g. `palette`, `voice`, `audience`, `industry`. */
  field: z.string().min(1).max(64),
  /**
   * `confirmed` the customer agreed to this exact value. `guessed` Sahoda
   * worked it out.
   *
   * These two words and no others, because they are the ones the rest of the
   * product already uses: `provenanceOf` yields them, `CertaintyMark` renders
   * them as a solid tick against a dashed sparkle, and a MISSING entry is
   * `guessed` rather than unknown. A third word for the same idea is how one
   * concept ends up with two names on two screens.
   */
  certainty: z.enum(['confirmed', 'guessed']),
  /** What was actually put into the prompt for that field. */
  value: z.string().max(2000),
})
export type BrandSignal = z.infer<typeof BrandSignalSchema>

/**
 * The signals as stored.
 *
 * An EMPTY ARRAY and NULL are different answers and every reader must keep them
 * apart: empty means no brand signal was used, which is exactly right for
 * Explore mode; null means conditioning never ran, which is what a row that
 * failed early looks like. A screen that renders both as "no brand signals"
 * would tell an Explore user their brain was broken.
 */
export const BrandSignalsSchema = z.array(BrandSignalSchema).max(64)

/** How many of the signals were confirmed, and how many were guesses. */
export function countCertainty(signals: readonly BrandSignal[]): {
  confirmed: number
  inferred: number
} {
  let confirmed = 0
  for (const signal of signals) if (signal.certainty === 'confirmed') confirmed += 1
  return { confirmed, inferred: signals.length - confirmed }
}

/**
 * The cap on one press.
 *
 * Twenty is the schema's ceiling, not the product's: what a person may actually
 * ask for comes from the Constraint Engine's `maxMediaCount` for the channel
 * they picked, which is lower and differs per platform. This number exists so a
 * malformed request cannot ask for a thousand images and spend a thousand
 * images' worth of credits.
 */
export const MAX_IMAGES_PER_GENERATION = 20
