import type { StudioDesign } from '@sahoda/shared'

/**
 * Return shapes for the studio actions.
 *
 * Lives outside the `'use server'` module because such a file may export only
 * async functions: re-exporting a type from one makes Turbopack dev emit a
 * runtime `ReferenceError` that 500s every route importing the action. Same
 * reason `lib/assets/state.ts` exists.
 */

export type SaveDesignState = { ok: true; design: StudioDesign } | { ok: false; message: string }

/**
 * Deleting a design.
 *
 * Two outcomes rather than three, and the difference from `DeleteAssetState` is
 * the point: deleting a design cascades NOTHING. Any picture it exported is a
 * row in `assets` with its own bytes, and it is untouched. There is no usage
 * gate to run, so there is no `needs-confirm` arm to model, and inventing one
 * would be a warning about a consequence that does not exist.
 */
export type DeleteDesignState = { ok: true } | { ok: false; message: string }

/**
 * Exporting a design into the assets library.
 *
 * ── THREE SUCCESSES, NOT ONE ────────────────────────────────────────────────
 * `stored` is the first press. `already` is a second press of an unchanged
 * design, which is not a failure and must not be shown as one: the renderer is
 * deterministic, so the picture is genuinely already there. `in-trash` is the
 * same bytes sitting in the trash, where restoring is the remedy that works and
 * exporting again would store a second copy of the same file.
 *
 * All three carry the asset, so the screen can point at the file rather than
 * only describing it. `export-copy.ts` writes the sentences and argues the
 * distinction at length.
 */
export type ExportDesignState =
  | { ok: true; outcome: 'stored' | 'already' | 'in-trash'; assetId: string; message: string }
  | { ok: false; message: string }

/**
 * A picture handed to the editor's preview.
 *
 * The BYTES, not an address: the preview renders the same SVG the export will,
 * and `svg.ts` refuses any href that is not a data URI. So the editor cannot be
 * given a signed URL here even though the picker beside it uses one. The two
 * are different jobs and this is the one that has to match the export.
 */
export type DesignPhotoState = { ok: true; dataUri: string } | { ok: false; message: string }

/**
 * Exporting every slide of a carousel.
 *
 * `ok: true` with failures inside it, and that is the honest shape rather than a
 * looser one: four slides in the library and one that would not draw is a
 * SUCCESS for four files and a failure for one, and a single boolean cannot say
 * that. The per-slide list is what lets the screen name which is which.
 */
export type ExportPagesState =
  | { ok: true; pages: import('./export-copy').PageExport[]; message: string }
  | { ok: false; message: string }

/**
 * Keeping a design as a starting point, or putting it back.
 *
 * Carries the design so the editor can redraw from the row rather than assume
 * the write did what it asked for. `isTemplate` is the value that ACTUALLY
 * landed, which is the only one worth showing a toggle.
 */
export type TemplateFlagState =
  { ok: true; isTemplate: boolean; message: string } | { ok: false; message: string }
