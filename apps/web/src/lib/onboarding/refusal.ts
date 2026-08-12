/**
 * Screen 3's answer, read back as a rule.
 *
 * The transformation is deliberately small. The temptation is to "improve" what
 * someone typed into something that sounds like a brand rule — and the moment
 * you do, the rule stops being theirs and they stop recognising it. What they
 * typed in front of a moment they could see is the most honest sentence in the
 * whole flow. So: strip the throat-clearing, put it in the imperative, and
 * otherwise leave every word alone.
 */

/** Shorter than this is not a rule, it is a shrug. */
export const MIN_REFUSAL_CHARS = 8
export const MAX_REFUSAL_CHARS = 280

/**
 * Openers that mean "here comes the thing I refuse". Longest first, so
 * "we will never" is stripped before "we will".
 */
const NEGATIVE_OPENERS = [
  'we would never',
  'we will never',
  'we do not ever',
  'i would never',
  'i will never',
  'we never',
  'i never',
  "we won't ever",
  "we won't",
  'we will not',
  'we do not',
  "we don't",
  "i won't",
  'i will not',
  'i do not',
  "i don't",
  'never',
  "don't",
  'do not',
]

// Deliberately NOT in the list above:
//   "no"                  — "no discounts on wedding cakes" becomes
//                           "Never discounts on wedding cakes", which is not a
//                           sentence. The opener has to leave a verb behind.
//   "we are never going to" — leaves "going to ..." after the strip.
// Both cases fall through and are read back verbatim, which reads correctly.

export interface RefusalRule {
  /** The rule, ready to show and to store as a red line. */
  rule: string
  /** True when we recognised a refusal and put it in the imperative. */
  transformed: boolean
}

function stripOpener(value: string): string | null {
  const lower = value.toLowerCase()
  for (const opener of NEGATIVE_OPENERS) {
    // The boundary check stops "no" matching the start of "nothing goes out".
    if (lower.startsWith(opener) && /^[\s,]/.test(value.slice(opener.length) || ' ')) {
      return value.slice(opener.length).replace(/^[\s,]+/, '')
    }
  }
  return null
}

function sentenceCase(value: string): string {
  if (!value) return value
  return value[0]!.toUpperCase() + value.slice(1)
}

function punctuate(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`
}

/**
 * The verb the QUESTION already put in the founder's mouth.
 *
 * Every ask is shaped "What do you refuse to <verb phrase>?" — "call it",
 * "do, even though they are paying", "promise". Lifting that phrase back out is
 * how the rule stays in the language of the thing they answered, without any
 * new vocabulary being invented for them.
 *
 * `say` is the fallback because a brand red line is nearly always about what is
 * SAID; it is the safest hinge when no ask is to hand.
 */
/**
 * Words that mean the sentence is ALREADY a refusal, without one of the
 * `NEGATIVE_OPENERS` shapes in front of it.
 *
 * "nothing goes out before consent is in hand" and "no discounts on wedding
 * cakes" are finished rules: they carry their own negation and reading them
 * back verbatim is exactly right. Negating them a SECOND time inverts them —
 * "Never say nothing goes out..." permits the thing they just forbade. So the
 * negation below fires only on an answer that has none of its own.
 */
const ALREADY_NEGATIVE = new Set([
  'no',
  'not',
  'none',
  'never',
  'nothing',
  'nobody',
  'no-one',
  'noone',
  'neither',
  'nor',
])

function carriesOwnNegation(value: string): boolean {
  const first = value.toLowerCase().split(/[\s,]+/)[0] ?? ''
  return ALREADY_NEGATIVE.has(first.replace(/[^a-z-]/g, ''))
}

export function refusalVerb(ask?: string): string {
  const match = /refuse to ([^?,.]+)/i.exec(ask ?? '')
  return match ? match[1]!.trim().toLowerCase() : 'say'
}

/**
 * Turn a typed refusal into a rule. IT ALWAYS NEGATES.
 *
 * THE BUG THIS FIXES, observed on a real walk: the screen asks "what do you
 * refuse to call it?", the founder answers with the THING THEY REFUSE — "AI
 * slop works" — and the old code, finding no negative opener, read it straight
 * back as the rule "AI slop works." That is not a weaker rule, it is the
 * OPPOSITE one: the brand's red line became the brand's claim, and it would
 * have been persisted as a red line and prepended to every model call.
 *
 * A bare answer to "what do you refuse to X?" is not already a rule. It is the
 * object of a refusal, and turning it into one means supplying the negation the
 * question left implicit — never dropping it.
 *
 * The words themselves are still theirs. Only "Never" and the question's own
 * verb are added, and when their sentence already carries a refusal ("we won't
 * call it homemade") the opener is stripped so it does not read "Never we
 * won't". A rule that reads a little unevenly in their words beats a smooth one
 * in ours.
 */
export function refusalToRule(raw: string, ask?: string): RefusalRule {
  const value = (raw ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_REFUSAL_CHARS)
  if (!value) return { rule: '', transformed: false }

  const stripped = stripOpener(value)
  if (stripped) return { rule: punctuate(sentenceCase(`never ${stripped}`)), transformed: true }

  // Already a rule in their own words — leave every word alone.
  if (carriesOwnNegation(value)) return { rule: punctuate(sentenceCase(value)), transformed: false }

  // No opener and no negation of its own: they answered with the THING they
  // refuse. Negate it using the verb the question asked with, unless their
  // answer already opens with that verb — repeating it would read
  // "Never call it call it homemade".
  const verb = refusalVerb(ask)
  // When their answer already opens with the question's verb ("call it
  // homemade"), the verb is theirs and stays — only "Never" is added. Slicing it
  // off instead would produce "Never homemade.", which is not a sentence.
  const body = value.toLowerCase().startsWith(`${verb} `) ? value : `${verb} ${value}`
  return { rule: punctuate(sentenceCase(`never ${body}`)), transformed: true }
}

/** Is this long enough to be worth holding onto? */
export function isUsableRefusal(raw: string): boolean {
  return (raw ?? '').trim().length >= MIN_REFUSAL_CHARS
}
