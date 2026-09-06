import 'server-only'

import { AssetFolderSchema, AssetSmartFolderSchema } from '@sahoda/shared'
import type { AssetFolder, AssetSmartFolder } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * The folder tree, read from `asset_folders`, `asset_folder_items` and
 * `asset_smart_folders`.
 *
 * ── THE DOCTRINE IS `read.ts`'s, VERBATIM ────────────────────────────────────
 * Three answers, not two: `ok`, `no-workspace`, `unreadable`. A read that FAILED
 * never degrades to an empty tree, because an empty tree is a claim about the
 * customer's library ("you have no folders") and a failed read is a claim about
 * us ("we could not look"). The sidebar shows a count under every folder; a zero
 * that came from a timeout is the `100 of —` failure in folder form.
 *
 * Every query is scoped to the ACTIVE workspace as well as being RLS-scoped. The
 * member policy admits every workspace the person belongs to, so an unscoped
 * list blends two tenants the day anyone has two memberships.
 */

/**
 * Hard caps. Exported so the screen can SAY it is capped — a truncated tree
 * rendered as the whole tree is a lie about how the library is organised.
 */
export const FOLDER_LIST_LIMIT = 500
export const FOLDER_ITEM_LIMIT = 5000

export interface FolderTree {
  status: 'ok'
  folders: AssetFolder[]
  smart: AssetSmartFolder[]
  /** Which folders each file is filed in. A file may be in several. */
  itemsByAsset: Map<string, string[]>
  /** MEASURED row counts per folder id. Never a stored number. */
  itemsByFolder: Map<string, number>
  /**
   * Rows that came back and could not be parsed, so the screen can say so.
   * A dropped folder is a folder the person made and cannot see, which is a
   * sentence worth printing rather than a silence.
   */
  droppedFolders: number
  /** Smart folders whose saved question would not parse. See `readFolderTree`. */
  droppedSmart: number
  /** Either list or the membership read hit its cap. */
  capped: boolean
}

export type FolderTreeRead = FolderTree | { status: 'no-workspace' } | { status: 'unreadable' }

/**
 * The whole folder tree for the active workspace.
 *
 * ── WHY A CORRUPT SMART FOLDER IS DROPPED AND NOT REPAIRED ───────────────────
 * `query` is a jsonb column, so Postgres accepts any shape at all and this parse
 * is the only gate on it. When it fails there are three options and two of them
 * are wrong:
 *
 *   default it     — the folder now answers a DIFFERENT question than the one
 *                    the person saved, under the name they gave the old one.
 *                    "Photos over 2 MB" quietly becomes "everything".
 *   repair it      — same defect, dressed as helpfulness. Nothing here knows
 *                    what the missing half of the rule was.
 *   DROP and COUNT — the folder does not appear, and the count says one folder
 *                    could not be read. That is the only honest pair.
 *
 * The row is left alone in the database, so a later build that can read it gets
 * it back. Nothing is rewritten on a read path.
 */
