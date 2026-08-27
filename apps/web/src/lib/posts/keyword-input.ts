/**
 * WHAT A WRITER TYPES INTO THE KEYWORDS BOX, TURNED INTO TOKENS.
 *
 * ── WHY THIS IS NOT `split(/[\s,]+/)` ────────────────────────────────────────
 * The hashtag box split on whitespace, which was right: `#chai pune` IS two
 * hashtags, because a hashtag cannot contain a space. A keyword can, and that is
 * the whole reason the founder asked for brackets (REQUESTS §34) — `[chai in
 * pune]` is one thing somebody searches for, and the old parser would have made
 * it three.
 *
 * So whitespace stops being a separator. What separates keywords is a COMMA, or a
 * newline, or the brackets themselves.
 *
 * ── THREE WAYS IN, ALL OF WHICH PEOPLE ACTUALLY DO ───────────────────────────
 *   · `chai, pune, monsoon`      — typed, the way anybody lists things
 *   · `[chai] [pune]`            — pasted back from what the box shows
 *   · `[chai in pune], monsoon`  — mixed, because a round-trip half-edited
 *
 * Bracketed groups are read FIRST and whole, so a comma inside brackets belongs
 * to the keyword rather than splitting it. Everything outside the brackets is
 * then split on commas and newlines.
 *
 * Wrapping, the `#` strip and deduplication are NOT done here — `normalizeKeywords`
 * in the Constraint Engine owns those, and it is the same function the character
 * meter and the formatter call. Doing it twice in two places is exactly how the
 * number on screen and the string that goes out came to disagree once before.
 */

/** Bracketed groups, non-greedy, so `[a] [b]` is two and not one. */
const BRACKETED = /\[([^\]]*)\]/g

/** Everything outside brackets: comma and newline separated, whitespace kept. */
function plainPieces(text: string): string[] {
  return text
    .split(/[,\n]+/)
    .map((piece) => piece.trim())
    .filter((piece) => piece !== '')
}

export function parseKeywordInput(raw: string): string[] {
  const out: string[] = []
  let cursor = 0

  /**
   * ── ONE LEFT-TO-RIGHT PASS, AND THAT IS NOT A STYLE CHOICE ─────────────────
   * The first version of this collected every bracketed group and THEN the
   * plain text, which reordered `monsoon, [chai in pune]` into `chai in pune,
   * monsoon`. `normalizeKeywords` preserves order deliberately — the writer
   * chose it — so a parser that scrambles it upstream makes that guarantee
   * worthless. Caught by its own test before it shipped.
   */
  BRACKETED.lastIndex = 0
  for (const match of raw.matchAll(BRACKETED)) {
    out.push(...plainPieces(raw.slice(cursor, match.index)))
    const inner = (match[1] ?? '').trim()
    if (inner !== '') out.push(inner)
    cursor = match.index + match[0].length
  }
  out.push(...plainPieces(raw.slice(cursor)))

  return out
}
