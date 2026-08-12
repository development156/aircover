import type { BrandMemoryPayload } from '@sahoda/shared'

import { BRAIN_FIELDS } from './fields'
import { leavesEqual, readLeaf } from './leaf'

/**
 * Which registered fields a person changed between the model's answer and the
 * one they are approving.
 *
 * This is the whole of what `persistBrainVersions` used to exist for. That
 * function wrote TWO `brand_memory` versions — the model's, then the user's — so
 * that diffing the pair recovered who wrote what. `field_meta` records authorship
 * directly, so the second write is gone and only the diff survives, as a pure
 * function the reveal can call before its single save.
 *
 * `alignment.*` is outside `BRAIN_FIELDS` and therefore never counted: the model
 * recomputes `signal_lock` on every resolve, and reading that as a human edit
 * would claim a confirmation off the model's own work.
 *
 * With no baseline, nothing is claimed. Under-claiming is the right direction to
 * fail here — the opposite marks fifteen fields confirmed because someone pressed
 * Approve.
 */
export function editedPaths(
  baseline: BrandMemoryPayload | null,
  edited: BrandMemoryPayload,
): string[] {
  if (!baseline) return []
  return BRAIN_FIELDS.filter(
    (field) => !leavesEqual(readLeaf(baseline, field.path), readLeaf(edited, field.path)),
  ).map((field) => field.path)
}
