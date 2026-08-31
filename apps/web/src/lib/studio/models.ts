/**
 * WHICH MODEL DRAWS THE PICTURE, AND WHAT CHOOSING IT UNLOCKS.
 *
 * ── EVERY FIGURE HERE CAME FROM docs/43 §3 ──────────────────────────────────
 * Nothing in this file was written from memory. The prices, reference ceilings
 * and `n` limits are the table in `docs/43_Image_Models.md`, fetched from
 * OpenRouter on 2026-08-29 and put through an adversarial refutation pass in
 * which 26 claims were thrown out. A model catalogue is exactly the kind of file
 * that fills up with plausible numbers nobody measured, so the rule for editing
 * it is: change a figure only in the same commit that changes docs/43, with the
 * source that justifies it.
 *
 * ── WHAT A MODEL "UNLOCKS" IS A REAL CAPABILITY, NOT A SELLING POINT ────────
 * `maxPerPress` and `maxReferences` are consumed by `modes.ts`, which decides
 * whether Series may run at all. Choosing Seedream is therefore what makes "a
 * set that matches" possible, because it is the only routed model that draws
 * more than one picture in a single call. The copy says that because it is
 * true, and the rules move with it.
 *
 * ── AND WHAT IS NOT A MODEL FEATURE ─────────────────────────────────────────
 * Drawing on a picture, layers, annotation and masking are things THIS PRODUCT
 * does, in `draw-objects.ts` and `draw-render.ts`, before anything is sent. No
 * image API delivers them. Listing them as a model's feature would promise a
 * capability that arrives from our own code regardless of which model is
 * chosen, and would go on promising it if we swapped the model out.
 *
 * Pure: no I/O, no clock, no database.
 */

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
   * False when the mesh does not route to it yet. A model listed as available
   * that the router cannot reach would spend a press and fail.
   */
  routed: boolean
}

/**
 * The catalogue, cheapest-first among the routed ones.
 *
 * MEASURED (`packages/mesh/src/routing.ts:104`): `IMAGE_ROUTES` reaches exactly
 * two ids today, `google/gemini-2.5-flash-image` and `openai/gpt-image-1`.
 * Everything else here is `routed: false` and says so on the screen, because
 * offering a model the router cannot address would take somebody's credits for
 * a call that cannot be made.
 */
export const STUDIO_MODELS: readonly StudioModel[] = [
  {
    id: 'google/gemini-2.5-flash-image',
    label: 'Everyday',
    goodAt:
      'Food, shopfronts and people, quickly and cheaply. This is the one to use while you are still deciding what you want.',
    unlocks: null,
    maxPerPress: 1,
    maxReferences: 3,
    costNote: 'Cheapest of the routed models',
    routed: true,
  },
  {
    id: 'openai/gpt-image-1',
    label: 'Careful',
    goodAt:
      'Pictures with words in them, and anything where small details have to survive. Slower, and worth it when the picture is going somewhere public.',
    unlocks: null,
    maxPerPress: 1,
    maxReferences: 3,
    costNote: 'Dearer than Everyday',
    routed: true,
  },
  {
    id: 'bytedance-seed/seedream-4.5',
    label: 'A matching set',
    goodAt:
      'Several pictures that belong together, drawn in one go so they actually match. This is what a carousel needs.',
    unlocks: 'Up to 10 pictures in one go, all matching, and up to 14 pictures to match against.',
    maxPerPress: 10,
    maxReferences: 14,
    costNote: '$0.04 a picture, flat',
    routed: false,
  },
  {
    id: 'bytedance-seed/seedream-5-0-lite',
    label: 'A matching set, cheaper',
    goodAt:
      'The same matching sets, for less. It takes noticeably longer, so it suits work you are not waiting on.',
    unlocks: 'Up to 4 pictures in one go, all matching, and up to 14 to match against.',
    maxPerPress: 4,
    maxReferences: 14,
    costNote: '$0.035 a picture, flat',
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
  if (!model.routed) {
    return `Sahoda cannot draw with ${model.label} yet. Everything it needs is built, and it is waiting on the connection being switched on.`
  }
  return null
}
