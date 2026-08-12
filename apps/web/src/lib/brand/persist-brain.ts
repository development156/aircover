import type { BrandMemoryPayload } from '@sahoda/shared'

import type { SaveBrandState } from '@/app/actions/brand-resolve'

import { BRAIN_FIELDS } from './fields'
import { leavesEqual, readLeaf } from './leaf'

/** `saveBrandMemory`, injected so this can be tested without a server round trip. */
export type SaveBrain = (
  brain: BrandMemoryPayload,
  source: 'resolved' | 'manual',
  confirmPaths?: readonly string[],
) => Promise<SaveBrandState>

/**
 * Persist what the model said AND what the user made of it — in ONE version.
 *
 * This used to write two: the model's output as `resolved`, then the user's as
 * `manual`, so that diffing the pair yielded exactly the set of fields a person
 * had touched. That was the only way to record authorship when `brand_memory`
 * stored values and nothing else, and it cost a wasted version on every setup
 * plus a fallback path for when the first of the two writes failed.
 *
 * `field_meta` records authorship directly, so the pair is no longer evidence of
 * anything. One write, naming the fields the user actually edited — which is the
 * same set the diff used to recover, established here instead of reconstructed
 * later.
 *
 * With no baseline there is nothing to compare against, so nothing is claimed as
 * confirmed: the values are saved and every field reads as the guess it is.
 * Under-claiming is the right direction to fail — the opposite marks fifteen
 * fields confirmed because someone pressed Finish.
 */
export async function persistBrainVersions(
  save: SaveBrain,
  baseline: BrandMemoryPayload | null,
  edited: BrandMemoryPayload,
): Promise<SaveBrandState> {
  if (!baseline) return save(edited, 'resolved')

  const touched = BRAIN_FIELDS.filter(
    (field) => !leavesEqual(readLeaf(baseline, field.path), readLeaf(edited, field.path)),
  ).map((field) => field.path)

  // Nothing was edited: the brain on screen is the model's, unchanged. Saving it
  // as `manual` would claim the user confirmed every field by pressing Finish.
  if (touched.length === 0) return save(edited, 'resolved')

  return save(edited, 'manual', touched)
}
