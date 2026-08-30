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
