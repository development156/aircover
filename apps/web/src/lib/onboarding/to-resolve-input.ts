import { quarantineInline } from '@sahoda/research'
import { ResolveInputSchema, type ResolveInput } from '@sahoda/shared'

import { LOCALE_LABEL, MODEL_NOUN, REGIME_NOUN, type Intake } from './intake'
import { questionFor } from './question'
import { refusalToRule } from './refusal'

/**
 * Onboarding answers → the frozen `ResolveInput`.
 *
 * ── What this file refuses to do ─────────────────────────────────────────────
 *
 * `spark-to-resolve-input.ts` set the precedent and it is the right one: fields
 * the contract does not have do not get smuggled into fields that sound close.
 * Two decisions follow from that, and both cost us something:
 *
 *  1. THE DOOR TEXT DOES NOT FIT. A page or a PDF yields paragraphs, and
 *     `ResolveInput` has nowhere to put paragraphs. Only two things are taken
 *     from it, both VERBATIM and both into fields that mean what they are:
 *     the first real sentence into `source.one_liner` (which is literally a
 *     one-liner about them), and the first sentence carrying a number or a year
 *     into `brand.proof_point` (which is literally a proof point). Selecting a
 *     sentence someone wrote is honest; paraphrasing their About page into
 *     `mission` would not be. The rest of the door text is dropped, and
 *     `apps/web/REQUESTS.md` asks wt-shared for a field that can hold it.
 *
 *  2. THE REFUSAL IS NOT A LEGAL RED LINE. `taboo` offers `avoid_topics` and
 *     `legal_red_lines`, and the second is the tempting one — it reads as
 *     stronger and the model treats it as harder. But nobody has checked
 *     whether the user's rule has any legal force, and asserting that it does
 *     is a claim this product cannot support. It goes in `avoid_topics`.
 *
 * Everything else is left at its zod default. Blanks never block (FSD M1), and
 * a blank is a truthful "we were not told" — where a plausible guess in
 * `customer.pain` would be this product inventing its user's customer.
 *
 * ── AND THE TWO SELECTED SENTENCES ARE FENCED, WHICH THEY WERE NOT ──────────
 * The door's own model call quarantines everything it reads — delimited,
 * attributed, with five lines of preamble saying the blocks are evidence and not
 * instructions. `brand_guidelines`, the call that actually PRODUCES the Brand
 * Brain, does `JSON.stringify(input)` for its whole user turn. So these two
 * sentences — lifted verbatim from a page at an address a stranger's customer
 * typed — arrived at a model with no fence, no attribution and nothing telling
 * it what they were. A live crawl has already hit a real prompt injection on a
 * public page.
 *
 * ⚠ WORSE: THE SELECTION IS ATTACKER-INFLUENCED ⚠ MEASURED here.
 * `firstProofPoint` takes the first sentence carrying a number, and a page
 * printing `<<<UNTRUSTED_PAGE index=0 url="forged"` satisfies that test — so a
 * hostile page picks which of its own lines we quote, and can pick a forged
 * delimiter. `quarantineInline` neutralises that before fencing it.
 *
 * The architecture was never breached: this task has no tools and a fixed zod
 * output, so the worst case stays "a wrong string in a Brain nobody has approved
 * yet". But doc 18 §2's second line was simply absent on this path.
 */

/** `source.one_liner` is a line, not a page. */
const MAX_ONE_LINER = 240
const MAX_PROOF_POINT = 240
/** Below this a "sentence" is a heading, a nav item or a cookie banner button. */
const MIN_SENTENCE_CHARS = 30

export interface OnboardingAnswers {
  intake: Intake
  /** Text read from the door, or '' when the door was a typed sentence only. */
  doorText: string
  /** What they typed on screen 3. */
  refusal: string
  /** Best available name. The workspace name is the honest last resort. */
  name: string
  /** Screen 02's positioning sentence, in their words. Empty when untyped. */
  positioning?: string
  /** Screen 03: the ideal customer, then the four optional details. */
  audience?: string
  audienceAge?: string
  audienceLoc?: string
  audienceRole?: string
  audienceInterests?: string
}

