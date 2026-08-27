'use server'

import { revalidatePath } from 'next/cache'
import {
  AssetFolderSchema,
  canMoveFolder,
  descendantIds,
  normalizeFolderName,
} from '@sahoda/shared'

import {
  NAME_REQUIRED,
  UNIQUE_VIOLATION,
  collidingSibling,
  countItems,
  duplicateOf,
  failed,
  invalid,
  openFolderWrite,
  readFolderNodes,
  readSiblings,
} from '@/lib/assets/folder-writes'
import type {
  CreateFolderState,
  DeleteFolderState,
  MoveFolderState,
  RenameFolderState,
} from '@/lib/assets/folder-state'
import { reportServerError } from '@/lib/observability/report'

/**
 * The folder system's writes. Membership is in `asset-folder-items.ts` and smart
 * folders in `asset-smart-folders.ts`; both are split off only to keep every file
 * under 300 lines.
 *
 * ── NOTHING HERE DELETES A FILE, AND NOTHING HERE CAN ────────────────────────
 * Folders and membership rows are the only things these actions touch. The one
 * path that removes bytes is `deleteAsset`, which goes through the usage gate and
 * the `delete_asset` transaction. Every refusal and every count below is about
 * where a file is FILED, never about whether it exists.
 *
 * ── THE CHECKS HERE ARE THE LEGIBLE ONES, NOT THE REAL ONES ──────────────────
 * The database holds the cycle trigger and the unique index. Those are the gate.
 * What these functions add is a refusal that arrives as a SENTENCE — "you already
 * have a folder called Diwali here", with the id of that folder — instead of a
 * SQLSTATE the screen has to guess at. Both layers stay.
 */

/** Make a folder, at the root or inside another. */
export async function createFolder(
  name: string,
  parentId: string | null,
): Promise<CreateFolderState> {
  try {
    const open = await openFolderWrite()
    if (!open.ok) return failed(open.message)
    const ctx = open.ctx

    const clean = normalizeFolderName(name)
    if (clean === null) return invalid(NAME_REQUIRED)

    const siblings = await readSiblings(ctx, parentId)
    // A read that failed cannot say whether the name is taken, and inserting on
    // "we could not check" is how the duplicate arrives as a SQLSTATE instead of
    // a sentence. Refuse rather than guess.
    if (siblings === null) return failed()

    const clash = collidingSibling(siblings, clean)
    if (clash) return duplicateOf(clash.id, clash.name)

    const { data, error } = await ctx.supabase
      .from('asset_folders')
      .insert({
        workspace_id: ctx.workspaceId,
        parent_id: parentId,
        name: clean,
        created_by: ctx.userId,
      })
      .select('*')
      .single()

    if (error) {
      // ── THE RACE, EXPLICITLY ────────────────────────────────────────────────
      // Between the sibling read above and this insert, another tab (or another
      // person in the workspace) can create the same folder. The read said the
      // name was free and by now it is not, so the unique index refuses. That is
      // not a failure to report as one: the folder the person wanted EXISTS, and
      // the recovery is to open it. So re-read the siblings and answer with the
      // same `duplicate` the fast path would have given.
      //
      // If the re-read also fails there is no id to hand back, and `duplicate`
      // without `existingId` is not a shape this contract has — so it is
      // `failed`, honestly.
      if (error.code === UNIQUE_VIOLATION) {
        const again = await readSiblings(ctx, parentId)
        const raced = again === null ? undefined : collidingSibling(again, clean)
        return raced ? duplicateOf(raced.id, raced.name) : failed()
      }
      return failed()
    }

    const parsed = AssetFolderSchema.safeParse(data)
    if (!parsed.success) return failed('Made the folder, but the response was unreadable. Reload.')

    revalidatePath('/assets')
    return { ok: true, folder: parsed.data }
  } catch (error) {
    reportServerError(error, { action: 'createFolder' })
    return failed()
  }
}

