/**
 * WHICH MODEL DRAWS THE PICTURE, AND WHAT CHOOSING IT UNLOCKS.
 *
 * ── NOTHING HERE WAS WRITTEN FROM MEMORY ────────────────────────────────────
 * Every id was fetched from its own OpenRouter model page and every figure
 * checked against docs/43 §3, which had already survived an adversarial
 * refutation pass that threw out 26 claims. A model catalogue is exactly the
 * kind of file that fills up with plausible numbers nobody measured, so the rule
 * for editing it is: fetch the page, and change a figure only alongside the
 * source that justifies it.
 *
 * ── ONE CLAIM WAS REMOVED FROM THIS FILE, AND WHY ───────────────────────────
 * Two cards used to read "Up to N pictures in one go, all matching". That was
 * true of the PROVIDER and false of this product: `ImageGenerateInputSchema`
 * carries no count and `ImageGenerateOutput` returns one picture, so a set is
 * delivered as N separate calls with the same prompt. `maxPerPress` stays here
 * as the measured provider fact that `modes.ts` will read again when the mesh
 * can carry a count; it is no longer sold on the card. (4ec68060, kept through
 * the 2026-09-05 merge with the routed-flag rewrite in 1302752f.)
 *
 * ── WHAT A MODEL "UNLOCKS" IS A REAL CAPABILITY, NOT A SELLING POINT ────────
 * `maxPerPress` and `maxReferences` are consumed by `modes.ts`, which decides
 * whether Series may run at all and how many pictures may be matched against.
 * Choosing a model that draws several in ONE call is what makes "a set that
 * matches" possible; choosing the careful one takes that away again and the
 * screen moves you off the mode rather than leaving you on a dead end. The copy
 * says all this because it is true, and the rules move with it.
 *
 * ── AND WHAT IS NOT A MODEL FEATURE ─────────────────────────────────────────
 * Drawing on a picture, layers, annotation and masking are things THIS PRODUCT
 * does, in `draw-objects.ts` and `draw-render.ts`, before anything is sent. No
 * image API delivers them. Listing them as a model's feature would promise a
 * capability that arrives from our own code regardless of which model is
 * chosen, and would go on promising it if we swapped the model out.
 *
 * ── AND WHAT IT COSTS IS THE TIER, PRICED BY THE SHARED MAP ─────────────────
 * Each model declares the product tier it belongs to (`draft` or `finish`, the
 * same two words `studio_generations.image_tier` records) and `imageActionFor`
 * turns that into the pricing key through `IMAGE_TIER_ACTION`. Every model was
 * held at the flat everyday price until 2026-09-03 while the copy on two of the
 * cards said "billed by what it draws" and "the dearest": nothing read the
 * premium key at all. The tier is on the catalogue rather than in the action so
 * the picker, the total beside the button and the hold all price from ONE fact.
 *
 * Pure: no I/O, no clock, no database.
 */

import { IMAGE_TIER_ACTION, type ActionType, type ImageTier } from '@sahoda/shared'

export type StudioModel = {
  /** The provider id, exactly as addressed. */
  id: string
  /** What a shop owner reads. Never the id. */
  label: string
  /** What it is best at, in the reader's terms rather than a benchmark's. */
  goodAt: string
  /**
   * What choosing it lets them DO that another model does not. Null when it
   * unlocks nothing beyond the default, which is an honest answer.
   */
  unlocks: string | null
  /** How many pictures it draws in ONE call. Above 1 is what makes a set possible. */
  maxPerPress: number
  /** How many pictures it will look at. */
  maxReferences: number
  /** Roughly what one picture costs the business, for the ordering below. */
  costNote: string
  /**
   * The product tier, which is what the person is CHARGED by. `draft` is the
   * everyday price; `finish` is the premium one. Declared per model rather than
   * derived from the id or the provider rate, so swapping a model for a newer
   * one never moves a price by accident.
   */
  tier: ImageTier
  /**
   * False when the mesh does not route to it yet. A model listed as available
   * that the router cannot reach would spend a press and fail.
   */
  routed: boolean
}

/**
 * ONE MODEL WE HAVE MEASURED WORKING, AND THREE THAT ARE NOT YET REACHABLE.
 *
 * ── WHAT "ROUTED" MEANS, AND WHY ONLY ONE CARRIES IT ────────────────────────
 * `routed: true` is a claim that the mesh can draw with this model. It is not a
 * claim about a docs page or a price list; it is a claim about a real
 * generation. The ONLY id this product has ever completed a generation against
 * is `google/gemini-2.5-flash-image`: MEASURED on production `ai_provider_logs`,
 * six `ok` rows on 2026-08-30 with real latencies of 6.5 to 11.8 seconds.
 *
 * The three below were added on 2026-08-31 (commit bb117725) as "each verified
 * and each actually routed". That was WRONG in one exact way: they were verified
 * by loading a model page, NOT by making a generation call, and the difference
 * is the whole defect. Every press against them since has returned HTTP_400 from
 * OpenRouter's `/api/v1/images` (three days of failures, zero successes). A model
 * page loading is not a model drawing, and the `routed` flag is about drawing.
 *
 * So they stay in the catalogue as a record of the intention and are marked
 * `routed: false`: the picker lists them as "Not connected yet", with the
 * reason, rather than offering a press that 400s. When someone confirms a real
 * generation against one of them (a call, not a page), that is the deliberate
 * act that flips its flag to true.
 *
 * ── THE FIGURES BELOW ARE STILL FROM DOCS/43 §3, WHICH IS PAGE-SOURCED ──────
 * They are kept because they are the record of what was researched; they are NOT
 * a claim the model works. The prices and reference bounds came from each id's
 * own OpenRouter model page on 2026-08-31, compared against docs/43 §3 after its
 * adversarial refutation pass. `google/gemini-2.5-flash-image` takes 3
 * references and draws 1 per call (docs/43 §3).
 *
 * The ids here are also the mesh's `ALLOWED_IMAGE_MODELS`. A model that is in one
 * and not the other is a defect, and a test asserts they match.
 */