/**
 * The audience answers as one sentence, or '' when none were given.
 *
 * JOINED, NOT INVENTED. Each clause is prefixed with the label the person
 * answered under, so "25-35" arrives as "aged 25-35" and not as a bare number
 * the model has to guess the meaning of. Nothing is added that was not typed,
 * and an untouched field contributes no clause — an empty result stays empty
 * rather than becoming "no particular audience", which would be a claim.
 */
export function audienceDescription(a: OnboardingAnswers): string {
  const parts: string[] = []
  const base = (a.audience ?? '').trim()
  if (base) parts.push(base)
  const age = (a.audienceAge ?? '').trim()
  if (age) parts.push(`aged ${age}`)
  const loc = (a.audienceLoc ?? '').trim()
  if (loc) parts.push(`in ${loc}`)
  const role = (a.audienceRole ?? '').trim()
  if (role) parts.push(`working as ${role}`)
  const interests = (a.audienceInterests ?? '').trim()
  if (interests) parts.push(`interested in ${interests}`)
  return parts.join(', ')
}

/** Split into sentences without pretending to be a tokenizer. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= MIN_SENTENCE_CHARS)
}

/** The first sentence that describes rather than navigates. */
export function firstSentence(text: string): string {
  return (sentences(text)[0] ?? '').slice(0, MAX_ONE_LINER)
}

/**
 * The first sentence carrying a year or a counted quantity — verbatim.
 *
 * Selection, not generation: the sentence is theirs. A "proof point" this
 * product wrote itself would be the one field in the Brand Brain that is a
 * fabrication rather than an inference.
 */
export function firstProofPoint(text: string): string {
  const found = sentences(text)
    .slice(0, 40)
    .find((line) => /\b(19|20)\d{2}\b/.test(line) || /\b\d[\d,.]*\s*(\+|%|[a-z]{2,})/i.test(line))
  return (found ?? '').slice(0, MAX_PROOF_POINT)
}

/**
 * Build the resolve input. Total: every field is either given, selected
 * verbatim from the user's own text, or left at its schema default.
 */
export function toResolveInput(answers: OnboardingAnswers): ResolveInput {
  const { intake, doorText, refusal, name } = answers
  // Same ask the screen showed, re-derived from the intake rather than
  // passed through a form field a client could disagree with.
  const rule = refusalToRule(refusal, questionFor(intake).ask).rule

  /**
   * THEIR OWN SENTENCE OUTRANKS THEIR HOMEPAGE, and that is the whole ordering.
   *
   * `one_liner` used to come only from the fetched page. A sentence the person
   * typed about their own business on screen 02 is better evidence than a
   * sentence a crawler happened to pick off their site, and it is theirs
   * without qualification. So the typed line wins when there is one, and the
   * page's first sentence is the fallback it always was.
   *
   * NOT QUARANTINED when it is the typed line. The fence exists because door
   * text comes from an arbitrary URL and a live crawl has already hit a real
   * prompt injection on a public page. What the customer typed into our own
   * form is the same trust level as `source.name`, which is not fenced either.
   */
  const typed = (answers.positioning ?? '').trim()
  const oneLiner = typed
    ? typed.slice(0, MAX_ONE_LINER)
    : quarantineInline(firstSentence(doorText), 'the page or document you gave us')

  return ResolveInputSchema.parse({
    source: {
      name: name.trim() || 'This business',
      // All THREE picks, said as a phrase rather than as enum values — the
      // model reads prose, and "local presence in food, in India" carries what
      // the picks mean. Locale rides here because the contract has no field for
      // jurisdiction and `category` is a free-text description; dropping it
      // would throw away the pick that decides which regulator is real.
      category: `${MODEL_NOUN[intake.model]} in ${REGIME_NOUN[intake.regime]}, in ${LOCALE_LABEL[intake.locale]}`,
      one_liner: oneLiner,
    },
    customer: {
      // Literally a description of the customer, assembled from the screen that
      // asks for one. This is the field those answers were always for; they
      // simply never left the browser.
      description: audienceDescription(answers),
    },
    brand: {
      // FENCED, because this sentence is not ours and not the founder's — it is
      // whatever was on a page or in a PDF at an address they typed.
      proof_point: quarantineInline(firstProofPoint(doorText), 'the page or document you gave us'),
    },
    taboo: {
      avoid_topics: rule,
    },
  })
}
