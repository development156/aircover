import type { BrandSignal, GenerationMode, ReferenceFollow } from '@sahoda/shared'

/**
 * BUILDING THE PROMPT FROM THE BRAND BRAIN, AND SAYING WHICH PARTS WERE GUESSES.
 *
 * The person writes what they want. The Studio supplies who they are. That is
 * the whole differentiator, and it is only worth anything if it is honest about
 * where each fact came from.
 *
 * ── WHAT THE BRAIN ACTUALLY HOLDS, WHICH IS NOT WHAT YOU WOULD ASSUME ───────
 * MEASURED by reading `brand_memory.payload` and its schema. The brain is six
 * sections: voice, brand_persona, customer_persona, hook, taboo, alignment.
 *
 *   · THERE IS NO PALETTE IN THE BRAIN. Colour lives in a different table,
 *     `workspace_themes.tokens`, and it carries NO per-field certainty at all:
 *     `source` is 'default' | 'extracted' | 'manual' at ROW level. So a colour
 *     guessed from a logo's pixels and one the owner chose are indistinguishable
 *     per token. A palette signal therefore takes its certainty from that row
 *     source and never claims more than the row can support.
 *   · THERE IS NO INDUSTRY FIELD. What a reader would call industry is the
 *     `regime` / `business_model` / `locale` triple on `workspaces`.
 *   · THERE IS NO WRITING-STYLE FIELD. What the home rail labels "Writing style"
 *     is `voice.formality_label`.
 *
 * Three of the five fields the brief names as Brand Brain fields are not in the
 * brain. Building this module from the brief rather than from the schema would
 * have produced a prompt that reads four empty strings and says nothing, while
 * every screen reported the conditioning as working.
 *
 * ── AND THE TWO CERTAINTIES ARE `confirmed` AND `guessed` ───────────────────
 * Not "inferred". `provenanceOf` yields `'confirmed' | 'guessed'`, `CertaintyMark`
 * renders exactly those two, and a MISSING entry is `guessed` rather than
 * unknown. Introducing a third word for the same idea is how one concept ends up
 * with two names on two screens.
 *
 * ── NEVER INVENT A BRAND FACT ───────────────────────────────────────────────
 * An empty field is ABSENT from the prompt. It is not filled with something
 * plausible, and there is no third certainty meaning "we made this up". A brand
 * Sahoda knows little about produces a shorter prompt and says so, which is the
 * honest failure mode and the one that makes a person go and fill their brain in.
 *
 * Pure: no I/O, no clock, no database.
 */

/** What a caller hands in, already read from the brain and the theme. */
export type ConditioningInput = {
  mode: GenerationMode
  /** What the person typed. Never rewritten, only surrounded. */
  wanted: string
  /**
   * Brand facts already resolved to text, each with the certainty the SOURCE can
   * actually support. The caller resolves these because only it can read the
   * brain; this module decides what to do with them.
   */
  signals: readonly BrandSignal[]
  /**
   * A few words describing what the picture should not show, already trimmed.
   * Absent or empty adds nothing. See `LeaveOutSchema`'s own header: this is
   * prompt-level guidance appended to what is SENT, never a rewrite of what
   * the customer typed.
   */
  excludeText?: string
  /**
   * How closely to follow the reference images. `undefined` and `'balanced'`
   * behave identically: neither adds anything, because "balanced" is already
   * what every mode's own direction asks for. The CALLER decides whether this
   * is meaningful at all (a request with no reference picked must not pass
   * anything other than the default) — this function trusts what it is given.
   */
  referenceFollow?: ReferenceFollow
  /**
   * True exactly when `wanted` is a refined prompt that already weaves the
   * brand into its own sentence, so the `Brand context:` block below must not
   * repeat it.
   *
   * ── WHY THIS IS THE CALLER'S CALL, NOT SOMETHING GUESSED HERE ─────────────
   * `conditionPrompt` cannot tell a refined sentence from a plain one by
   * reading `wanted` alone. `studio_prompt_refine` already folds the same
   * `signalsFor(mode, signals)` this function would otherwise append as a
   * list, so appending it again would say the brand twice: once as prose,
   * once as a bibliography stapled underneath. The caller (the composer's own
   * refine control, then the server action) is the only thing that knows
   * whether the box currently holds that refined text, so it carries the
   * fact rather than this function inferring it.
   *
   * Absent and `false` behave identically, and every existing caller omits
   * it, which is what keeps a hand-made or pre-existing request conditioned
   * exactly as before.
   */
  brandAlreadyCarried?: boolean
}