export async function readFolderTree(): Promise<FolderTreeRead> {
  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'none') return { status: 'no-workspace' }
    if (workspace.status !== 'ok') return { status: 'unreadable' }
    const workspaceId = workspace.workspace.id

    const supabase = createServerSupabase()

    // THREE INDEPENDENT READS, ONE ROUND TRIP. None of them needs another's
    // answer, so awaiting them one after the other bought nothing and cost two
    // round trips on every visit to the screen.
    const [folderRows, smartRows, itemRows] = await Promise.all([
      supabase
        .from('asset_folders')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })
        .limit(FOLDER_LIST_LIMIT),
      supabase
        .from('asset_smart_folders')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })
        .limit(FOLDER_LIST_LIMIT),
      supabase
        .from('asset_folder_items')
        .select('folder_id, asset_id')
        .eq('workspace_id', workspaceId)
        .limit(FOLDER_ITEM_LIMIT),
    ])
    if (folderRows.error || !folderRows.data) return { status: 'unreadable' }
    // Not survivable as an empty list: the smart folders are the saved questions,
    // and "you have none" would offer the person the remedy of making one they
    // already have.
    if (smartRows.error || !smartRows.data) return { status: 'unreadable' }
    // The counts under every folder come from these rows. A failed membership read
    // with the folder read intact would draw the whole tree with 0 under each
    // name, which is the most convincing wrong number the screen can show.
    if (itemRows.error || !itemRows.data) return { status: 'unreadable' }

    // Per row, so one malformed row costs one folder rather than the whole tree.
    const folders: AssetFolder[] = []
    let droppedFolders = 0
    for (const row of folderRows.data) {
      const parsed = AssetFolderSchema.safeParse(row)
      if (parsed.success) folders.push(parsed.data)
      else droppedFolders += 1
    }

    const smart: AssetSmartFolder[] = []
    let droppedSmart = 0
    for (const row of smartRows.data) {
      // `AssetSmartFolderSchema` carries `SmartQuerySchema` for the `query`
      // column, so this one parse is both the row check and the question check.
      const parsed = AssetSmartFolderSchema.safeParse(row)
      if (parsed.success) smart.push(parsed.data)
      else droppedSmart += 1
    }

    const itemsByAsset = new Map<string, string[]>()
    const itemsByFolder = new Map<string, number>()
    for (const row of itemRows.data) {
      const folderId = (row as { folder_id?: unknown }).folder_id
      const assetId = (row as { asset_id?: unknown }).asset_id
      if (typeof folderId !== 'string' || typeof assetId !== 'string') continue
      const list = itemsByAsset.get(assetId) ?? []
      list.push(folderId)
      itemsByAsset.set(assetId, list)
      itemsByFolder.set(folderId, (itemsByFolder.get(folderId) ?? 0) + 1)
    }

    return {
      status: 'ok',
      folders,
      smart,
      itemsByAsset,
      itemsByFolder,
      droppedFolders,
      droppedSmart,
      capped:
        folderRows.data.length >= FOLDER_LIST_LIMIT ||
        smartRows.data.length >= FOLDER_LIST_LIMIT ||
        itemRows.data.length >= FOLDER_ITEM_LIMIT,
    }
  } catch {
    return { status: 'unreadable' }
  }
}

/**
 * Which folders each of THESE files is filed in.
 *
 * For a page loaded after the first one (`loadOlderAssets`, the server search):
 * those cards render filing exactly as the first two hundred do, so they need
 * the same memberships. Returns null for a failed read rather than an empty
 * map, because an empty map says "filed nowhere" about every file in it.
 */
export async function readFolderIdsFor(
  assetIds: readonly string[],
): Promise<Map<string, string[]> | null> {
  const byAsset = new Map<string, string[]>()
  if (assetIds.length === 0) return byAsset
  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status !== 'ok') return null

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('asset_folder_items')
      .select('folder_id, asset_id')
      .eq('workspace_id', workspace.workspace.id)
      .in('asset_id', [...assetIds])
      .limit(FOLDER_ITEM_LIMIT)

    if (error || !data) return null
    for (const row of data) {
      const folderId = (row as { folder_id?: unknown }).folder_id
      const assetId = (row as { asset_id?: unknown }).asset_id
      if (typeof folderId !== 'string' || typeof assetId !== 'string') continue
      const list = byAsset.get(assetId) ?? []
      list.push(folderId)
      byAsset.set(assetId, list)
    }
    return byAsset
  } catch {
    return null
  }
}

/**
 * Which files are filed in one folder, by id.
 *
 * Returns null for a failed read rather than an empty array, for the reason
 * `readUsage` gives: an empty array is "this folder is empty", and a folder that
 * reads as empty is one a person clears out without knowing what was in it.
 */
export async function readFolderAssetIds(folderId: string): Promise<string[] | null> {
  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status !== 'ok') return null

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('asset_folder_items')
      .select('asset_id')
      .eq('workspace_id', workspace.workspace.id)
      .eq('folder_id', folderId)
      .limit(FOLDER_ITEM_LIMIT)

    if (error || !data) return null
    return data.flatMap((row) => {
      const assetId = (row as { asset_id?: unknown }).asset_id
      return typeof assetId === 'string' ? [assetId] : []
    })
  } catch {
    return null
  }
}
