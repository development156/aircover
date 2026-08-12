import type { BusinessModel, Intake, Locale, Regime } from './intake'
import {
  LOCALE_CURRENCY,
  LOCALE_SUMS,
  MODEL_FALLBACKS,
  QUESTIONS,
  type QuestionCopy,
} from './questions'

/** The one question, resolved for a specific business. */
export interface Question extends QuestionCopy {
  /** `${model}x${regime}`, or `${model}` when the pair had no entry. */
  key: string
  /** True when no model x regime entry existed and the model fallback was used. */
  isFallback: boolean
}

/**
 * `x` rather than a symbol so the key is a plain identifier — it is also an
 * object key in `questions.ts`, and a literal there must stay greppable.
 */
export function questionKey(model: BusinessModel, regime: Regime): string {
  return `${model}x${regime}`
}

/** Fill `{currency}`, `{small}` and `{large}` for the user's jurisdiction. */
function localise(text: string, locale: Locale): string {
  const sums = LOCALE_SUMS[locale]
  return text
    .replace(/\{currency\}/g, LOCALE_CURRENCY[locale])
    .replace(/\{small\}/g, sums.small)
    .replace(/\{large\}/g, sums.large)
}

function localiseCopy(copy: QuestionCopy, locale: Locale): QuestionCopy {
  return {
    counterparty: localise(copy.counterparty, locale),
    moment: localise(copy.moment, locale),
    ask: localise(copy.ask, locale),
    placeholder: localise(copy.placeholder, locale),
  }
}

/**
 * The question for this business.
 *
 * Two levels only — the exact pair, then the model. There is deliberately no
 * regime-level fallback and no global one: a question that knows the regime but
 * not the model cannot name a counterparty (a hospital and a health-tech app
 * have nothing in common to stand in front of), and a fully generic question
 * has to reach for "what are your values", which is the thing this screen
 * exists to avoid asking.
 */
export function questionFor(intake: Intake): Question {
  const key = questionKey(intake.model, intake.regime)
  const exact = QUESTIONS[key]
  if (exact) return { ...localiseCopy(exact, intake.locale), key, isFallback: false }

  return {
    ...localiseCopy(MODEL_FALLBACKS[intake.model], intake.locale),
    key: intake.model,
    isFallback: true,
  }
}
