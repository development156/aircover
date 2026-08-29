/**
 * DELETING A DESIGN, WHICH IS PERMANENT AND WAS ONE UNCONFIRMED PRESS.
 *
 * ── WHAT THE CODE ACTUALLY DOES, WHICH IS WHY THIS EXISTS ───────────────────
 * `deleteDesign` is a hard `delete` on `studio_designs`. There is no trash for
 * designs the way there is for files: nothing is recoverable and nothing can be
 * restored. Until now that sat behind a single press of a button labelled
 * "Delete", beside Save, in an editor somebody is typing in.
 *
 * ── A CONFIRMATION IS NOT THE SAME AS INVENTING A CONSEQUENCE ───────────────
 * `describeTrash` in `@sahoda/shared` argues at length against warning people
 * about things that will not happen, and `deleteDesign`'s own header says there
 * is no usage gate to run because deleting a design cascades NOTHING. Both are
 * right and neither is an argument against asking. The question here is not
 * "what else breaks" (nothing does) but "did you mean to lose this", and for an
 * act with no undo the honest answer is to ask once.
 *
 * ── SO THE SENTENCE STATES BOTH HALVES ──────────────────────────────────────
 * What goes: this design, its words, its slides. What does NOT: every picture
 * it exported is a row in `assets` with its own bytes in the bucket, and
 * deleting the design does not touch one of them. A person who thinks their
 * exported posters go with it will not press, and that would be a refusal
 * caused by our own vagueness.
 *
 * Pure: no I/O, no clock, no database.
 */

export type DeletePrompt = {
  /** What the button says once it is armed. */
  confirm: string
  /** The claim underneath it: what is lost, and what is kept. */
  detail: string
}

/**
 * What to say when somebody has pressed Delete once.
 *
 * `pageCount` and `isTemplate` are facts the editor already holds. Nothing here
 * counts exports, because the editor does not know that number and a count it
 * had to guess at would be worse than the sentence without one.
 */
export function describeDesignDelete(input: {
  pageCount: number
  isTemplate: boolean
}): DeletePrompt {
  const slides = input.pageCount > 1 ? ` All ${input.pageCount} slides go with it.` : ''

  // Said only when it is true. A design that is not a starting point gaining
  // this sentence would be a claim about a shelf it was never on.
  const shelf = input.isTemplate
    ? ' It also stops being a starting point, so new designs cannot be made from it.'
    : ''

  return {
    confirm: 'Press again to delete for good',
    detail:
      `This design and its words are gone for good, and there is no trash to take it back from.${slides}${shelf}` +
      ' Any picture you already added to your library stays there.',
  }
}

/** Said while nothing is armed, and after somebody changes their mind. */
export const DELETE_AT_REST = 'Delete'
export const DELETE_CANCEL = 'Keep it'
