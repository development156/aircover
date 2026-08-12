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
 * Turn a typed refusal into a rule.
 *
 * When the sentence opens with a recognisable refusal ("we won't call it
 * homemade") it becomes "Never call it homemade." When it does not, their
 * sentence is kept verbatim — reading back something the user did not say, in
 * order to make it fit a template, is worse than a rule that reads slightly
 * unevenly.
 */
export function refusalToRule(raw: string): RefusalRule {
  const value = (raw ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_REFUSAL_CHARS)
  if (!value) return { rule: '', transformed: false }

  const stripped = stripOpener(value)
  if (stripped) return { rule: punctuate(sentenceCase(`never ${stripped}`)), transformed: true }

  return { rule: punctuate(sentenceCase(value)), transformed: false }
}

/** Is this long enough to be worth holding onto? */
export function isUsableRefusal(raw: string): boolean {
  return (raw ?? '').trim().length >= MIN_REFUSAL_CHARS
}
