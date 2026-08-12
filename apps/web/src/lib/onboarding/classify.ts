import {
  DEFAULT_INTAKE,
  LOCALE_LABEL,
  MODEL_NOUN,
  REGIME_NOUN,
  type BusinessModel,
  type Intake,
  type Locale,
  type Regime,
} from './intake'
import { LOCALE_TERMS, MODEL_TERMS, REGIME_TERMS, type Term } from './lexicon'

/**
 * Free text → the three picks, deterministically and for free.
 *
 * Every verdict carries its BASIS and the words that produced it, because the
 * read-back on screen 1 has to be honest about which of the three we actually
 * read out of their sentence and which we merely assumed. "We think you're a
 * local presence in food" and "we defaulted to consumer" are different claims
 * and the UI renders them differently.
 */

/**
 * Long inputs are sliced before matching. Screen 1's box is a sentence, but the
 * same classifier is pointed at door text (a whole PDF or page), and the term
 * loop is O(terms x length). A brand's model and regime are named in the first
 * paragraph or not at all.
 */
export const MAX_CLASSIFY_CHARS = 4000

/** How much a verdict must beat the runner-up by to count as more than a tie. */
const DECISIVE_MARGIN = 1

/**
 * `matched` = read out of their words.
 * `assumed` = nothing matched; this is our default and we say so.
 * `chosen`  = the user overrode it on the chips. Outranks both.
 */
export type Basis = 'matched' | 'assumed' | 'chosen'

export interface Verdict<T> {
  value: T
  basis: Basis
  /** The terms that fired, strongest first. Empty when `assumed` or `chosen`. */
  evidence: string[]
}

export interface Classification {
  intake: Intake
  model: Verdict<BusinessModel>
  regime: Verdict<Regime>
  locale: Verdict<Locale>
}

/** Letters and digits in any script — the definition of "inside a word" here. */
const WORDISH = /[\p{L}\p{N}]/u

function isWordish(char: string | undefined): boolean {
  return char !== undefined && WORDISH.test(char)
}

/**
 * Count non-overlapping occurrences of `term`, respecting word boundaries.
 *
 * Scanned with `indexOf` rather than a built regex for three reasons, each of
 * which cost something to learn:
 *
 *  1. `\b` is defined against ASCII word characters, so `\bcafé\b` never fires
 *     ("é" is not one, so there is no boundary after it) and `\b₹\b` never
 *     fires either. Both terms would have been silent dead weight in the table.
 *  2. Lookbehind (`(?<![\p{L}\p{N}])`) fixes that but throws a SyntaxError on
 *     Safari below 16.4 — and this classifier runs in the browser, where a
 *     regex that fails to COMPILE takes the whole screen down, not one term.
 *  3. No term is ever compiled from user input, so there is nothing to escape
 *     and no catastrophic-backtracking surface at all.
 *
 * A term that starts with punctuation ("₹", "$") is matched as a plain
 * substring — a boundary before a symbol is not a meaningful test.
 */
function occurrences(haystack: string, term: string): number {
  const boundaried = isWordish(term[0])
  let count = 0
  let from = 0
  for (;;) {
    const index = haystack.indexOf(term, from)
    if (index === -1) return count
    from = index + term.length
    if (!boundaried) {
      count += 1
      continue
    }
    if (!isWordish(haystack[index - 1]) && !isWordish(haystack[from])) count += 1
  }
}

interface Scored<T> {
  key: T
  score: number
  hits: Term[]
}

function scoreAll<T extends string>(text: string, table: Record<T, readonly Term[]>): Scored<T>[] {
  return (Object.keys(table) as T[])
    .map((key) => {
      const hits = table[key].filter((entry) => occurrences(text, entry.term) > 0)
      // Count each distinct term once. A sentence that says "bakery" four times
      // is not four times more a bakery, and repetition would let one word
      // outweigh three different ones pointing elsewhere.
      const score = hits.reduce((total, entry) => total + entry.weight, 0)
      return { key, score, hits }
    })
    .sort((a, b) => b.score - a.score)
}

function decide<T extends string>(
  text: string,
  table: Record<T, readonly Term[]>,
  fallback: T,
): Verdict<T> {
  const ranked = scoreAll(text, table)
  const best = ranked[0]
  if (!best || best.score === 0) return { value: fallback, basis: 'assumed', evidence: [] }

  // A near-tie is not a read — it is a coin flip we would then present as fact.
  const runnerUp = ranked[1]?.score ?? 0
  if (best.score - runnerUp < DECISIVE_MARGIN) {
    return { value: fallback, basis: 'assumed', evidence: [] }
  }

  const evidence = [...best.hits]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((entry) => entry.term)
  return { value: best.key, basis: 'matched', evidence }
}

/** Lowercase, collapse whitespace, and normalise the dashes people paste in. */
function normalise(raw: string): string {
  return raw.slice(0, MAX_CLASSIFY_CHARS).toLowerCase().replace(/[‐-―]/g, '-').replace(/\s+/g, ' ')
}

