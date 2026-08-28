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
