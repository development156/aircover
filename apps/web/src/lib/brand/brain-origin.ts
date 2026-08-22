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
export type BrainOriginKind = 'resolved' | 'manual' | 'system' | 'learned' | 'unknown'

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
/**
 * What `brainOrigin` needs beyond the stored column, and why it needs anything.
 *
 * ── THE COLLISION, MEASURED AGAINST PRODUCTION 2026-08-22 ───────────────────
 * `public.resolve_memory_event`'s accept branch writes a new version with
 * `source = 'system'`. So does the model-unreachable fallback. They are two
 * entirely different events sharing one stored value, and the column has room
 * for exactly three:
 *
 *     BEFORE  {"version":1,"source":"resolved"}
 *     ACCEPT  {"status":"accepted","brand_memory_version":2}
 *     AFTER   {"version":2,"source":"system"}
 *
 * The consequence was live before this file was touched: a person who accepted
 * a learning — the Loop's whole point, wired to a real button in
 * `app/actions/loop-controls.ts` — was then told by this console that their
 * entire Brand Brain is "a sample, not your brand… These are not answers about
 * your business." The most reassuring action in the product produced the most
 * alarming sentence in it.
 *
 * ── WHY THIS AND NOT A FOURTH `source` VALUE ────────────────────────────────
 * A fourth value means a migration AND a change to `BrandMemorySourceSchema`,
 * which `public.resolve_brand_memory` validates and which onboarding, the
 * editor and the fallback all write. That is a frozen contract moved to fix a
 * rendering bug.
 *
 * `memory_events.applied_memory_version` already records exactly this, and it
 * is a stored fact rather than an inference: an accepted event carrying THIS
 * version number means this version was written by that accept. The probe above
 * printed it in the same breath — `[{"status":"accepted","applied_memory_version":2}]`.
 * So the distinction is read, not guessed, and nothing frozen moves.
 */
export interface BrainOriginContext {
  /**
   * True when an ACCEPTED `memory_events` row names this exact brain version.
   *
   * Only consulted when `source` is `system`, because that is the only value
   * two different events share. `false` is the honest default: it means no
   * accepted learning claims this version, which for a real fallback is the
   * truth.
   */
  appliedFromLearning?: boolean
}

export function brainOrigin(
  source: string | null | undefined,
  context: BrainOriginContext = {},
): BrainOrigin {
  /**
   * CHECKED BEFORE THE SWITCH, and only for `system`. A learning accepted onto a
   * brain that was `resolved` or `manual` cannot arrive here as those values —
   * the RPC overwrites `source` — so there is no case where this would shadow a
   * value that is already correct.
   */
  if (source === 'system' && context.appliedFromLearning) {
    return {
      kind: 'learned',
      label: 'Updated by a learning you accepted',
      line: 'This version is the previous one with a change you approved merged into it. Everything else is exactly as it was, and fields nobody has confirmed are still Sahoda’s.',
      isSample: false,
    }
  }

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
 *
 * ── IT IS NO LONGER TRUE OF EVERY FIELD, AND THE WORDING SAYS SO ────────────
 * It was written when one path existed. `brand_guidelines` reads the whole door
 * text and returns fifteen fields in one object, so nothing links a field to a
 * passage and nothing can — that half is unchanged and is why this constant
 * still exists.
 *
 * The knowledge library added a SECOND path with a different property.
 * `brand_extract` cites a block index, `attachProvenance` resolves that index
 * against a list we built, and an index we did not supply drops the field. So a
 * library-sourced field CAN show the passage it came from, and does
 * (`components/brain/field-evidence.tsx`).
 *
 * Two states, both named, rather than one claim that is now half wrong. A blanket
 * "Sahoda cannot show which sentence produced which field" printed above a field
 * that is showing exactly that would teach the reader to disbelieve the page.
 */
export const NO_PER_FIELD_EVIDENCE =
  'For anything Sahoda worked out from a link or a PDF at signup, it cannot show which sentence produced which field — it read everything in one pass and wrote the whole Brain at once, and it will not invent a source it does not have. A field drawn from your Knowledge library is different: it names the document and quotes the passage, underneath the field itself.'
