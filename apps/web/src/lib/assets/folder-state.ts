import type { AssetFolder, AssetSmartFolder, FolderMoveDecision } from '@sahoda/shared'

/**
 * Return shapes for the folder actions.
 *
 * Lives outside the `'use server'` module for the reason `state.ts` gives: such a
 * file may export only async functions, and re-exporting a type from one makes
 * Turbopack dev emit a runtime `ReferenceError` that 500s every route importing
 * the action.
 */

/**
 * ── WHY `duplicate` IS ITS OWN OUTCOME AND NOT A MESSAGE ─────────────────────
 * "You already have a folder called Diwali here" is the one refusal a person can
 * act on without reading anything else: the folder they wanted exists, and the
 * screen can take them to it. Collapsing it into a generic failure string turns a
 * one-click recovery into a retry loop.
 */
export type CreateFolderState =
  | { ok: true; folder: AssetFolder }
  | { ok: false; reason: 'duplicate'; message: string; existingId: string }
  | { ok: false; reason: 'invalid'; message: string }
  | { ok: false; reason: 'failed'; message: string }

export type RenameFolderState =
  | { ok: true; folder: AssetFolder }
  | { ok: false; reason: 'duplicate'; message: string; existingId: string }
  | { ok: false; reason: 'invalid'; message: string }
  | { ok: false; reason: 'missing'; message: string }
  | { ok: false; reason: 'failed'; message: string }

/**
 * A move refusal carries the DECISION, not a flattened string.
 *
 * `canMoveFolder` distinguishes a cycle from a depth limit from a folder that has
 * gone, and the screen behaves differently for each: two are the person's drag
 * being impossible, the third is their view being stale and needing a reload.
 */
export type MoveFolderState =
  | { ok: true }
  | { ok: false; reason: 'refused'; decision: Extract<FolderMoveDecision, { ok: false }> }
  | { ok: false; reason: 'failed'; message: string }

/**
 * Filing files is COUNTED, not booleaned, and the two numbers are separate.
 *
 * A bulk file of nine photos where two were already in that folder must not
 * report "9 added" — the person would look for nine new tiles and find seven.
 * `alreadyThere` is a success, not a failure, so it does not belong in the
 * error branch either.
 */
export type FileAssetsState =
  | { ok: true; added: number; alreadyThere: number }
  | { ok: false; reason: 'missing'; message: string }
  | { ok: false; reason: 'failed'; message: string }

/**
 * Removing files from a folder.
 *
 * `removed` counts membership rows deleted. It is NEVER a count of files
 * deleted, and nothing on this path can delete a file: that is `deleteAsset`
 * and it goes through the usage gate. The copy has to say so, because "Remove"
 * next to a photo reads as destructive.
 */
export type UnfileAssetsState =
  { ok: true; removed: number } | { ok: false; reason: 'failed'; message: string }

/**
 * Deleting a folder.
 *
 * `needs-confirm` is the outcome a boolean could not carry, and it is here for
 * the same reason `DeleteAssetState` has one: a folder with things in it can go,
 * but the person must be shown what is inside first. The counts are the two
 * facts that decide it — how many files stop being filed here, and how many
 * sub-folders go with it.
 */
export type DeleteFolderState =
  | { ok: true }
  | {
      ok: false
      reason: 'needs-confirm'
      message: string
      /** Membership rows that would go. The FILES all survive. */
      files: number
      /** Folders nested inside this one, at any depth. */
      subfolders: number
    }
  | { ok: false; reason: 'missing'; message: string }
  | { ok: false; reason: 'failed'; message: string }

export type SmartFolderState =
  | { ok: true; folder: AssetSmartFolder }
  | { ok: false; reason: 'duplicate'; message: string; existingId: string }
  | { ok: false; reason: 'invalid'; message: string }
  | { ok: false; reason: 'failed'; message: string }

export type DeleteSmartFolderState = { ok: true } | { ok: false; reason: 'failed'; message: string }