export type Conditioned = {
  /** What goes to the model. */
  prompt: string
  /** Exactly the signals that were folded in, in the order they appear. */
  used: BrandSignal[]
}

/**
 * How loose the picture may be, per mode, in the model's own terms.
 *
 * Explore is deliberately unconditioned. That is not a downgrade: the point of
 * exploring is to see directions the brand's own descriptors would have ruled
 * out, cheaply, before committing. A mode that quietly applied full conditioning
 * would make Explore and On brand produce the same picture at two prices.
 */
/**
 * The sentence for each non-default follow step. `balanced` is deliberately
 * absent: it is the mode's own direction already and adding a line for it
 * would be the same instruction twice.
 *
 * Worded as a request to the model, not a promise to the customer — the
 * screen that shows this choice carries its own honesty caveat; this text is
 * what actually reaches the model and does not need to repeat it to a reader
 * who will never see it.
 */
const REFERENCE_FOLLOW_DIRECTION: Record<Exclude<ReferenceFollow, 'balanced'>, string> = {
  loose:
    'Use the reference images loosely, as inspiration rather than a strict guide: vary composition, framing and detail freely.',
  close:
    'Follow the reference images closely: match their composition, framing, lighting and style as closely as possible.',
}

const MODE_DIRECTION: Record<GenerationMode, string> = {
  on_brand: 'Match the brand described below exactly.',
  explore: 'Explore freely. Vary composition, colour and mood.',
  match: 'Match the style, lighting and composition of the reference images provided.',
  edit: 'Change the image provided as described. Keep everything else about it unchanged: the subject, the framing, the lighting and the background stay as they are.',
  series: 'One image in a set. Keep style, lighting and palette identical across the set.',
}

/**
 * Signals a mode is allowed to use.
 *
 * Explore uses NONE, and returning an empty array here is what makes the
 * provenance row say so truthfully. An empty array and a null mean different
 * things downstream and this function only ever produces the former.
 */
function signalsFor(mode: GenerationMode, signals: readonly BrandSignal[]): BrandSignal[] {
  if (mode === 'explore') return []
  return signals.filter((signal) => signal.value.trim() !== '')
}

/**
 * Fold the brand into the request.
 *
 * The person's own words come FIRST and are never edited. Everything the Studio
 * adds is appended and clearly separated, so a prompt read back to somebody is
 * recognisably the thing they asked for with context attached, rather than a
 * rewrite they did not authorise.
 */
export function conditionPrompt(input: ConditioningInput): Conditioned {
  const wanted = input.wanted.trim()
  const used = signalsFor(input.mode, input.signals)

  const parts = [wanted, MODE_DIRECTION[input.mode]]

  // Skipped when the sentence above already carries the brand: appending the
  // same facts as a labelled list underneath would say them twice. See
  // `brandAlreadyCarried`'s own comment on `ConditioningInput`.
  if (used.length > 0 && !input.brandAlreadyCarried) {
    parts.push(
      ['Brand context:', ...used.map((signal) => `- ${signal.field}: ${signal.value}`)].join('\n'),
    )
  }

  // "Leave out": a request, not a guarantee — see `LeaveOutSchema`'s header.
  const excludeText = input.excludeText?.trim() ?? ''
  if (excludeText !== '') {
    parts.push(`Avoid including: ${excludeText}.`)
  }

  // "Follow how closely": absent for `balanced`, which the mode direction
  // above already expresses.
  if (input.referenceFollow && input.referenceFollow !== 'balanced') {
    parts.push(REFERENCE_FOLLOW_DIRECTION[input.referenceFollow])
  }

  // Said on every generation regardless of mode, because it is a property of
  // how this product makes pictures rather than a preference: text is drawn as
  // a deterministic layer on top, never generated inside the image, so a model
  // that writes a headline into the picture produces a garbled one nobody asked
  // for. `docs/43` carries the typography reasoning.
  parts.push('Do not render any words, letters or numbers in the image.')

  return { prompt: parts.join('\n\n'), used }
}

