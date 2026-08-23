/**
 * Splitting a card's plain-English half from its engineering half (SL-062 §2).
 *
 * Every board card is written for a stakeholder first — what it does and why it
 * matters — with the paths, function names and line numbers moved behind a
 * disclosure. Both halves live in one `detail` string separated by a sentinel,
 * because `ops_tasks` has no third text field and only the `wt-db` worktree may
 * add one. The sentinel is authored in `scripts/lib/ops-cards.mjs` and asserted
 * equal to this constant by `card-copy.test.ts`, so the two cannot drift.
 *
 * Pure, and deliberately forgiving: a card written before this convention, or
 * by a human in the board sheet, has no marker at all and is simply all-plain.
 * A card is never rendered as empty because its formatting was unexpected.
 */

/** Must stay byte-identical to `TECHNICAL_MARKER` in scripts/lib/ops-cards.mjs. */
export const TECHNICAL_MARKER = '\n\nTechnical detail: '

export interface CardCopy {
  /** What the dashboard shows by default. Never empty when `detail` is not. */
  plain: string
  /** Collapsed behind a disclosure, or null when the card has no technical half. */
  technical: string | null
}

export function splitCardDetail(detail: string | null): CardCopy {
  if (!detail) return { plain: '', technical: null }

  const at = detail.indexOf(TECHNICAL_MARKER)
  if (at === -1) return { plain: detail.trim(), technical: null }

  const plain = detail.slice(0, at).trim()
  const technical = detail.slice(at + TECHNICAL_MARKER.length).trim()

  // A marker with nothing after it, or nothing before it, is a malformed card
  // rather than an empty half — keep whichever side has words and drop the
  // separator, so the reader sees the text that exists rather than a heading
  // over blank space.
  if (!technical) return { plain, technical: null }
  if (!plain) return { plain: technical, technical: null }

  return { plain, technical }
}

/**
 * The one-line form for a rolled-up summary: the first sentence of the plain
 * half, which is authored to be the "what it is" sentence.
 *
 * Truncation is by sentence, not by character count: cutting mid-word produces
 * "Preview links write to the live cust…", which reads as a broken page rather
 * than a summary. A card whose first sentence is genuinely long is shown long.
 */
export function cardHeadline(detail: string | null, fallback: string): string {
  const { plain } = splitCardDetail(detail)
  if (!plain) return fallback

  const end = /[.!?](\s|$)/.exec(plain)
  return end ? plain.slice(0, end.index + 1) : plain
}
