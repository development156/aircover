import type { StudioGeneration } from '@sahoda/shared'

import type { ComposerInitialValues } from '@/components/studio/composer'
import type { RemixLineage } from '@/lib/studio/remix-lineage'

/**
 * THE COMPOSER, PREFILLED FROM A ROW RATHER THAN FROM NOTHING.
 *
 * Every field the row actually recorded, and nothing invented for the ones it
 * did not. `count` is deliberately absent: the bar's own default of one try is
 * the right start for "change this one picture", not the batch size the
 * ORIGINAL press happened to ask for — a person remixing a single result is
 * not asking for four more by default.
 *
 * Pure: no I/O, no clock, no database, no React.
 */
export function initialValuesFromGeneration(
  generation: StudioGeneration,
  lineage: RemixLineage,
): ComposerInitialValues {
  const values: ComposerInitialValues = {
    wanted: generation.prompt_given,
    mode: generation.mode,
    referenceAssetIds: generation.reference_asset_ids,
  }

  if (generation.format_id !== null) values.formatId = generation.format_id
  if (generation.model_id !== null) values.modelId = generation.model_id

  // Only when a press actually recorded what it asked the logo to do. Absent
  // otherwise, so the bar falls back to `DEFAULT_STAMP_OPTIONS` rather than a
  // guessed corner presented as this picture's own.
  if (lineage.columnsApplied && lineage.stamp !== null) values.stamp = lineage.stamp

  return values
}
