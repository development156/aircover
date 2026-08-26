/**
 * SAHODA SPEAKS IN THE THIRD PERSON, AND UNTIL NOW NOTHING CHECKED IT.
 *
 * ── THE RULE, AND WHY IT NEEDED A GUARD ──────────────────────────────────────
 * `CLAUDE.md`: "Sahoda speaks in the third person. 'Sahoda could not reach your
 * accounts', never 'I could not'. 44 third-person mentions set the voice; the two
 * first-person strays were fixed 2026-08-16."
 *
 * Two strays were found by reading, fixed by hand, and nothing was added to stop
 * a third. A third arrived: `inline-rewrite.tsx` shipped "Your post changed while
 * I was rewriting, so I didn't replace anything" — one sentence carrying the
 * defect twice, on a paid action, where the product is explaining that it charged
 * the customer and kept the result. That is the least good place in the app to
 * suddenly become a person.
 *
 * A rule with 44 correct instances and zero enforcement is a convention, not a
 * guarantee. This module is the guarantee.
 *
 * ── WHAT IT MATCHES, AND WHY IT IS A LIST RATHER THAN `\bI\b` ────────────────
 * `\bI\b` is unusable here: it fires on every `I` in prose about identifiers, on
 * roman numerals, and on the pronoun inside a quoted platform string. What makes
 * a sentence FIRST PERSON is the pronoun bound to a verb, so the pattern is
 * `I` followed by one of the verbs an interface actually uses.
 *
 * ── AND WHY "MY" AND "ME" ARE NOT HERE ───────────────────────────────────────
 * They are the USER's voice, not Sahoda's, and the product uses them correctly on
 * purpose. `relink-control.tsx` labels a button "Put my {label} copy back" and
 * onboarding offers "I'll do this later" — both are words the reader is saying to
 * the product, which is the opposite of the defect. A guard that flagged those
 * would push someone to break working copy to make a test pass.
 */

/**
 * The contraction forms, in every spelling this codebase actually ships.
 *
 * THREE forms, and the third was found the hard way. JSX source writes the HTML
 * ENTITY `&rsquo;`, plain strings hold the character `’`, and some files use the
 * ASCII `'`. The first version of this pattern covered only the last two, ran
 * green over `result-step.tsx`, and missed `I&rsquo;ll plan for a…` sitting four
 * lines above three strays it did catch.
 *
 * That is this project's own rule turned on the detector: check the sentence the
 * READER gets, not the literal you wrote. The reader gets an apostrophe however
 * it was typed.
 */
// The numeric entity is written as a RANGE rather than the literal, and that is
// not stylistic: `design-lint` rule 1 scans for `#` followed by hex digits and
// reads the literal numeric entity as a raw hex colour. It is a false positive,
// but a generic `&#<digits>;` is both a wider net and a quieter one.
const APOSTROPHE = "(?:['’]|&rsquo;|&apos;|&#\\d+;)"

/**
 * `I` bound to a verb. Case-sensitive on the pronoun, because `i` lowercase is a
 * loop variable and a word in `it`, and matching it would drown the signal.
 */
const FIRST_PERSON = new RegExp(
  [
    `\\bI ${APOSTROPHE}?(?:m|ll|ve|d)\\b`,
    `\\bI${APOSTROPHE}(?:m|ll|ve|d)\\b`,
    '\\bI (?:am|was|will|would|can|could|have|has|had|did|do|does|found|made|think|thought|need|want|tried|see|saw|know|knew|got|kept|left|put|sent|read|wrote)\\b',
    `\\bI (?:can|could|did|do|does|was|were|have|had|would|will)n${APOSTROPHE}?t\\b`,
    '\\bI cannot\\b',
  ].join('|'),
  'g',
)

/**
 * SENTENCES WHERE THE READER IS THE SPEAKER, AND THE PRONOUN IS CORRECT.
 *
 * This list exists because the first version of this guard flagged
 * `I&rsquo;ll do this later` — the button that leaves onboarding — and
 * `Put my {label} copy back`. Both are the customer talking TO the product, which
 * is the opposite of the defect, and a guard that demands they change is a guard
 * that makes the copy worse to make a test pass.
 *
 * `I'll` and `I'm` are genuinely ambiguous: only who is speaking tells them apart,
 * and no regular expression knows that. So detection stays broad and the
 * ambiguity is resolved HERE, by naming the exact phrases, where each one is
 * visible and arguable rather than silently absent from a pattern.
 */
export const USER_VOICE: readonly string[] = [
  // The way out of the onboarding flow. The reader is deferring, not Sahoda.
  'do this later',
  // The relink undo. "my copy" is the writer's own words, which is the point.
  'copy back',
]

export interface VoiceStray {
  /** The offending phrase, exactly as it appears. */
  phrase: string
  /** A window around it, so a failure names the sentence rather than two words. */
  context: string
}

/**
 * Strip what is not user-facing copy before scanning.
 *
 * Comments are the whole reason this needs doing: this repository writes long
 * explanatory headers, many of them in the first person about what a previous
 * session did, and every one of them would be a false positive. A guard that
 * cried wolf on its own documentation would be turned off within a week.
 *
 * Imports go too — a path like `@/lib/I18n` has no opinion about voice.
 */
export function stripNonCopy(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/^\s*import[\s\S]*?from\s+['"][^'"]*['"]/gm, ' ')
}

/**
 * Every first-person stray in one file's user-facing copy.
 *
 * Returns the matches rather than a boolean: a guard that can only say "somewhere
 * in 1,200 files" is a guard nobody can act on.
 */
export function findVoiceStrays(source: string): VoiceStray[] {
  const copy = stripNonCopy(source)
  const strays: VoiceStray[] = []
  for (const match of copy.matchAll(FIRST_PERSON)) {
    const at = match.index ?? 0
    const context = copy
      .slice(Math.max(0, at - 60), at + match[0].length + 60)
      .replace(/\s+/g, ' ')
      .trim()
    // The reader is allowed to say "I". Checked against the window rather than
    // the two matched words, because the phrase that identifies the speaker sits
    // beside the pronoun, never inside it.
    if (USER_VOICE.some((allowed) => context.includes(allowed))) continue
    strays.push({ phrase: match[0], context })
  }
  return strays
}
