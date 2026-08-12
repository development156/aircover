/**
 * Near-duplicate detection.
 *
 * `MIN_CORPUS_WORDS` counts words, not DISTINCT words, and the 2026-08-12 SMB
 * run showed what that costs: vallisvaseha.com returned 1,986 words that were a
 * homepage plus four product-variant pages of 268 words each — the same blurb
 * with a colour swapped. By word count that beat a 914-word homepage. As a
 * voice corpus it was worse: four copies of one sentence teach a model nothing
 * a single copy did not, and they crowd out the pages that would have.
 *
 * Shingles rather than whole-text equality, because variant pages are not
 * identical — one word differs. Jaccard over 5-token shingles catches that and
 * leaves genuinely different pages alone.
 */

/** Bounded: a 50,000-word page must not make similarity the slow part of a signup. */
const MAX_TOKENS = 2000
const SHINGLE = 5

/** Above this, two pages say the same thing. Tuned to admit real siblings. */
export const NEAR_DUPLICATE_THRESHOLD = 0.6

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TOKENS)
}

export function shingles(text: string): Set<string> {
  const words = tokens(text)
  const out = new Set<string>()
  if (words.length < SHINGLE) {
    if (words.length > 0) out.add(words.join(' '))
    return out
  }
  for (let i = 0; i + SHINGLE <= words.length; i += 1) {
    out.add(words.slice(i, i + SHINGLE).join(' '))
  }
  return out
}

/** Jaccard: shared shingles over total distinct shingles. 1 = identical. */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const s of small) if (large.has(s)) shared += 1
  return shared / (a.size + b.size - shared)
}

/**
 * True when `candidate` says what one of `kept` already said.
 *
 * Asymmetric on purpose in one way: a SHORT page that is wholly contained in a
 * long one still scores low on Jaccard, so containment is checked too. A product
 * variant is mostly-contained in its sibling, which is exactly the case that
 * motivated this.
 */
export function isNearDuplicate(
  candidate: Set<string>,
  kept: readonly Set<string>[],
  threshold = NEAR_DUPLICATE_THRESHOLD,
): boolean {
  for (const other of kept) {
    if (similarity(candidate, other) >= threshold) return true
    if (candidate.size === 0) continue
    let shared = 0
    for (const s of candidate) if (other.has(s)) shared += 1
    // Containment: nearly all of this page already appears in one we have.
    if (shared / candidate.size >= 0.9) return true
  }
  return false
}
