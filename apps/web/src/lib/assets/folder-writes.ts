import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { sameFolderName } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * The plumbing the folder actions share.
 *
 * It lives HERE and not in `app/actions/asset-folders.ts` because a `'use server'`
 * module may export only async functions — `use-server-exports.test.ts` is the
 * guard, and `next build` was previously the only thing that said so. Constants
 * and synchronous helpers therefore have to sit outside it.
 */

/**
 * The most files one call may file at once.
 *
 * 200 matches `ASSET_LIST_LIMIT`, which is the most tiles the library can put on
 * screen — so "select all, file them" is always one call and never a partial
 * one. A larger batch would be a single statement long enough to time out, and a
 * timed-out bulk file is the worst outcome here: some rows in, no honest count.
 */
export const MAX_FILE_BATCH = 200

export interface WriteContext {
  userId: string
  workspaceId: string
  supabase: ReturnType<typeof createServerSupabase>
}

/**
 * Signed in, with a workspace to write into, or the sentence to refuse with.
 *
 * The two refusals are kept apart upstream by `workspaceForWrite`: "create a
 * workspace first" is a remedy, and offering it to somebody who already has one
 * is the impossible-remedy defect. This helper just carries its sentence through.
 */
export async function openFolderWrite(): Promise<
  { ok: true; ctx: WriteContext } | { ok: false; message: string }
> {
  const { userId } = await auth()
  if (!userId) return { ok: false, message: 'Sign in to organise your library.' }

  const ws = await workspaceForWrite()
  if (!ws.ok) return { ok: false, message: ws.message }

  return {
    ok: true,
    ctx: { userId, workspaceId: ws.workspace.id, supabase: createServerSupabase() },
  }
}

/** The subset of a folder row the naming and move checks need. */
export interface FolderNode {
  id: string
  parent_id: string | null
  name: string
}

function toNodes(rows: readonly unknown[]): FolderNode[] {
  return rows.flatMap((row) => {
    const id = (row as { id?: unknown }).id
    const name = (row as { name?: unknown }).name
    const parentId = (row as { parent_id?: unknown }).parent_id
    if (typeof id !== 'string' || typeof name !== 'string') return []
    return [{ id, name, parent_id: typeof parentId === 'string' ? parentId : null }]
  })
}

/**
 * Every folder in the workspace, as the flat list the shared tree functions take.
 *
 * Null for a failed read, never an empty list: `canMoveFolder` over an empty list
 * answers `missing` for the folder being dragged, which would tell the person
 * their folder is gone when in fact we could not look.
 */
export async function readFolderNodes(ctx: WriteContext): Promise<FolderNode[] | null> {
  const { data, error } = await ctx.supabase
    .from('asset_folders')
    .select('id, parent_id, name')
    .eq('workspace_id', ctx.workspaceId)
  if (error || !data) return null
  return toNodes(data)
}

/**
 * The folders that sit alongside a new one, so a collision can be named.
 *
 * ── WHY `.is()` AND NOT `.eq()` FOR THE ROOT ─────────────────────────────────
 * `parent_id` is null at the root and `= null` is never true in SQL, so an
 * `.eq('parent_id', null)` would return NOTHING at the root and every root
 * folder collision would slip through to the raw unique violation. This is also
 * the case a naive `unique (workspace_id, parent_id, lower(name))` misses
 * outright, because two nulls are not equal to each other either.
 */
export async function readSiblings(
  ctx: WriteContext,
  parentId: string | null,
): Promise<FolderNode[] | null> {
  const base = ctx.supabase
    .from('asset_folders')
    .select('id, parent_id, name')
    .eq('workspace_id', ctx.workspaceId)
  const query = parentId === null ? base.is('parent_id', null) : base.eq('parent_id', parentId)
  const { data, error } = await query
  if (error || !data) return null
  return toNodes(data)
}

/** Smart folders, for the same name check. They are a flat list with no parent. */
export async function readSmartNames(
  ctx: WriteContext,
): Promise<{ id: string; name: string }[] | null> {
  const { data, error } = await ctx.supabase
    .from('asset_smart_folders')
    .select('id, name')
    .eq('workspace_id', ctx.workspaceId)
  if (error || !data) return null
  return data.flatMap((row) => {
    const id = (row as { id?: unknown }).id
    const name = (row as { name?: unknown }).name
    return typeof id === 'string' && typeof name === 'string' ? [{ id, name }] : []
  })
}

/** Postgres `unique_violation`. The only error code these actions branch on. */
export const UNIQUE_VIOLATION = '23505'
/** Postgres `foreign_key_violation` — the folder or the file went away mid-write. */
export const FOREIGN_KEY_VIOLATION = '23503'

// ── The shapes the folder actions refuse with ────────────────────────────────
/**
 * These live here rather than in the action module for the same reason the rest
 * of this file does: a `'use server'` module may export only async functions.
 */
export const NAME_REQUIRED = 'Give the folder a name.'
export const REFUSED_GENERIC = 'Could not save that. Try again.'

export function invalid(message: string): { ok: false; reason: 'invalid'; message: string } {
  return { ok: false, reason: 'invalid', message }
}

export function failed(message = REFUSED_GENERIC): {
  ok: false
  reason: 'failed'
  message: string
} {
  return { ok: false, reason: 'failed', message }
}

/** The sibling whose name reads the same, if there is one. Case is not identity. */
export function collidingSibling(
  siblings: readonly { id: string; name: string }[],
  name: string,
  exceptId?: string,
): { id: string; name: string } | undefined {
  return siblings.find((s) => s.id !== exceptId && sameFolderName(s.name, name))
}

/**
 * The `duplicate` refusal, with the id of the folder that is in the way.
 *
 * The id is the whole point: it is what lets the screen offer "open it" instead
 * of leaving the person to retype a name that will be refused again.
 */
export function duplicateOf(existingId: string, name: string) {
  return {
    ok: false as const,
    reason: 'duplicate' as const,
    message: `You already have a folder called "${name}" here.`,
    existingId,
  }
}

/** How many membership rows sit in these folders. MEASURED, never a stored number. */
export async function countItems(
  ctx: WriteContext,
  folderIds: readonly string[],
): Promise<number | null> {
  if (folderIds.length === 0) return 0
  const { data, error } = await ctx.supabase
    .from('asset_folder_items')
    .select('asset_id')
    .eq('workspace_id', ctx.workspaceId)
    .in('folder_id', [...folderIds])
  if (error || !data) return null
  return data.length
}
