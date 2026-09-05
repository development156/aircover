/**
 * What buying credits can come back as.
 *
 * A SEPARATE type from `CheckoutState`, on purpose. A plan purchase and a pack of
 * credits answer different questions — "which plan" against "how many credits" —
 * and widening one union to carry both would give every existing consumer a field
 * that is undefined on the path it actually handles. The two flows share a payment
 * rail, not a result.
 *
 * `simulated` is explicit here for the same reason it is there: nobody may render a
 * sandbox session as a completed purchase by forgetting to check.
 */
export type TopUpState =
  | {
      ok: true
      simulated: true
      mode: 'fixture' | 'sandbox'
      sessionId: string
      /** Credits this order would grant once a real payment completes. Not granted yet. */
      credits: number
    }
  | { ok: true; simulated: false; mode: 'live'; sessionId: string; url: string; credits: number }
  | { ok: false; message: string }
