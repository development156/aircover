'use server'

import { revalidatePath } from 'next/cache'
import { AssetSmartFolderSchema, SmartQuerySchema, normalizeFolderName } from '@sahoda/shared'

import {
  NAME_REQUIRED,
  REFUSED_GENERIC,
  UNIQUE_VIOLATION,
  collidingSibling,
  duplicateOf,
  failed,
  invalid,
  openFolderWrite,
  readSmartNames,
} from '@/lib/assets/folder-writes'
import type { DeleteSmartFolderState, SmartFolderState } from '@/lib/assets/folder-state'
import { reportServerError } from '@/lib/observability/report'

/**
 * Smart folders — a saved question, written and rewritten.
 *
 * Split from `asset-folders.ts` only because both files must stay under 300
 * lines; the contract is the same one, and the shared plumbing is in
 * `lib/assets/folder-writes.ts`.
 *
 * ── THE QUERY IS PARSED BEFORE IT IS STORED. EVERY TIME ──────────────────────
 * `query` is a jsonb column, so Postgres accepts any shape at all and these
 * parses are the only gate on the way in. A shape that will not parse on the way
 * OUT comes back from `readFolderTree` as a dropped folder — a folder the person
 * made and can never open, deliberately, because the alternative is answering a
 * different question under the name they gave the old one. Refusing here is the
 * only place that can be prevented rather than reported.
 *
 * ── AND NOTHING HERE HOLDS A FILE ────────────────────────────────────────────
 * A smart folder has no membership table. Deleting one forgets a question; it
 * does not unfile, move or delete anything.
 */

/** Save a question as a smart folder. */
export async function createSmartFolder(name: string, query: unknown): Promise<SmartFolderState> {
  try {
    const open = await openFolderWrite()
    if (!open.ok) return failed(open.message)
    const ctx = open.ctx

    const clean = normalizeFolderName(name)
    if (clean === null) return invalid(NAME_REQUIRED)

    const parsedQuery = SmartQuerySchema.safeParse(query)
    if (!parsedQuery.success) return invalid('Sahoda could not read those rules.')

    const existing = await readSmartNames(ctx)
    if (existing === null) return failed()
    const clash = collidingSibling(existing, clean)
    if (clash) return duplicateOf(clash.id, clash.name)

    const { data, error } = await ctx.supabase
      .from('asset_smart_folders')
      .insert({
        workspace_id: ctx.workspaceId,
        name: clean,
        query: parsedQuery.data,
        created_by: ctx.userId,
      })
      .select('*')
      .single()

    if (error) {
      // The same race `createFolder` documents at length: the name was free when
      // it was read and another tab took it before this insert. The folder the
      // person wanted exists, so the answer is `duplicate` with its id, not a
      // failure — and `failed` only when the re-read cannot produce that id.
      if (error.code === UNIQUE_VIOLATION) {
        const again = await readSmartNames(ctx)
        const raced = again === null ? undefined : collidingSibling(again, clean)
        return raced ? duplicateOf(raced.id, raced.name) : failed()
      }
      return failed()
    }

    const parsed = AssetSmartFolderSchema.safeParse(data)
    if (!parsed.success) return failed('Saved it, but the response was unreadable. Reload.')

    revalidatePath('/assets')
    return { ok: true, folder: parsed.data }
  } catch (error) {
    reportServerError(error, { action: 'createSmartFolder' })
    return failed()
  }
}

/** Change a smart folder's name, its question, or both. */
export async function updateSmartFolder(
  id: string,
  name: string,
  query: unknown,
): Promise<SmartFolderState> {
  try {
    const open = await openFolderWrite()
    if (!open.ok) return failed(open.message)
    const ctx = open.ctx

    const clean = normalizeFolderName(name)
    if (clean === null) return invalid(NAME_REQUIRED)

    const parsedQuery = SmartQuerySchema.safeParse(query)
    if (!parsedQuery.success) return invalid('Sahoda could not read those rules.')

    const existing = await readSmartNames(ctx)
    if (existing === null) return failed()
    const clash = collidingSibling(existing, clean, id)
    if (clash) return duplicateOf(clash.id, clash.name)

    const { data, error } = await ctx.supabase
      .from('asset_smart_folders')
      .update({ name: clean, query: parsedQuery.data })
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .select('*')
      .maybeSingle()

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        const again = await readSmartNames(ctx)
        const raced = again === null ? undefined : collidingSibling(again, clean, id)
        return raced ? duplicateOf(raced.id, raced.name) : failed()
      }
      return failed()
    }
    if (!data) return failed('That folder is no longer here.')

    const parsed = AssetSmartFolderSchema.safeParse(data)
    if (!parsed.success) return failed('Saved it, but the response was unreadable. Reload.')

    revalidatePath('/assets')
    return { ok: true, folder: parsed.data }
  } catch (error) {
    reportServerError(error, { action: 'updateSmartFolder' })
    return failed()
  }
}

/** Forget a saved question. Nothing it listed is touched: it held nothing. */
export async function deleteSmartFolder(id: string): Promise<DeleteSmartFolderState> {
  try {
    const open = await openFolderWrite()
    if (!open.ok) return { ok: false, reason: 'failed', message: open.message }
    const ctx = open.ctx

    const { error } = await ctx.supabase
      .from('asset_smart_folders')
      .delete()
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
    if (error) return { ok: false, reason: 'failed', message: REFUSED_GENERIC }

    revalidatePath('/assets')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'deleteSmartFolder' })
    return { ok: false, reason: 'failed', message: REFUSED_GENERIC }
  }
}
