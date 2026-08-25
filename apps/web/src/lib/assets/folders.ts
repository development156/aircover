import type { AssetCard } from '@/lib/assets/view'

/**
 * THE FOLDERS ON /assets, AND WHY THEY ARE THESE FOLDERS.
 *
 * ── WHAT WAS ASKED FOR, AND WHAT THE DATABASE CAN ANSWER ─────────────────────
 * The brief asked for named folders — Brand Assets, Campaigns, Social Media,
 * Product, Uncategorized — with a count under each and a click that opens them.
 * `assets` has no column those could come from: `AssetSchema` is id, workspace,
 * storage_path, kind, mime, bytes, width, height, alt, title, created_by and the
 * timestamps, and a grep of every migration finds no category, collection or tag
 * anywhere. The only "folder" in the schema is `storage.foldername()`, which is
 * the workspace-id path prefix the RLS policies read.
 *
 * So those five would have been five containers holding nothing, a "12 assets"
 * no query can produce, and a click that filters on a field that does not exist
 * — the `100 of —` failure `docs/26` §4 names, in folder form. Founder's ruling,
 * 25 August 2026: build the folder LANGUAGE on groupings that are real, and keep
 * named folders for the day a column exists.
 *
 * ── EVERY FOLDER HERE IS A PREDICATE OVER ROWS ───────────────────────────────
 * Each one is a filter anyone can run in their head against the tiles below it,
 * which is the property the named folders could not have. The count is
 * `cards.filter(match).length` — never a stored number, so it cannot drift from
 * the list it sits above.
 *
 * ── AND THE ONES THAT ARE DELIBERATELY ABSENT ────────────────────────────────
 * No Videos or Documents folder. `KINDS_NOT_YET_UPLOADABLE` already renders them
 * as inert spans reading "not yet", because the product cannot accept them. An
 * empty folder for a kind nothing can put a file into is a container for a thing
 * that cannot exist, which is worse than not drawing it.
 */
export type FolderId = 'image' | 'in-use' | 'unused'

export interface AssetFolder {
  id: FolderId
  name: string
  /** What the folder holds, in the words a person would use. */
  match: (card: AssetCard) => boolean
}

export const ASSET_FOLDERS: readonly AssetFolder[] = [
  {
    id: 'image',
    name: 'Photos',
    match: (card) => card.kind === 'image',
  },
  {
    id: 'in-use',
    name: 'In use',
    // `usage` is the `asset_usages` rows the server actually read, so a non-empty
    // array means a post really references this file. There is no "used" flag to
    // go stale.
    match: (card) => card.usage.length > 0,
  },
  {
    id: 'unused',
    name: 'Not used yet',
    match: (card) => card.usage.length === 0,
  },
]

/**
 * How many files each folder holds, counted from the rows on screen.
 *
 * Returns a count for EVERY folder including zero, because a folder that
 * disappears when it empties is a folder whose absence a person has to
 * interpret. Zero is a reading; a missing tile is not.
 */
export function folderCounts(cards: AssetCard[]): Record<FolderId, number> {
  const counts = { image: 0, 'in-use': 0, unused: 0 } as Record<FolderId, number>
  for (const folder of ASSET_FOLDERS) {
    counts[folder.id] = cards.filter(folder.match).length
  }
  return counts
}