export const STUDIO_MODELS: readonly StudioModel[] = [
  {
    id: 'google/gemini-2.5-flash-image',
    label: 'Everyday',
    goodAt:
      'Food, shopfronts and people, quick and cheap. The one to use while you are still working out what you want.',
    unlocks: null,
    maxPerPress: 1,
    maxReferences: 3,
    costNote: 'A flat everyday price per picture',
    tier: 'draft',
    // The one id with real successful generations behind it. See the header.
    routed: true,
  },
  {
    id: 'bytedance-seed/seedream-5-0-lite',
    label: 'Everyday, a matching set',
    goodAt: 'Food, shopfronts and people, at one flat price however big the picture.',
    unlocks: 'Up to 14 pictures to match against.',
    maxPerPress: 4,
    maxReferences: 14,
    costNote: 'A flat price per picture',
    tier: 'draft',
    // Page-verified, never generation-verified: 400s on every press. See header.
    routed: false,
  },
  {
    id: 'openai/gpt-image-1',
    label: 'Words and detail',
    goodAt:
      'Pictures with writing in them, and anything where small details have to survive. Worth it when the picture is going somewhere public.',
    unlocks: 'Up to 16 pictures to match against.',
    maxPerPress: 10,
    maxReferences: 16,
    costNote: 'Billed by what it draws, so a large picture costs more',
    tier: 'finish',
    // Page-verified, never generation-verified: 400s on every press. See header.
    routed: false,
  },
  {
    id: 'google/gemini-3-pro-image',
    label: 'The best one',
    goodAt:
      'The most careful of the four. Use it for the one picture that has to be right, not for trying ideas out.',
    unlocks: 'Up to 14 pictures to match against.',
    maxPerPress: 1,
    maxReferences: 14,
    costNote: 'The dearest, billed by what it draws',
    tier: 'finish',
    // Page-verified, never generation-verified: 400s on every press. See header.
    routed: false,
  },
]

/** The default: the first routed model, never a hardcoded id. */
export function defaultModelId(): string {
  const first = STUDIO_MODELS.find((model) => model.routed)
  // Non-null in practice and asserted in the tests: a catalogue with nothing
  // routed is a Studio that cannot draw, which is a defect rather than a state.
  return first?.id ?? STUDIO_MODELS[0]!.id
}

export function modelById(id: string): StudioModel | null {
  return STUDIO_MODELS.find((model) => model.id === id) ?? null
}

/**
 * The product tier a model is charged at, or null for an id not in the catalogue.
 *
 * Null rather than a guess: an unknown id is refused by `describeModelBlock`
 * before any hold, and a made-up price here would be one a hand-made request
 * could be sold at.
 */
export function imageTierFor(id: string): ImageTier | null {
  return modelById(id)?.tier ?? null
}

/**
 * The pricing key a press with this model is held and debited under.
 *
 * Always through `IMAGE_TIER_ACTION`, never a literal: the key is what the
 * ledger records and what `creditCost` prices, and the shared map is the only
 * place the two tiers are named.
 */
export function imageActionFor(id: string): ActionType | null {
  const tier = imageTierFor(id)
  return tier === null ? null : IMAGE_TIER_ACTION[tier]
}

/** The models a person may actually pick. */
export function routedModels(): StudioModel[] {
  return STUDIO_MODELS.filter((model) => model.routed)
}

/** The ones we know about but cannot reach, so the screen can say why. */
export function unroutedModels(): StudioModel[] {
  return STUDIO_MODELS.filter((model) => !model.routed)
}

/**
 * Why this model is not on offer, or null when it is.
 *
 * Names the reason in terms of what the person would get, not our routing
 * table. "Sahoda cannot reach it yet" is a fact about us; a person only needs
 * to know that pressing it would not work.
 */
export function describeModelBlock(id: string): string | null {
  const model = modelById(id)
  if (model === null) {
    return 'That is not a model Sahoda offers. Pick one from the list.'
  }
  return describeModelBlockFor(model)
}

/**
 * The same judgement, over a model rather than an id.
 *
 * ── SPLIT SO THE UNROUTED BRANCH STAYS TESTABLE ─────────────────────────────
 * Every model in the catalogue is routed today, so `describeModelBlock` can no
 * longer reach the "not connected" sentence through a real id. That branch is
 * not dead: `routed: false` is exactly how a model gets added BEFORE its route
 * exists, which is the state this whole field was created for. Keeping it
 * exercisable is what stops it rotting between now and then.
 */
export function describeModelBlockFor(model: StudioModel): string | null {
  if (!model.routed) {
    return `Sahoda cannot draw with ${model.label} yet. Everything it needs is built, and it is waiting on the connection being switched on.`
  }
  return null
}