/**
 * What to tell somebody about the conditioning, before they spend.
 *
 * Three sentences and each states a different claim, because "no brand signals"
 * would flatten them into one:
 *
 *   · Explore was ASKED to ignore the brand. Nothing is wrong.
 *   · A brain with nothing in it could not condition anything. The remedy is to
 *     fill the brain in, and the sentence says so.
 *   · Conditioning worked, and here is how much of it Sahoda is sure about.
 */
export function describeConditioning(input: {
  mode: GenerationMode
  used: readonly BrandSignal[]
}): string {
  if (input.mode === 'explore') {
    return 'Explore ignores your brand on purpose, so you can see directions before committing to one.'
  }
  if (input.used.length === 0) {
    return 'Sahoda has nothing about your brand to work from yet, so this image is built from your words alone. Filling in your Brand Brain makes every image afterwards look like you.'
  }
  const confirmed = input.used.filter((s) => s.certainty === 'confirmed').length
  const guessed = input.used.length - confirmed
  if (guessed === 0) {
    return `Built from ${confirmed} thing${confirmed === 1 ? '' : 's'} you have confirmed about your brand.`
  }
  if (confirmed === 0) {
    return `Built from ${guessed} thing${guessed === 1 ? '' : 's'} Sahoda worked out about your brand. Confirming them makes the next image more like you.`
  }
  return `Built from ${confirmed} confirmed and ${guessed} guessed thing${guessed === 1 ? '' : 's'} about your brand. Confirming the guesses makes the next image more like you.`
}

/**
 * THINGS TO TRY, FOR A BOX NOBODY KNOWS WHAT TO PUT IN.
 *
 * ── THE MEASUREMENT THAT PRODUCED THIS ──────────────────────────────────────
 * A feature nobody knows what to give stays empty. That is the Tone Setup
 * ruling, made against the Brand Brain after three documents across 33
 * workspaces, and a prompt box has exactly the same shape: a shop owner who has
 * never described a photograph to a machine does not know whether to write two
 * words or a paragraph.
 *
 * So these are not decoration. Each one demonstrates a DIFFERENT thing worth
 * knowing: that a subject plus a surface plus a light is enough, that a time of
 * day changes everything, that naming the season is allowed, that a picture of
 * nobody is often the useful one.
 *
 * They fill the box rather than generating, so nothing is spent by trying one
 * and the words can be edited first.
 *
 * Pure: no I/O, no clock, no database.
 */
/**
 * ── WHY EACH ONE CARRIES A SHORT LABEL AS WELL ──────────────────────────────
 * Five full sentences laid side by side wrap to four lines and read as a wall
 * of text above the box they are meant to fill. The label is what the chip
 * SHOWS; the sentence is what the box GETS, and the box is right there, so a
 * person sees the whole thing the moment they press one and can edit it before
 * spending anything. The label is never a different idea from the sentence: it
 * is the same subject with the light and the surface left for the box to show.
 */
export type PromptStarter = {
  /** What the chip says. Short enough that five sit on one line. */
  readonly label: string
  /** What lands in the box. The thing that actually goes to the model. */
  readonly prompt: string
}

export const PROMPT_STARTERS: readonly PromptStarter[] = [
  {
    label: 'Samosas on a counter',
    prompt: 'A plate of fresh samosas on a wooden counter, morning light',
  },
  { label: 'Shopfront at dusk', prompt: 'The shopfront at dusk with the lights just on' },
  { label: 'Wrapping an order', prompt: 'Hands wrapping an order in paper, close up' },
  { label: 'Chai by the window', prompt: 'A cup of chai beside a rain-streaked window' },
  { label: 'Festival counter', prompt: 'The counter laid out for a festival, seen from above' },
]

