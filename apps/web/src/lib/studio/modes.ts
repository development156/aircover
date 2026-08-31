import type { GenerationMode } from '@sahoda/shared'

import { defaultModelId, modelById, type StudioModel } from './models'

/**
 * WHAT EACH MODE NEEDS BEFORE IT CAN SPEND ANYTHING.
 *
 * ── WHY THIS IS A MODULE AND NOT FOUR `if`s IN A COMPONENT ──────────────────
 * Every rule here decides whether credits leave somebody's wallet, and the
 * SCREEN and the ACTION must agree about all of them. A screen that offers a
 * mode the action refuses charges nothing and wastes a press; a screen that
 * hides a mode the action allows costs a feature. One module, asked by both.
 *
 * ── AND ONE MODE IS DELIBERATELY NOT OFFERED YET ────────────────────────────
 * `series` means N slides that BELONG TOGETHER, and the only honest way to make
 * them is a model that generates the whole set in one call with consistency
 * locked. MEASURED (docs/43 §3): the model this product routes to today,
 * `google/gemini-2.5-flash-image`, reports `max n = 1`. Seedream 4.5 reports 10
 * and is on OpenRouter, but nothing routes to it yet.
 *
 * So Series is REPORTED AS NOT READY rather than faked with N separate calls.
 * N calls would cost N times as much and produce N unrelated pictures, which is
 * the opposite of what the word promises. A carousel is one call, and until the
 * routing does that, saying so is the honest answer.
 *
 * Pure: no I/O, no clock, no database.
 */

export type ModeRule = {
  mode: GenerationMode
  label: string
  /** What a shop owner gets, in their terms. Never a description of the mechanism. */
  what: string
  /** How many reference pictures this mode needs at least. */
  minReferences: number
  /** How many it can use at most, bounded by the model. */
  maxReferences: number
  /** False when the product cannot honestly deliver it yet. */
  ready: boolean
}

/**
 * The most references ANY model in the catalogue will look at.
 *
 * ── THIS IS AN OUTER BOUND, NOT THE ONE A PERSON MEETS ──────────────────────
 * The bound that applies to a given press is the CHOSEN MODEL's, and it is much
 * lower on the everyday one: MEASURED at OpenRouter's capability endpoint,
 * 14 on Gemini 3 Pro and Seedream 5.0 Lite, 16 on GPT Image 1 (each fetched
 * from its own OpenRouter model page, 2026-08-31). `ruleFor` applies that, and
 * the screen shows it.
 *
 * What this constant is for is the SCHEMA, which validates a request before any
 * model has been resolved and must therefore refuse only what no model could
 * accept. A hand-made request for a hundred references is refused here; one for
 * eight is refused later, by the rule, with a sentence naming the model.
 */
export const MAX_REFERENCES = 16

/**
 * What a mode wants, before the model has its say.
 *
 * `MODEL_DECIDES` means "as many as the model will take". A mode that says 1
 * means ONE whatever the model could accept, because an edit is a change to a
 * specific picture and three sources leave the model choosing which.
 */
const MODEL_DECIDES = MAX_REFERENCES

/**
 * How many pictures one press may ask for.
 *
 * ── WHY FOUR, AND WHY IT IS NOT THE DATABASE'S CEILING ──────────────────────
 * A model draws what it was asked for, not what was meant, and the ordinary way
 * to find the picture you wanted is to see several and pick. One at a time makes
 * that a chore; unlimited makes it expensive without anybody noticing.
 *
 * Four is the product's bound, deliberately lower than `MAX_IMAGES_PER_GENERATION`
 * (20), which is what the TABLE will hold. Four at the standard price is already
 * twenty-four credits on a single press, and the screen names that total before
 * anything is spent.
 *
 * ── AND THESE ARE FOUR TRIES, NOT A SET ─────────────────────────────────────
 * The routed model reports max n = 1, so four pictures are four separate calls
 * and will NOT match each other. That is exactly what "show me some options"
 * means and exactly what "a set that matches" does not, which is why one is
 * offered here and the other is refused in `MODE_RULES`.
 */
export const MAX_TRIES_PER_PRESS = 4

export const MODE_RULES: readonly ModeRule[] = [
  {
    mode: 'on_brand',
    label: 'On brand',
    what: 'Uses what Sahoda knows about your business, so the picture looks like you.',
    minReferences: 0,
    maxReferences: MODEL_DECIDES,
    ready: true,
  },
  {
    mode: 'explore',
    label: 'Explore',
    what: 'Ignores your brand on purpose, to find a direction before you commit to one.',
    minReferences: 0,
    maxReferences: 0,
    ready: true,
  },
  {
    mode: 'match',
    label: 'Match a picture',
    what: 'Pick a picture you already have and get more in the same style. This is how a business builds a look.',
    minReferences: 1,
    maxReferences: MODEL_DECIDES,
    ready: true,
  },
  {
    mode: 'edit',
    label: 'Change a picture',
    what: 'Start from a picture you already have and change one thing about it, keeping the rest.',
    minReferences: 1,
    // ONE, not three. An edit is a change to a specific picture, and handing a
    // model three sources leaves it to decide which one it is editing. Match
    // takes three because blending several looks is the point there; here it
    // would be a different feature wearing this one's label.
    maxReferences: 1,
    ready: true,
  },
  {
    mode: 'series',
    label: 'A set that matches',
    what: 'Several slides that belong together, for a carousel.',
    minReferences: 0,
    maxReferences: MODEL_DECIDES,
    // Overridden by `ruleFor`: a model that draws the whole set in one call
    // makes this true. See that function's header.
    ready: false,
  },
]

