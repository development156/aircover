/**
 * WHAT TO SAY WHEN THERE ARE NOT ENOUGH CREDITS.
 *
 * ── THE BRANCH A FUNDED WORKSPACE NEVER REACHES ─────────────────────────────
 * This is the one sentence in a paid action that nobody sees while testing,
 * because testing is done in a workspace with credits. A peer found "needs 1
 * credits" living in exactly this branch: correct in every case they looked at,
 * wrong in the one case a person in trouble actually meets.
 *
 * So it is a pure function with its own tests, and the plural is asserted at
 * one, which is the value that breaks it.
 *
 * ── AND IT STATES BOTH NUMBERS AND THE NON-EVENT ────────────────────────────
 * A refusal that says only "not enough credits" leaves somebody guessing how far
 * short they are. And it must say that NOTHING WAS CHARGED, because the fear at
 * that moment is having paid for nothing: the hold was released, the balance did
 * not move, and silence on that point reads as bad news.
 *
 * Pure: no I/O, no clock, no database.
 */

/** `n credit` or `n credits`, correct at one. */
export function credits(n: number): string {
  return `${n} credit${n === 1 ? '' : 's'}`
}

/**
 * The sentence for a refused generation.
 *
 * `available` is stated even when it is zero, because "you have 0 credits" and
 * saying nothing about the balance are different messages, and the first is the
 * one that tells somebody what to do next.
 */
export function describeInsufficient(input: { required: number; available: number }): string {
  return `Making this picture needs ${credits(input.required)} and you have ${credits(
    input.available,
  )}. Nothing was charged. Top up and the picture is still one press away.`
}

/**
 * What arrived, when it was not everything that was asked for.
 *
 * ── A PARTIAL RESULT IS ITS OWN ANSWER ──────────────────────────────────────
 * Asking for four and getting three is neither a success nor a failure, and
 * saying either is a lie. "Made" hides that a picture is missing; "could not
 * make this" hides three that arrived and were paid for. So the sentence names
 * both numbers and says what happened to the money, because the wallet is where
 * a person will go to check.
 *
 * Returns null when everything asked for arrived. There is nothing to explain,
 * and a screen that announced "4 of 4" on every press would be noise that
 * teaches people to stop reading it.
 */
export function describePartial(input: { made: number; asked: number }): string | null {
  if (input.made >= input.asked) return null
  const one = input.made === 1
  return `Sahoda made ${input.made} of the ${input.asked} pictures you asked for, then stopped. You were charged for the ${
    one ? 'one that arrived' : 'ones that arrived'
  } and for nothing else.`
}

/**
 * What to say when a picture could not be put on the clipboard.
 *
 * ── THREE OUTCOMES, AND TWO OF THEM ARE NOT THE PICTURE'S FAULT ─────────────
 * "Unsupported" means this browser will not take a picture at all, and the
 * remedy is to save the file instead. "Failed" means it should have worked and
 * did not, and the remedy is to try again. Collapsing them sends half the people
 * who see this to a remedy that cannot work, which is the thing this product
 * forbids by name.
 *
 * Null on success: a confirmation is the button's job, not a sentence's.
 */
export function describeCopyFailure(result: 'copied' | 'unsupported' | 'failed'): string | null {
  if (result === 'copied') return null
  if (result === 'unsupported') {
    return 'This browser will not let a page copy a picture. Save it to your computer instead, and it is yours to paste anywhere.'
  }
  return 'Sahoda could not copy that picture just now. It is safe in your library, and trying again usually works.'
}
