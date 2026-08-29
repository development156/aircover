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