/**
 * Classify free text into the three picks. Never throws and never returns a
 * partial answer: a blank string yields the default intake with all three
 * verdicts marked `assumed`, which the read-back states plainly.
 */
export function classify(raw: string): Classification {
  const text = normalise(raw ?? '')

  const model = decide(text, MODEL_TERMS, DEFAULT_INTAKE.model)
  const regime = decide(text, REGIME_TERMS, DEFAULT_INTAKE.regime)
  const locale = decide(text, LOCALE_TERMS, DEFAULT_INTAKE.locale)

  return {
    intake: { model: model.value, regime: regime.value, locale: locale.value },
    model,
    regime,
    locale,
  }
}

/**
 * Re-apply the user's own picks on top of a fresh classification.
 *
 * Screen 1 re-classifies on every keystroke, so without this a pick the user
 * corrected by hand is silently overwritten the moment they add another word to
 * the box — the single most infuriating thing a "smart" form can do. An
 * overridden field becomes `chosen`, which outranks anything the lexicon reads
 * and takes it out of the assumption note.
 */
export function withOverrides(
  classification: Classification,
  overrides: Partial<Intake>,
): Classification {
  const chosen = <T>(value: T): Verdict<T> => ({ value, basis: 'chosen', evidence: [] })

  const model = overrides.model ? chosen(overrides.model) : classification.model
  const regime = overrides.regime ? chosen(overrides.regime) : classification.regime
  const locale = overrides.locale ? chosen(overrides.locale) : classification.locale

  return {
    intake: { model: model.value, regime: regime.value, locale: locale.value },
    model,
    regime,
    locale,
  }
}

/**
 * Improve an ASSUMED pick using the door text.
 *
 * THE BUG THIS FIXES, from a real walk: a founder typed a thin sentence on
 * screen 1 ("Rolling Pin", or nothing at all), then handed over a bakery
 * website on screen 2 — and got the AGENCY question. `questionFor` reads the
 * intake picks and never the door, and a thin sentence classifies to
 * `service(assumed) x consumer(assumed)`, whose key is `servicexconsumer`: the
 * retainer question, asked of a bakery.
 *
 * The door text is the richest description in the flow — a crawled site or a
 * brand book, rather than a name typed into a box — so an ASSUMPTION should
 * yield to it. Two things it must never do:
 *
 *   · override a pick the user CHOSE. `overrides` is their own correction and
 *     outranks any evidence, which is the whole point of `withOverrides`.
 *   · override a pick the intake sentence MATCHED. They described themselves in
 *     their own words on screen 1; a crawl of a site that mentions a supplier's
 *     sector must not talk us out of it.
 *
 * So only `assumed` is replaced, and only by a `matched` verdict.
 */
export function refineWithDoorText(
  intakeText: string,
  doorText: string,
  overrides: Partial<Intake>,
): Classification {
  const fromIntake = classify(intakeText)
  if (!doorText.trim()) return withOverrides(fromIntake, overrides)

  const fromDoor = classify(doorText)
  const better = <T>(a: Verdict<T>, b: Verdict<T>): Verdict<T> =>
    a.basis === 'assumed' && b.basis === 'matched' ? b : a

  const merged: Classification = {
    intake: fromIntake.intake,
    model: better(fromIntake.model, fromDoor.model),
    regime: better(fromIntake.regime, fromDoor.regime),
    locale: better(fromIntake.locale, fromDoor.locale),
  }
  merged.intake = {
    model: merged.model.value,
    regime: merged.regime.value,
    locale: merged.locale.value,
  }
  return withOverrides(merged, overrides)
}

/**
 * The sentence screen 1 shows back. One sentence, sentence case, no hedging
 * adverbs — the correction affordance is the chips beside it, not weasel words.
 */
export function readBack(classification: Classification): string {
  const { model, regime, locale } = classification
  return `You're a ${MODEL_NOUN[model.value]} in ${REGIME_NOUN[regime.value]}, in ${LOCALE_LABEL[locale.value]}.`
}

/**
 * The second line: which of the three we actually read, and which we defaulted.
 * Returns `null` when all three were matched — there is nothing to disclose and
 * a permanent caveat would train people to ignore it.
 */
export function assumptionNote(classification: Classification): string | null {
  const assumed = (['model', 'regime', 'locale'] as const).filter(
    (field) => classification[field].basis === 'assumed',
  )
  if (assumed.length === 0) return null
  if (assumed.length === 3) return 'We could not read any of this from your words — pick below.'

  const NAMES = { model: 'what you are', regime: 'your sector', locale: 'where you are' } as const
  const names = assumed.map((field) => NAMES[field])
  const list = names.length === 1 ? names[0] : `${names[0]} and ${names[1]}`
  return `We guessed ${list} — change it below if that is wrong.`
}
