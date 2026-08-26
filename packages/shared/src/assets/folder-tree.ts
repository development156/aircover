import { z } from 'zod'
import { SmartQuerySchema } from './organize'

/**
 * REAL FOLDERS — ones a person makes, names, nests and moves files into.
 *
 * ── WHAT THIS ADDS THAT THE DERIVED FOLDERS COULD NOT ────────────────────────
 * `apps/web/src/lib/assets/folders.ts` records a ruling from 25 August: named
 * folders were refused because no column could answer them, so the row was built
 * out of predicates instead. That ruling was correct and it is not being
 * reversed — those three folders stay. What changes is that the column now
 * exists, which is the condition that ruling named for revisiting it.
 *
 * ── A FILE MAY LIVE IN MORE THAN ONE FOLDER, AND THAT IS THE POINT ───────────
 * Membership is a separate table (`asset_folder_items`), not a `folder_id`
 * column on `assets`. Google Drive had this and removed it in September 2020;
 * a shopfront photo genuinely belongs in both "Diwali campaign" and "Storefront",
 * and a single parent forces a person to pick one and then lose the file from
 * the other. Filing a photo in a second place must not remove it from the first.
 *
 * That is also why nothing here cascades to the FILE. Removing a photo from a
 * folder removes one membership row. Deleting a folder deletes the folder and
 * its membership rows. Neither deletes a single byte, and neither can: the only
 * path that removes a file is `deleteAsset`, which goes through the usage gate.
 */

export const MAX_FOLDER_NAME = 60

/**
 * How deep folders may nest. Six is not arbitrary: the breadcrumb is the one
 * control that has to render a whole path on a 360px phone, and past six the
 * path either wraps to three lines or starts eliding the names in the middle,
 * which is the part a person navigates by.
 */
export const MAX_FOLDER_DEPTH = 6

// ── asset_folders ────────────────────────────────────────────────────────────
export const AssetFolderSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  /** null is the root. There is no synthetic "My Library" row to keep in step. */
  parent_id: z.uuid().nullable(),
  name: z.string(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type AssetFolder = z.infer<typeof AssetFolderSchema>

export const AssetFolderInsertSchema = z.object({
  workspace_id: z.uuid(),
  parent_id: z.uuid().nullable().optional(),
  name: z.string().min(1).max(MAX_FOLDER_NAME),
  created_by: z.string().nullable().optional(),
})
export type AssetFolderInsert = z.infer<typeof AssetFolderInsertSchema>

/** Only the two things a person changes: what it is called, and where it sits. */
export const AssetFolderUpdateSchema = z
  .object({
    name: z.string().min(1).max(MAX_FOLDER_NAME),
    parent_id: z.uuid().nullable(),
  })
  .partial()
export type AssetFolderUpdate = z.infer<typeof AssetFolderUpdateSchema>

// ── asset_folder_items ───────────────────────────────────────────────────────
export const AssetFolderItemSchema = z.object({
  workspace_id: z.uuid(),
  folder_id: z.uuid(),
  asset_id: z.uuid(),
  added_by: z.string().nullable(),
  added_at: z.string(),
})
export type AssetFolderItem = z.infer<typeof AssetFolderItemSchema>

// ── asset_smart_folders ──────────────────────────────────────────────────────
export const AssetSmartFolderSchema = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  name: z.string(),
  /**
   * The saved question, as stored. Parsed with `SmartQuerySchema` on the way out
   * rather than trusted: this is a jsonb column, so the database will accept any
   * shape at all and the only gate on it is this parse.
   */
  query: SmartQuerySchema,
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type AssetSmartFolder = z.infer<typeof AssetSmartFolderSchema>

export const AssetSmartFolderInsertSchema = z.object({
  workspace_id: z.uuid(),
  name: z.string().min(1).max(MAX_FOLDER_NAME),
  query: SmartQuerySchema,
  created_by: z.string().nullable().optional(),
})
export type AssetSmartFolderInsert = z.infer<typeof AssetSmartFolderInsertSchema>

export const AssetSmartFolderUpdateSchema = z
  .object({
    name: z.string().min(1).max(MAX_FOLDER_NAME),
    query: SmartQuerySchema,
  })
  .partial()
export type AssetSmartFolderUpdate = z.infer<typeof AssetSmartFolderUpdateSchema>

// ── Naming ───────────────────────────────────────────────────────────────────
/**
 * The name as it will be stored.
 *
 * Collapses runs of whitespace, because "Diwali  2026" and "Diwali 2026" are the
 * same folder to every person who will ever read them and two different rows to
 * Postgres. Returns null when nothing is left, so an all-spaces name is refused
 * by the caller rather than stored as an invisible folder.
 */
export function normalizeFolderName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim()
  if (name === '') return null
  return name.slice(0, MAX_FOLDER_NAME)
}

