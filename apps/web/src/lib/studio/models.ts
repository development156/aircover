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
 * THREE MODELS, ONE FOR EACH KIND OF JOB.
 *
 * The best available from each family rather than a long list: a picker with
 * eight options is a decision a shop owner cannot make, and every extra row is
 * another set of figures to keep true.
 *
 * ── EVERY FIGURE MEASURED ON OPENROUTER'S OWN MODEL PAGE, 2026-08-31 ────────
 * Each id below was fetched individually and its numbers compared against
 * docs/43 §3, which had been through an adversarial refutation pass. Where the
 * two agreed the figure is doubly sourced; where the page said something docs/43
 * had left blank, the page wins and the difference is noted.
 *
 *   google/gemini-3-pro-image
 *     $2.00/M input, $120.00/M image output. 14 references. Images per request
 *     NOT STATED on the page; docs/43 records 1 for the Gemini image family, and
 *     1 is also the safe reading, so 1 is what the rules use.
 *
 *   openai/gpt-image-1
 *     $5.00/M text input, $40.00/M image output. **10 images per request and 16
 *     references** — both were "—" in docs/43, so this is NEW and it changes the
 *     product: a matching set is no longer Seedream's alone.
 *
 *   bytedance-seed/seedream-5-0-lite
 *     $0.035 flat per image, 4 per request, 14 references. All three matched
 *     docs/43 exactly. It is the LATEST Seedream on OpenRouter: there is no
 *     `bytedance-seed/seedream-5-0`, which returns not found.
 *
 * The ids are also the mesh's `ALLOWED_IMAGE_MODELS`. A model that is in one and
 * not the other is a defect, and a test asserts they match.
 */
export const STUDIO_MODELS: readonly StudioModel[] = [
  {
    id: 'bytedance-seed/seedream-5-0-lite',
    label: 'Everyday',
    goodAt:
      'Food, shopfronts and people, at one flat price however big the picture. The one to use while you are still working out what you want.',
    unlocks: 'Up to 4 pictures in one go, all matching, and up to 14 to match against.',
    maxPerPress: 4,
    maxReferences: 14,
    costNote: 'A flat price per picture, the cheapest of the three',
    routed: true,
  },
  {
    id: 'openai/gpt-image-1',
    label: 'Words and detail',
    goodAt:
      'Pictures with writing in them, and anything where small details have to survive. Worth it when the picture is going somewhere public.',
    unlocks: 'Up to 10 pictures in one go, all matching, and up to 16 to match against.',
    maxPerPress: 10,
    maxReferences: 16,
    costNote: 'Billed by what it draws, so a large picture costs more',
    routed: true,
  },
  {
    id: 'google/gemini-3-pro-image',
    label: 'The best one',
    goodAt:
      'The most careful of the three. Use it for the one picture that has to be right, not for trying ideas out.',
    unlocks: 'Up to 14 pictures to match against.',
    maxPerPress: 1,
    maxReferences: 14,
    costNote: 'The dearest, billed by what it draws',
    routed: true,
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