/** Rename a folder. Its contents and its place do not move. */
export async function renameFolder(id: string, name: string): Promise<RenameFolderState> {
  try {
    const open = await openFolderWrite()
    if (!open.ok) return failed(open.message)
    const ctx = open.ctx

    const clean = normalizeFolderName(name)
    if (clean === null) return invalid(NAME_REQUIRED)

    const nodes = await readFolderNodes(ctx)
    if (nodes === null) return failed()
    const folder = nodes.find((node) => node.id === id)
    if (!folder) {
      return { ok: false, reason: 'missing', message: 'That folder is no longer here.' }
    }

    // Siblings from the tree already read, so this is not a second round trip.
    // Itself excluded: changing "diwali" to "Diwali" is a rename, not a clash.
    const siblings = nodes.filter((node) => node.parent_id === folder.parent_id)
    const clash = collidingSibling(siblings, clean, id)
    if (clash) return duplicateOf(clash.id, clash.name)

    const { data, error } = await ctx.supabase
      .from('asset_folders')
      .update({ name: clean })
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .select('*')
      .maybeSingle()

    if (error) {
      // Same race as `createFolder`: the name was free when the tree was read.
      if (error.code === UNIQUE_VIOLATION) {
        const again = await readSiblings(ctx, folder.parent_id)
        const raced = again === null ? undefined : collidingSibling(again, clean, id)
        return raced ? duplicateOf(raced.id, raced.name) : failed()
      }
      return failed()
    }
    if (!data) return { ok: false, reason: 'missing', message: 'That folder is no longer here.' }

    const parsed = AssetFolderSchema.safeParse(data)
    if (!parsed.success) return failed('Renamed it, but the response was unreadable. Reload.')

    revalidatePath('/assets')
    return { ok: true, folder: parsed.data }
  } catch (error) {
    reportServerError(error, { action: 'renameFolder' })
    return failed()
  }
}

/** Move a folder somewhere else. `null` puts it back at the root. */
export async function moveFolder(id: string, newParentId: string | null): Promise<MoveFolderState> {
  try {
    const open = await openFolderWrite()
    if (!open.ok) return failed(open.message)
    const ctx = open.ctx

    const nodes = await readFolderNodes(ctx)
    if (nodes === null) return failed()

    // ── THE SQL TRIGGER IS THE REAL GATE. THIS IS THE FAST, LEGIBLE ONE ───────
    // `asset_folders` carries a trigger that refuses a cycle inside the
    // transaction, and it is the thing that cannot be raced. What this adds is
    // that the refusal arrives before the drop animation finishes, and that it
    // arrives as one of four NAMED decisions the screen behaves differently for
    // rather than as a SQLSTATE. Two of them mean the drag was impossible; the
    // `missing` one means the view is stale and a reload is the remedy.
    const decision = canMoveFolder(nodes, id, newParentId)
    if (!decision.ok) return { ok: false, reason: 'refused', decision }

    const { error } = await ctx.supabase
      .from('asset_folders')
      .update({ parent_id: newParentId })
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)

    // A unique violation here means the destination already holds a folder of
    // this name. `MoveFolderState` has no `duplicate` arm, so it refuses with a
    // sentence naming which of the two facts is in the way.
    if (error) {
      return error.code === UNIQUE_VIOLATION
        ? failed('That folder already holds a folder with this name. Rename one of them first.')
        : failed()
    }

    revalidatePath('/assets')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'moveFolder' })
    return failed()
  }
}

/**
 * Delete a folder.
 *
 * The counts are what make the confirmation worth reading: how many files stop
 * being filed here and how many sub-folders go with it. Both are read, not
 * guessed, and NEITHER is a count of files being deleted — no file is deleted on
 * this path, and the sentence says so, because "Delete folder" over a grid of
 * photos reads as destructive.
 */
export async function deleteFolder(id: string, confirmed = false): Promise<DeleteFolderState> {
  try {
    const open = await openFolderWrite()
    if (!open.ok) return failed(open.message)
    const ctx = open.ctx

    const nodes = await readFolderNodes(ctx)
    if (nodes === null) return failed()
    if (!nodes.some((node) => node.id === id)) {
      return { ok: false, reason: 'missing', message: 'That folder is no longer here.' }
    }

    // Descendants go with it, so their membership rows are part of the count the
    // person is being asked about. Counting only the folder itself would show
    // "0 files" over a branch holding forty.
    const descendants = [...descendantIds(nodes, id)]
    const files = await countItems(ctx, [id, ...descendants])
    if (files === null) return failed()

    if (!confirmed && (files > 0 || descendants.length > 0)) {
      return {
        ok: false,
        reason: 'needs-confirm',
        message:
          'Deleting this folder takes away the folder, not the photos. Every file stays in your library.',
        files,
        subfolders: descendants.length,
      }
    }

    // The sub-folders and the membership rows go by cascade, inside one
    // transaction. Deleting them from here in three statements would leave a
    // half-deleted branch behind the moment one of them failed.
    const { error } = await ctx.supabase
      .from('asset_folders')
      .delete()
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
    if (error) return failed()

    revalidatePath('/assets')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'deleteFolder' })
    return failed()
  }
}
