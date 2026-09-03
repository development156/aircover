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

/**
 * WHY A GENERATED PICTURE DOES OR DOES NOT CARRY THE WORKSPACE'S LOGO.
 *
 * ── THE COLUMN ALONE CANNOT ANSWER THIS, AND THE MIGRATION SAYS SO ──────────
 * `studio_generation_images.stamped_asset_id` is a pointer, so its NULL is a
 * single fact — no stamped copy exists — standing in for several different
 * situations. That migration's own step 4 spells them out and forbids the copy
 * from conflating them, and then leaves the screen no way to tell them apart.
 * This is that way: the reason is recorded WHEN THE STAMPING RAN, beside the
 * pointer, in the same append-only insert.
 *
 * ── WHY IT IS NOT DERIVED AT READ TIME ──────────────────────────────────────
 * Every alternative asks a question about the past by looking at the present.
 * "The workspace has no logo" is true NOW; it says nothing about what was true
 * when a picture was drawn last week, and a shop that uploaded a logo yesterday
 * would have every older picture re-explained as though the logo had been there
 * all along. Same shape as `BrandSignalSchema` above: the record stores what was
 * actually done, because the source can change afterwards.
 *
 * ── FOUR VALUES, AND A FIFTH STATE THAT IS THE ABSENCE OF ONE ───────────────
 * NULL is not in this enum and is not an error: it means stamping was never
 * attempted, which is true of every row written before this shipped and of any
 * deploy where the column is not yet applied. A screen that rendered that as a
 * failure would tell somebody something went wrong with a picture that predates
 * the feature.
 *
 * `failed` deliberately covers more than one internal cause — a mark that would
 * not fit, bytes that would not encode, an upload that did not land. They are
 * one value because they are one SENTENCE to a reader: nothing they can do
 * changes any of them, and splitting a code a person cannot act on invents a
 * distinction no screen can honour. `no_logo` and `logo_unreadable` are separate
 * for the opposite reason: their remedies differ, and offering the wrong one is
 * the impossible remedy this product forbids.
 */
export const StampOutcomeSchema = z.enum([
  /** A stamped copy exists. `stamped_asset_id` names it. */
  'stamped',
  /** The workspace had no logo to stamp. Remedy: add one. */
  'no_logo',
  /** A logo file exists and Sahoda could not read it. Remedy: replace it. */
  'logo_unreadable',
  /** Stamping ran and did not produce a stored copy. No remedy the reader owns. */
  'failed',
  /**
   * The customer turned the stamp off for this press.
   *
   * ── WHY THIS IS NOT NULL ────────────────────────────────────────────────
   * A deliberate skip and a picture drawn before stamping existed are both
   * "no stamping happened", and they are not the same sentence: one is a
   * choice the reader made a minute ago and the other is a fact about when
   * the product shipped. Writing NULL for a skip would have the screen tell
   * somebody "made before Sahoda placed logos" about a picture they drew
   * today with the toggle off, which is simply false.
   *
   * NULL keeps its meaning and gains nothing: never attempted, by us.
   */
  'skipped',
])
export type StampOutcome = z.infer<typeof StampOutcomeSchema>

/**
 * WHAT A CUSTOMER MAY CHOOSE ABOUT THE MARK ON ONE PRESS, AS ONE CONTRACT.
 *
 * ── WHY THREE FIELDS AND NOT MORE ───────────────────────────────────────────
 * Where it sits, how big it is, and whether it happens at all. Nothing else
 * about the mark is a customer decision: the plate colour is derived from the
 * workspace's own Brand Skin (`stamp-generated.ts`), and the clear-space ratio
 * and contrast floor are house rules, not a per-press preference.
 *
 * ── WHY `sizeStep` IS THREE NAMED VALUES AND NOT A SLIDER ───────────────────
 * A slider invites a number nobody can judge by looking at it: "17%" means
 * nothing until it is rendered, and by then the press has already been made.
 * Three words a person can hold in their head — small, medium, large — beat a
 * control that needs a preview to mean anything. `medium` is deliberately the
 * exact share this product shipped with before any of this existed
 * (`MARK_HEIGHT_SHARE` in `logo-placement.ts`), so choosing nothing reproduces
 * today's picture exactly.
 *
 * ── DEFAULTS REPRODUCE TODAY'S BEHAVIOUR, ON PURPOSE ────────────────────────
 * `enabled: true`, `anchor: 'bottom-right'`, `sizeStep: 'medium'` is the mark
 * every picture has carried since stamping shipped. A request that omits
 * `stamp` altogether, or sends `{}`, gets exactly that: an old caller, a
 * client built before this contract existed, or a hand-made request all draw
 * the same picture they always did.
 *
 * ── WHY `anchor` IS NOT SOURCED FROM `logo-placement.ts` ────────────────────
 * That file is geometry, in `apps/web`, and this package may not depend on an
 * app. The four values are declared here as the STUDIO's own vocabulary for a
 * corner; `logo-placement.ts`'s own `Anchor` type carries the identical four
 * strings for the same reason `GenerationMode` and the mesh's task names are
 * kept as plain string literals on both sides of a package boundary — the
 * literal values are the contract, not a shared TypeScript type.
 */
export const STAMP_ANCHORS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const
export const StampAnchorSchema = z.enum(STAMP_ANCHORS)
export type StampAnchor = z.infer<typeof StampAnchorSchema>

/**
 * `medium` is today's fixed 14% of the canvas's shorter edge, unchanged.
 * `small` and `large` are new. See `logo-placement.ts` for the exact shares
 * and for why neither the width cap nor the height cap changes behaviour as a
 * result of adding them.
 */
export const STAMP_SIZE_STEPS = ['small', 'medium', 'large'] as const
export const StampSizeStepSchema = z.enum(STAMP_SIZE_STEPS)
export type StampSizeStep = z.infer<typeof StampSizeStepSchema>

/**
 * Per-field defaults, not a top-level default on the object: `{}`, `{ enabled:
 * false }` and a request that never mentions `stamp` at all must all validate
 * to a complete, sensible options record rather than only the last of the
 * three.
 */
export const StampOptionsSchema = z.object({
  /** Whether a stamped copy is produced at all. Off never changes what is charged. */
  enabled: z.boolean().default(true),
  anchor: StampAnchorSchema.default('bottom-right'),
  sizeStep: StampSizeStepSchema.default('medium'),
})
export type StampOptions = z.infer<typeof StampOptionsSchema>

/** Exactly today's behaviour, as a value: on, bottom-right, medium (14%). */
export const DEFAULT_STAMP_OPTIONS: StampOptions = StampOptionsSchema.parse({})