/**
 * The base rule for a mode, before any model is taken into account.
 *
 * Callers almost always want `ruleFor`, which applies the chosen model. This is
 * exported for the tests that pin the vocabulary itself.
 */
export function baseRuleFor(mode: GenerationMode): ModeRule {
  return MODE_RULES.find((rule) => rule.mode === mode) ?? MODE_RULES[0]!
}

/**
 * ── THE MODEL DECIDES WHAT A MODE CAN DO ──────────────────────────────────
 * `series` was refused outright because the routed model draws ONE picture per
 * call, and N separate calls cost N times as much and produce N unrelated
 * pictures. That was never a fact about the mode; it was a fact about the
 * model. So choosing a model that draws a whole set in one go is what makes a
 * matching set possible, and this function is where that becomes true rather
 * than a sentence somebody wrote.
 *
 * The reference ceiling moves the same way: 3 on the everyday model, 14 on
 * Seedream. Both come from `models.ts`, which took them from docs/43.
 */
export function ruleFor(mode: GenerationMode, modelId: string = defaultModelId()): ModeRule {
  const base = baseRuleFor(mode)
  const model = modelById(modelId)
  if (model === null) return base

  return {
    ...base,
    // A set needs a model that draws the whole set in ONE call. Anything else
    // is N unrelated pictures wearing the word "set".
    ready: base.mode === 'series' ? model.maxPerPress > 1 : base.ready,
    // Never above what the model will look at, and never above what the mode
    // wants: an edit takes one reference whatever the model could accept.
    maxReferences: Math.min(base.maxReferences, model.maxReferences),
  }
}

/** The modes a person may actually choose, for the model they have chosen. */
export function readyModes(modelId: string = defaultModelId()): ModeRule[] {
  return MODE_RULES.map((rule) => ruleFor(rule.mode, modelId)).filter((rule) => rule.ready)
}

/**
 * Why this request cannot be sent, or null when it can.
 *
 * ── EVERY SENTENCE NAMES THE FIX ────────────────────────────────────────────
 * A refusal a person cannot act on is a dead end, and this product forbids
 * those. "Pick a picture to match" tells somebody what to do; "invalid request"
 * tells them they are stuck.
 */
export function describeModeBlock(input: {
  mode: GenerationMode
  references: number
  modelId?: string
}): string | null {
  const rule = ruleFor(input.mode, input.modelId)

  if (!rule.ready) {
    return 'A set that matches needs a model that draws every slide in one go, so the slides belong together. The model you have chosen draws one at a time, and making a set that way would cost more and give you pictures that do not match. Choose a model that makes a matching set.'
  }

  if (input.references < rule.minReferences) {
    return rule.minReferences === 1
      ? input.mode === 'edit'
        ? 'Pick the picture you want changed, then this is ready.'
        : 'Pick one picture for Sahoda to match, then this is ready.'
      : `Pick at least ${rule.minReferences} pictures for Sahoda to match.`
  }

  if (input.references > rule.maxReferences) {
    return rule.maxReferences === 0
      ? 'Explore does not use a picture to match. Switch to Match a picture, or take these off.'
      : rule.maxReferences === 1
        ? 'Sahoda changes one picture at a time. Keep the one you want changed and take the others off.'
        : `Sahoda can look at ${rule.maxReferences} pictures at once. Take ${
            input.references - rule.maxReferences
          } off and try again.`
  }

  return null
}

/**
 * What to put in the box, for the mode that is chosen.
 *
 * ── A BOX WHOSE LABEL NEVER CHANGES TEACHES ONE THING ───────────────────────
 * The mode buttons above change what the box is FOR. On brand wants a subject.
 * Explore wants a direction. Match wants what to keep and what to change about
 * a picture already chosen. One fixed sentence about samosas answers the first
 * and misleads the other three, and the cost of that is somebody typing the
 * wrong kind of prompt and paying for the result.
 */
export function promptHintFor(mode: GenerationMode): string {
  switch (mode) {
    case 'explore':
      return 'A drink that feels like a Sunday morning'
    case 'match':
      return 'The same look, but a cup of chai instead'
    case 'edit':
      return 'Make the background a plain wall'
    case 'series':
      // A set is described as a set. Prompting for one picture and getting four
      // is how somebody ends up with four near-identical slides.
      return 'Three steps of making chai, one per slide'
    case 'on_brand':
      return 'A plate of fresh samosas on a wooden counter, morning light'
  }
}
