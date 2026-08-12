import type { BrandMemoryPayload } from '@sahoda/shared'

import type { SaveBrandState } from '@/app/actions/brand-resolve'

import { hasEdits } from './provenance'

/** `saveBrandMemory`, injected so this can be tested without a server round trip. */
export type SaveBrain = (
  brain: BrandMemoryPayload,
  source: 'resolved' | 'manual',
) => Promise<SaveBrandState>

/**
 * Persist what the model said AND what the user made of it.
 *
 * `brand_memory` stores values, not authorship, so per-field provenance is
 * recovered by diffing versions and reading the source of the one where each
 * field last changed. A single combined save cannot carry that:
 *
 *   · written as `resolved`, the user's own corrections come back to them as
 *     machine guesses;
 *   · written as `manual`, all fifteen fields read confirmed when they edited
 *     three.
 *
 * Two versions — the model's output, then theirs — make the diff exactly the set
 * of fields a person touched.
 *
 * Both halves go through the same save, so both are pruned identically. Saving an
 * unpruned baseline against a pruned edit would report the two open-ended lists
 * as changed and manufacture a confirmation nobody made.
 */
export async function persistBrainVersions(
  save: SaveBrain,
  baseline: BrandMemoryPayload | null,
  edited: BrandMemoryPayload,
): Promise<SaveBrandState> {
  // Nothing was edited: one version, and it is the model's. A `manual` twin here
  // would claim the user confirmed every field by pressing Finish.
  if (!baseline || !hasEdits(baseline, edited)) return save(edited, 'resolved')

  const base = await save(baseline, 'resolved')

  // With no baseline version there is nothing to diff against, and a lone
  // `manual` version marks EVERY field confirmed. Under-claim instead: save the
  // user's brain as `resolved`, losing this session's confirmations rather than
  // inventing a dozen more. Either way the values they typed are saved.
  if (!base.ok) return save(edited, 'resolved')

  return save(edited, 'manual')
}
