'use server'

import { revalidatePath } from 'next/cache'

import {
  FOREIGN_KEY_VIOLATION,
  MAX_FILE_BATCH,
  REFUSED_GENERIC,
  failed,
  openFolderWrite,
} from '@/lib/assets/folder-writes'
import type { FileAssetsState, UnfileAssetsState } from '@/lib/assets/folder-state'
import { reportServerError } from '@/lib/observability/report'

/**
 * Membership: which files are filed in which folder.
 *
 * Split from `asset-folders.ts` only because both files must stay under 300
 * lines. `asset_folder_items` is the ONLY table either function touches, and
 * that is the load-bearing fact about this whole module: a file may be filed in
 * several folders, so membership is a table and not a `folder_id` column, and
 * nothing on this path can remove a file from the library.
 */

/**
 * File files into a folder, in bulk.
 *
 * ── THE TWO NUMBERS ARE SEPARATE BECAUSE THE SCREEN COUNTS TILES ─────────────
 * Filing nine photos where two were already there must not report "9 added": the
 * person would look for nine new tiles and find seven. `alreadyThere` is a
 * success, so it is on the ok arm.
 *
 * The insert ignores conflicts rather than erroring, so a partial overlap is a
 * normal outcome and not a failure. PostgREST returns only the rows it actually
 * inserted, which is what makes `added` a measurement rather than an assumption —
 * and it stays correct when another tab files the same photo mid-call.
 */
export async function fileAssets(folderId: string, assetIds: string[]): Promise<FileAssetsState> {
  try {
    const open = await openFolderWrite()
    if (!open.ok) return failed(open.message)
    const ctx = open.ctx

    const wanted = [...new Set(assetIds.filter((id) => typeof id === 'string' && id !== ''))]
    if (wanted.length === 0) return { ok: true, added: 0, alreadyThere: 0 }
    if (wanted.length > MAX_FILE_BATCH) {
      return failed(`Sahoda files up to ${MAX_FILE_BATCH} files at a time. Select fewer.`)
    }

    const { data, error } = await ctx.supabase
      .from('asset_folder_items')
      .upsert(
        wanted.map((assetId) => ({
          workspace_id: ctx.workspaceId,
          folder_id: folderId,
          asset_id: assetId,
          added_by: ctx.userId,
        })),
        { onConflict: 'workspace_id,folder_id,asset_id', ignoreDuplicates: true },
      )
      .select('asset_id')

    if (error) {
      // The folder or one of the files is gone. Distinct from a generic failure
      // because the remedy is a reload, not a retry.
      if (error.code === FOREIGN_KEY_VIOLATION) {
        return { ok: false, reason: 'missing', message: 'That folder is no longer here.' }
      }
      return failed()
    }
    if (!data) return failed()

    const added = data.length
    revalidatePath('/assets')
    return { ok: true, added, alreadyThere: wanted.length - added }
  } catch (error) {
    reportServerError(error, { action: 'fileAssets' })
    return failed()
  }
}

/**
 * Take files out of a folder.
 *
 * ── THIS DELETES NO FILE. IT DELETES MEMBERSHIP ROWS ─────────────────────────
 * The only table touched is `asset_folder_items`. `assets` is not read here, not
 * written here, and no storage object is removed here. A photo taken out of
 * "Diwali campaign" is still in the library and still in every other folder it
 * was filed in — which is the whole reason membership is its own table rather
 * than a `folder_id` column on the file.
 *
 * `removed` is therefore a count of ROWS, never a count of files deleted, and the
 * copy above the button has to say which.
 */
export async function unfileAssets(
  folderId: string,
  assetIds: string[],
): Promise<UnfileAssetsState> {
  try {
    const open = await openFolderWrite()
    if (!open.ok) return { ok: false, reason: 'failed', message: open.message }
    const ctx = open.ctx

    const wanted = [...new Set(assetIds.filter((id) => typeof id === 'string' && id !== ''))]
    if (wanted.length === 0) return { ok: true, removed: 0 }

    const { data, error } = await ctx.supabase
      .from('asset_folder_items')
      .delete()
      .eq('workspace_id', ctx.workspaceId)
      .eq('folder_id', folderId)
      .in('asset_id', wanted)
      .select('asset_id')

    if (error || !data) return { ok: false, reason: 'failed', message: REFUSED_GENERIC }

    revalidatePath('/assets')
    return { ok: true, removed: data.length }
  } catch (error) {
    reportServerError(error, { action: 'unfileAssets' })
    return { ok: false, reason: 'failed', message: REFUSED_GENERIC }
  }
}