/** Two names collide when they would read the same. Case and spacing are not identity. */
export function sameFolderName(a: string, b: string): boolean {
  return (
    (normalizeFolderName(a) ?? '').toLowerCase() === (normalizeFolderName(b) ?? '').toLowerCase()
  )
}

// ── The tree ─────────────────────────────────────────────────────────────────
/** The subset of a folder row the tree logic needs. Rows or drafts both fit. */
export interface FolderNodeInput {
  id: string
  parent_id: string | null
  name: string
}

/**
 * Every ancestor of `id`, nearest first, then the folder itself LAST.
 *
 * Returns the empty array for an unknown id rather than throwing: a breadcrumb
 * for a folder that was deleted in another tab must render as "gone", not as a
 * crash on the whole library.
 *
 * The visit set is what makes this total. A parent chain that loops — which the
 * database forbids, and which a corrupted or hand-edited row could still
 * produce — would otherwise spin forever on the server.
 */
export function folderPath<T extends FolderNodeInput>(folders: readonly T[], id: string): T[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const path: T[] = []
  const seen = new Set<string>()
  let cursor: string | null = id
  while (cursor !== null && !seen.has(cursor)) {
    seen.add(cursor)
    const node: T | undefined = byId.get(cursor)
    if (node === undefined) break
    path.unshift(node)
    cursor = node.parent_id
  }
  return path
}

/** How deep a folder sits. A root folder is depth 1. 0 means it could not be placed. */
export function folderDepth(folders: readonly FolderNodeInput[], id: string): number {
  return folderPath(folders, id).length
}

/** Every folder beneath `id`, at any depth. Excludes `id` itself. */
export function descendantIds(folders: readonly FolderNodeInput[], id: string): Set<string> {
  const children = new Map<string, string[]>()
  for (const folder of folders) {
    if (folder.parent_id === null) continue
    const list = children.get(folder.parent_id) ?? []
    list.push(folder.id)
    children.set(folder.parent_id, list)
  }
  const out = new Set<string>()
  const queue = [...(children.get(id) ?? [])]
  while (queue.length > 0) {
    const next = queue.pop() as string
    // Guards against a cycle in stored rows, exactly as `folderPath` does. A
    // `while` over a graph you did not build is an infinite loop waiting for
    // one bad row.
    if (out.has(next)) continue
    out.add(next)
    queue.push(...(children.get(next) ?? []))
  }
  return out
}

/**
 * May this folder move there?
 *
 * ── THE REFUSALS ARE SENTENCES, NOT A BOOLEAN ────────────────────────────────
 * Each one names what is wrong, because the person doing this is dragging a
 * folder and a move that simply does not happen reads as a broken app. The three
 * cases are genuinely different and a caller must be able to tell them apart.
 *
 * `into-itself` and `into-own-child` are the cycle. Postgres will also refuse the
 * second through its trigger, and that is the real gate; this exists so the
 * refusal arrives before the drop animation finishes rather than as an error
 * banner afterwards.
 */
export type FolderMoveDecision =
  | { ok: true }
  | { ok: false; reason: 'missing'; message: string }
  | { ok: false; reason: 'into-itself'; message: string }
  | { ok: false; reason: 'into-own-child'; message: string }
  | { ok: false; reason: 'too-deep'; message: string }

export function canMoveFolder(
  folders: readonly FolderNodeInput[],
  id: string,
  newParentId: string | null,
): FolderMoveDecision {
  const moving = folders.find((folder) => folder.id === id)
  if (moving === undefined) {
    return { ok: false, reason: 'missing', message: 'That folder is no longer here.' }
  }

  if (newParentId === id) {
    return {
      ok: false,
      reason: 'into-itself',
      message: 'A folder cannot go inside itself.',
    }
  }

  if (newParentId !== null) {
    const parent = folders.find((folder) => folder.id === newParentId)
    if (parent === undefined) {
      return { ok: false, reason: 'missing', message: 'That folder is no longer here.' }
    }
    if (descendantIds(folders, id).has(newParentId)) {
      return {
        ok: false,
        reason: 'into-own-child',
        message: `"${moving.name}" cannot go inside a folder that is already inside it.`,
      }
    }
  }

  // The DEEPEST branch under the folder being moved, not the folder itself. A
  // folder one level from the limit with three levels beneath it would otherwise
  // pass this check and push its own children past the limit.
  const moved = folders.map((folder) =>
    folder.id === id ? { ...folder, parent_id: newParentId } : folder,
  )
  let deepest = folderDepth(moved, id)
  for (const childId of descendantIds(folders, id)) {
    const depth = folderDepth(moved, childId)
    if (depth > deepest) deepest = depth
  }

  if (deepest > MAX_FOLDER_DEPTH) {
    return {
      ok: false,
      reason: 'too-deep',
      message: `Folders can go ${MAX_FOLDER_DEPTH} levels deep. Moving this one would go past that.`,
    }
  }

  return { ok: true }
}
