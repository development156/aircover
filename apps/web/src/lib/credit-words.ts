/**
 * The word that goes beside a credit figure.
 *
 * ── WHY A SHARED FUNCTION AND NOT A TERNARY AT EACH SITE ─────────────────────
 * `n === 1 ? 'credit' : 'credits'` was written out at three call sites and
 * omitted at three others, and the omissions were not random — every one of them
 * was a branch nobody with a funded workspace reaches:
 *
 *   inline-rewrite.tsx:83   the SUCCESS toast, which has ALWAYS read
 *                           "1 credits used", because caption_rewrite costs
 *                           exactly 1 and this component charges nothing else.
 *                           Its FAILURE branch twenty lines below was fixed for
 *                           this same plural, with a comment explaining it.
 *   credits-view.tsx:232    "Granted 1 credits" on an ops grant of one
 *   sahoda-rail / cost-label  correct, by hand, three times over
 *
 * A ternary repeated six times is six chances to forget; a function is one. The
 * point is not the two words — it is that the next figure rendered anywhere gets
 * the right one without anybody remembering.
 */
export function creditWord(count: number): 'credit' | 'credits' {
  // Exactly one. Not `<= 1`: zero credits is "0 credits" in English, and a
  // negative figure has no business reaching a sentence at all.
  return count === 1 ? 'credit' : 'credits'
}

/** A figure and its word, for the many places that want both. */
export function credits(count: number): string {
  return `${count} ${creditWord(count)}`
}
