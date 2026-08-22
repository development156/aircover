/**
 * Turn a specimen answer into something that cannot be mistaken for an answer.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 * The onboarding questions ship a real-sounding answer each, shown as
 * placeholder text — "We will not say homemade when we did not make the base."
 * Twelve words, sentence case, ending in a full stop, sitting in a box directly
 * above a DISABLED primary button.
 *
 * A customer walking the flow read exactly that and stopped: a box that looks
 * filled above a button that will not move reads as a broken app, not as an
 * empty required field. The same shape sits on the door step.
 *
 * The placeholder is not the problem — a concrete specimen is the best thing
 * this screen can show, and inventing a vaguer one would cost more than it
 * saves. What was missing is the frame. "Example:" and no terminal full stop
 * make it a specimen at a glance, before anything is read.
 *
 * It is applied at the RENDER rather than in `questions.ts` because there are
 * twenty-odd specimens across four regimes and two locales, and a rule stated
 * once cannot drift from a rule restated twenty times.
 */
export function exampleHint(specimen: string): string {
  const trimmed = specimen.trim().replace(/[.。]+$/u, '')
  if (trimmed.length === 0) return ''
  // Lowercase a leading capital ONLY where the word is not a name: "We" becomes
  // "we" after a colon, but "Prabhat" must not. A word that is all-caps or has
  // an inner capital is left alone for the same reason.
  const [first = '', ...rest] = trimmed.split(' ')
  const isPlainWord = /^[A-Z][a-z]+$/.test(first)
  const head = isPlainWord && !PROPER.has(first) ? first.toLowerCase() : first
  return `Example: ${[head, ...rest].join(' ')}`
}

/** Words that look like ordinary openers but are names. Extend as needed. */
const PROPER = new Set(['Sahoda'])