/**
 * BRAND-DERIVED STARTERS, FOR A WORKSPACE THE FIVE ABOVE DO NOT FIT.
 *
 * `PROMPT_STARTERS` is a food-and-shopfront workspace's five ideas, hardcoded,
 * and a software-training workspace reading "a cup of chai" is being told a
 * false thing about a photograph of a business that is not theirs. That is the
 * defect: not that the five are bad ideas, but that they ASSERT a business the
 * Brand Brain never claimed.
 *
 * ── EVERY FALLBACK PHRASE STAYS BUSINESS-TYPE-FREE ──────────────────────────
 * When a leaf is missing, the phrase used in its place ("what you make or
 * offer", "the work in progress") names no product, food, shop or location.
 * That is what keeps a partial brain from producing a HALF-invented sentence:
 * the parts that are known are named; the parts that are not stay abstract
 * rather than guessed at.
 *
 * ── SAME VOCABULARY AS THE PICTURE ITSELF, ON PURPOSE ───────────────────────
 * The four fields read here (`voice`, `character`, `what the business is`,
 * `feeling`) and the palette are exactly what `brandSignalsFor` already reads
 * to condition the picture, and what `prompt-refine.ts` reads to refine the
 * words. One vocabulary, so a starter and the refinement it might lead to can
 * never disagree about what the brand holds.
 *
 * ── NO MODEL CALL, EVER ──────────────────────────────────────────────────────
 * Every one of the five is a plain template substitution over data the caller
 * already has. Nothing here awaits a network response, so nothing here can put
 * a person's first paint behind a model's answer. The caller decides WHEN
 * `signals` gets resolved (typically wherever this app already reads the Brand
 * Brain for the same screen); this function adds no I/O of its own.
 */
export interface PromptStarters {
  starters: readonly string[]
  /** `'brand'` when at least one starter used a real brand fact; `'generic'` when nothing was available and the five sentences of PROMPT_STARTERS came back unchanged. */
  source: 'brand' | 'generic'
}

function fieldValue(signals: readonly BrandSignal[], field: string): string | undefined {
  return signals.find((s) => s.field === field)?.value
}

/**
 * Five starters, each demonstrating a different thing worth knowing about
 * describing a photograph — same five lessons `PROMPT_STARTERS` was written
 * to teach (subject-surface-light, time of day, season, no people, a close
 * detail) — built from whatever the Brand Brain actually holds.
 */
export function buildPromptStarters(signals: readonly BrandSignal[]): PromptStarters {
  // The sentences, not the chips: this builder hands back what goes in the box,
  // and the labels are the chip's concern (`PromptStarter`).
  if (signals.length === 0) {
    return { starters: PROMPT_STARTERS.map((starter) => starter.prompt), source: 'generic' }
  }

  const oneLiner = fieldValue(signals, 'what the business is')
  const character = fieldValue(signals, 'character')
  const emotion = fieldValue(signals, 'feeling')
  const colours = fieldValue(signals, 'colours')

  const subject = oneLiner ?? 'What you make or offer'
  const palette = colours ? ` In ${colours} tones.` : ''

  const starters = [
    `${subject}, set on a plain surface with soft morning light.${palette}`,
    character
      ? `Something that feels ${character.toLowerCase()}, lit at the end of the day, the lights just coming on.`
      : 'Where the work happens, right at the end of the day, the lights just coming on.',
    oneLiner
      ? `${oneLiner}, styled for the season, nothing else in the frame.`
      : 'Something seasonal from what you offer, styled simply, nothing else in the frame.',
    oneLiner
      ? `${oneLiner}, alone in the frame, quiet and well lit, nobody in the shot.`
      : 'The one thing you want people to notice, alone in the frame, nobody in the shot.',
    emotion
      ? `A close-up that feels ${emotion.toLowerCase()}: hands or tools at work, nothing posed.`
      : 'A close-up of the work in progress: hands or tools, nothing posed.',
  ]

  return { starters, source: 'brand' }
}
