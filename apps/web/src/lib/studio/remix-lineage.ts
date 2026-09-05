import {
  StampAnchorSchema,
  StampSizeStepSchema,
  type StampAnchor,
  type StampSizeStep,
} from '@sahoda/shared'
import { z } from 'zod'

/**
 * WHAT A GENERATION KNOWS ABOUT ITS OWN LINEAGE, AND WHETHER IT COULD KNOW AT ALL.
 *
 * ── THE MIGRATION THIS READS, AND WHY IT MAY NOT BE THERE ───────────────────
 * `remixed_from`, `stamp_enabled`, `stamp_anchor` and `stamp_size_step` all come
 * from ONE migration (`20260904140000`), which is written and waiting on a
 * person with `supabase db push`. Until it is applied, none of the four columns
 * exist, and a `select` naming them fails with Postgres code `42703` — the same
 * degradation `stampAnchorFromImageRow` and `queueGeneration`'s own image insert
 * already handle for the sibling migration that added `stamped_anchor`.
 *
 * `columnsApplied` is decided by the CALLER, from whether that `42703` actually
 * happened on this request, not guessed from the row's own shape: a row can
 * legitimately carry `remixed_from: null` once the column exists (this press
 * stands on its own), and that must read exactly like "not recorded" reads
 * before the migration lands. Both are "no lineage", and the screen's remedy is
 * the same either way (no version toggle no-ops, no version strip invents a
 * group of one) — see `viewer-read.ts` for the query that decides it.
 *
 * Pure: no I/O, no clock, no database.
 */
export type RemixLineage =
  | { columnsApplied: false }
  | {
      columnsApplied: true
      /** The generation this one was made as a version of, or null: stands on its own. */
      remixedFrom: string | null
      /**
       * What the customer asked the logo to do on this press, or null when it
       * was never recorded (every press made before `apps/web` writes these
       * columns, which as of this file is every press that has ever run).
       */
      stamp: { enabled: boolean; anchor: StampAnchor; sizeStep: StampSizeStep } | null
    }

const RemixColumnsSchema = z.object({
  remixed_from: z.uuid().nullish(),
  stamp_enabled: z.boolean().nullish(),
  stamp_anchor: StampAnchorSchema.nullish(),
  stamp_size_step: StampSizeStepSchema.nullish(),
})

/**
 * Turn a raw `studio_generations` row into what the screen may say about its
 * lineage, given whether the query that fetched it actually reached the columns.
 *
 * `columnsApplied: false` short-circuits before parsing: a row read WITHOUT
 * asking for the four columns never carries them, asking would be pointless,
 * and the only honest answer is "not available", never a guessed value.
 */
export function remixLineageFromRow(row: unknown, columnsApplied: boolean): RemixLineage {
  if (!columnsApplied) return { columnsApplied: false }

  const parsed = RemixColumnsSchema.safeParse(row)
  // The columns were reachable but this particular row would not parse as any
  // of them — treated the same as "not applied" rather than thrown, because a
  // malformed lineage on one row must cost that row's remix control, not the
  // whole screen.
  if (!parsed.success) return { columnsApplied: false }

  const { remixed_from, stamp_enabled, stamp_anchor, stamp_size_step } = parsed.data

  // All three or none: a press either recorded what it asked the logo to do or
  // it did not, and a partial record (one of three fields set) is not a state
  // this schema can produce, so it is read the same as "not recorded" rather
  // than guessed into a complete answer.
  const stamp =
    stamp_enabled == null || stamp_anchor == null || stamp_size_step == null
      ? null
      : { enabled: stamp_enabled, anchor: stamp_anchor, sizeStep: stamp_size_step }

  return { columnsApplied: true, remixedFrom: remixed_from ?? null, stamp }
}
