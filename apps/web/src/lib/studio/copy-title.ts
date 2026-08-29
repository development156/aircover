/**
 * NAMING THE COPY, AND THE LENGTH TRAP UNDERNEATH IT.
 *
 * ── TWO DESIGNS WITH ONE NAME IS A GALLERY YOU CANNOT USE ───────────────────
 * The gallery shows a title under each preview. A duplicate carrying the same
 * title as its original gives two identical cards, and the only way to tell
 * them apart is to open both. So the copy says it is one.
 *
 * ── AND THE SUFFIX CAN MAKE THE TITLE UNSAVEABLE ────────────────────────────
 * MEASURED against `TitleSchema` in `app/actions/studio.ts`
 * (`z.string().trim().min(1).max(80)`): 80 characters is accepted and 81 is
 * refused. The editor's own box stops at 80, so a person can hold a title that
 * is exactly at the limit, and appending " (copy)" to it produces 87 characters
 * that the schema refuses. The refusal that comes back is
 * `REFUSALS.malformed`, "part of it was not readable", about a title the person
 * never typed and cannot see. That is the same defect as the emptied name box,
 * arriving from the other end of the same rule.
 *
 * So the BASE is shortened and the suffix is kept, never the other way round:
 * the suffix is the entire point of the new name, and a copy called
 * "Spring menu for the Saturday market" with no marker is the problem this
 * function exists to solve.
 *
 * Pure: no I/O, no clock, no database.
 */

/** What `TitleSchema` allows. Mirrored here so the trap can be tested. */
export const TITLE_MAX = 80

/** Matches a title this function has already named, so copies of copies count up. */
const ALREADY_A_COPY = /^(.*) \(copy(?: (\d+))?\)$/

export function copyTitle(title: string): string {
  const base = title.trim()

  // A copy of a copy counts up rather than stacking suffixes: "x (copy)" gives
  // "x (copy 2)", not "x (copy) (copy)". Duplicating the same original twice
  // still gives two "x (copy)" cards, because nothing here can see the gallery,
  // and two cards that say "copy" are honest where two identical ones are not.
  const seen = ALREADY_A_COPY.exec(base)
  const [stem, suffix] = seen
    ? [seen[1]!, ` (copy ${(seen[2] === undefined ? 1 : Number(seen[2])) + 1})`]
    : [base, ' (copy)']

  const room = TITLE_MAX - suffix.length
  // `trimEnd` after the cut so a title shortened mid-space does not become
  // "Spring menu  (copy)". The result can only get shorter, never longer.
  const kept = stem.length <= room ? stem : stem.slice(0, room).trimEnd()

  // A stem of nothing would leave a title starting with a space, and a title
  // that is only "(copy)" tells somebody nothing. Neither is reachable from the
  // editor, whose box refuses an empty name, but this is a pure function and a
  // caller elsewhere should not be able to produce either.
  return kept === '' ? 'Copy' : `${kept}${suffix}`
}
