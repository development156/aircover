/**
 * WHAT A PERSON IS TOLD WHEN AN ORDER COULD NOT BE OPENED.
 *
 * ── THE DEFECT THIS CLOSES ───────────────────────────────────────────────────
 * Both entry points into a paid checkout answered the same sentence for every
 * failure: "Try again." MEASURED on 2026-09-02 through Sentry, Cashfree's
 * create-order call answers **401** on app.sahodalabs.com — the production keys
 * are rejected by Cashfree's own production endpoint — and that failure repeats
 * identically for as long as the keys stay wrong. So the one remedy the product
 * offered was the one that could not work, on the screen where a customer is
 * trying to give us money.
 *
 * `cashfreeHttpError` already knows the difference: it stamps `transient` on the
 * error, true for 408, 429 and 5xx and false for everything else. Nothing read
 * it. This does.
 *
 * ── WHY BOTH SENTENCES ARE THIS SHAPE ────────────────────────────────────────
 * A transient failure keeps "Try again", because trying again is genuinely what
 * fixes it. A permanent one says plainly that the fault is Sahoda's and that
 * pressing again will not change the answer, because a customer who cannot tell
 * those apart presses eleven times and then believes their card was charged. It
 * never blames the card, the bank or the customer: none of those was reached.
 * And it states that nothing was charged, which is true — an order that could
 * not be opened cannot have taken money.
 */

/** A transient provider failure: the same request may well work in a moment. */
export const CHECKOUT_TRY_AGAIN =
  'Sahoda could not open a payment just now. Nothing was charged. Try again in a moment.'

/**
 * A permanent one. It offers no retry, because retrying is what does not work,
 * and it does not promise a time, because nobody here knows one.
 */
export const CHECKOUT_ON_OUR_SIDE =
  'Sahoda could not open a payment because its payment service refused the request. ' +
  'Nothing was charged, and this is on Sahoda to fix rather than anything you can ' +
  'change. Sahoda has been told, so please come back to it later.'

/**
 * True only when the thrown error says, in as many words, that it is transient.
 *
 * An error carrying no flag is treated as PERMANENT. That is the safe direction
 * for a sentence: telling somebody to try again when it cannot work wastes their
 * time and their trust, while telling them to come back later when it would have
 * worked costs one delay. The 401 that produced this file carries `transient:
 * false`, and a thrown TypeError from our own code carries nothing at all;
 * neither is fixed by pressing the button again.
 */
export function isTransientProviderError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { transient?: unknown }).transient === true
  )
}

/** The sentence for a failure to open a checkout, whichever kind it was. */
export function checkoutFailureMessage(error: unknown): string {
  return isTransientProviderError(error) ? CHECKOUT_TRY_AGAIN : CHECKOUT_ON_OUR_SIDE
}
