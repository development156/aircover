/**
 * Where the brain on screen came from — the honest, brain-level answer.
 *
 * ── WHY THIS IS BRAIN-LEVEL AND NOT PER FIELD ────────────────────────────────
 * The obvious design for a resolution console puts a source under every guess:
 * "inferred from acme.com/about". It cannot be built honestly. `brand_guidelines`
 * receives the WHOLE door text and returns all fifteen fields in one object;
 * nothing traces a field back to a passage, a page or a paragraph. Stamping a
 * URL into each field's `FieldMeta.source` would record a fact about the BRAIN
 * ("this was resolved from acme.com") in a slot the reader will take as a fact
 * about the FIELD ("this sentence came from acme.com"). Those are different
 * claims and only the first one is true.
 *
 * That is the same defect shape as `100 of —` on /home (docs/27 §3.1): a
 * numerator rendered against a denominator that does not exist. The remedy there
 * was to delete the slot, and it is the remedy here. What Sahoda actually knows
 * about origin, it knows once, for the whole brain — so it is said once, at the
 * top, and the console says plainly that per-field evidence is not recorded.
 *
 * ── WHAT IS ACTUALLY STORED ──────────────────────────────────────────────────
 * `brand_memory.source`, a real column validated by `public.resolve_brand_memory`
 * against exactly three values. `readBrain` has always SELECTed it and always
 * discarded it, so this is a read of existing data rather than anything new.
 * `saveBrandMemory` documents what each value means; this file turns that into
 * something a customer can read.
 */
export type BrainOriginKind = 'resolved' | 'manual' | 'system' | 'unknown'

export interface BrainOrigin {
  kind: BrainOriginKind
  /** Short label. */
  label: string
  /** What this version actually is. */
  line: string
  /**
   * True when the brain on screen is NOT a reading of this customer's business.
   * The one case where every field is not merely unconfirmed but unrelated.
   */
  isSample: boolean
}

/**
 * `system` is the value that matters most and the one a console must not
 * soft-pedal. `saveBrandMemory` states the contract: a fallback "persists with
 * `source='system'` and a visible notice — never presented as a genuine
 * resolve". A sample brain reads exactly like a real one on /brain — fifteen
 * plausible fields, a ring at 0/15 — and a person confirming their way through
 * it would be signing off on another business's answers, one tap at a time.
 * That is the single worst outcome this console could produce, so it is called
 * out before the queue rather than inside it.
 */
export function brainOrigin(source: string | null | undefined): BrainOrigin {
  switch (source) {
    case 'resolved':
      return {
        kind: 'resolved',
        label: 'Resolved by Sahoda',
        line: 'A model read what you gave it and wrote every field below in one pass. None of it is your answer until you say so.',
        isSample: false,
      }
    case 'manual':
      return {
        kind: 'manual',
        label: 'Last edited by hand',
        line: 'The most recent version was written by a person on this screen. Fields nobody has confirmed are still Sahoda’s.',
        isSample: false,
      }
    case 'system':
      return {
        kind: 'system',
        label: 'A sample, not your brand',
        line: 'The model could not be reached, so Sahoda saved an example Brand Brain to show you the shape of one. These are not answers about your business. Re-run the resolve before confirming anything here.',
        isSample: true,
      }
    default:
      /**
       * Not a degraded read and not an error. A row written before this column
       * carried anything, or a value outside the three the RPC accepts, leaves
       * us with no record — and "we did not record it" is the honest sentence.
       * Guessing `resolved` because it is the common case would be inventing
       * provenance, which is the exact thing this console exists to refuse.
       */
      return {
        kind: 'unknown',
        label: 'Not recorded',
        line: 'Nothing was recorded about how this version was written. Treat every unconfirmed field as a guess, which is what the count below already does.',
        isSample: false,
      }
  }
}

/**
 * The sentence that has to appear wherever a reader might expect per-field
 * evidence, because its absence is the finding.
 *
 * Kept here as one exported constant rather than typed at each call site: the
 * moment it exists in two places, one of them gets softened.
 */
export const NO_PER_FIELD_EVIDENCE =
  'Sahoda cannot show which sentence produced which field. It reads everything you give it in one pass and writes the whole Brain at once, so nothing links a field back to a line in your document — and it will not invent one.'
