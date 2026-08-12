import {
  SOURCE_MODEL,
  SOURCE_OWNER,
  type BrandFieldMetaMap,
  type BrandMemoryPayload,
  type FieldMeta,
} from '@sahoda/shared'

import { BRAIN_FIELDS } from './fields'
import { leavesEqual, readLeaf } from './leaf'

/** The brain being replaced, and what was known about its fields. */
export interface PreviousBrain {
  payload: BrandMemoryPayload
  meta: BrandFieldMetaMap | undefined
}

function guess(metaKind: FieldMeta['kind']): FieldMeta {
  return { kind: metaKind, confirmed: false, source: SOURCE_MODEL }
}

function confirmedByOwner(metaKind: FieldMeta['kind']): FieldMeta {
  return { kind: metaKind, confirmed: true, source: SOURCE_OWNER }
}

/**
 * Stamp per-field provenance onto the version about to be written.
 *
 * THE TWO RULES, which used to be emergent and are now stated.
 *
 * When provenance was derived by diffing the version history, two behaviours fell
 * out of "last CHANGED wins" for free, and both were right:
 *
 *   · a regenerate that returns the SAME text for a confirmed field leaves the
 *     confirmation standing — the model agreeing with you is not grounds to
 *     demote your answer to a guess;
 *   · a regenerate that returns DIFFERENT text reverts the field to a guess —
 *     what is on screen is now the model's sentence, not yours, and the ring must
 *     stop claiming otherwise.
 *
 * Reading a stored flag instead of a diff does not preserve them by accident, so
 * the two branches below ARE those rules and nothing else. Losing them would mean
 * either a regenerate wiping every confirmation a user had made, or confirmations
 * surviving text they never agreed to — the second being the fake-confirmation
 * state the whole contract exists to prevent.
 *
 * CONFIRMATION IS NEVER INFERRED FROM A DIFF HERE, and that is deliberate. An
 * earlier draft of this treated "changed while saving as `manual`" as authorship,
 * which is true for a single-field edit and badly wrong for the onboarding save:
 * a fresh resolve differs from the previous brain in nearly every field, and with
 * no previous brain at all it differs in all fifteen — so pressing Finish would
 * have marked the whole brain confirmed. A caller that knows a person wrote
 * something says so by naming the path.
 */
export function nextFieldMeta(
  previous: PreviousBrain | null,
  next: BrandMemoryPayload,
  /**
   * The COMPLETE set of fields this write confirms. Only paths in `BRAIN_FIELDS`
   * are honoured — the loop never visits anything else, so an unknown path cannot
   * invent a field.
   *
   * Confirming a guess verbatim is the interaction the version-diffing design
   * could not express at all: the value does not change, so no value-diff can
   * detect it, and a user who simply agrees with what they read had to retype it
   * to be counted. Naming the path decouples the confirmation from the text.
   */
  confirmPaths: readonly string[] = [],
): BrandFieldMetaMap {
  const meta: BrandFieldMetaMap = {}
  const priorMeta = previous?.meta
  const confirming = new Set(confirmPaths)

  for (const field of BRAIN_FIELDS) {
    if (confirming.has(field.path)) {
      meta[field.path] = confirmedByOwner(field.metaKind)
      continue
    }

    const prior = priorMeta?.[field.path]
    const unchanged =
      previous !== null &&
      leavesEqual(readLeaf(previous.payload, field.path), readLeaf(next, field.path))

    // Rule 1 above when both hold; rule 2 in every other case. A field nobody had
    // confirmed stays a guess either way.
    meta[field.path] = prior?.confirmed === true && unchanged ? prior : guess(field.metaKind)
  }

  return meta
}
