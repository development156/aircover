import {
  descendantIds,
  matchesQuery,
  type AssetFolder,
  type AssetSmartFolder,
  type OrganizableFile,
} from '@sahoda/shared'

import { ASSET_FOLDERS, type FolderId } from '@/lib/assets/folders'
import type { AssetCard } from '@/lib/assets/view'

/**
 * WHERE IN THE LIBRARY YOU ARE, and what that place contains.
 *
 * ── FOUR KINDS OF PLACE, AND THEY ARE NOT INTERCHANGEABLE ────────────────────
 * `all` is the library. `derived` is one of the three predicate folders that
 * already existed (Photos, In use, Not used yet) and which the 25 August ruling
 * established. `folder` is a real folder somebody made. `smart` is a saved
 * question.
 *
 * They are one union rather than a `folderId` plus a `smartId` plus a `kind`,
 * because three nullable slots admit "in the Diwali folder AND in the Photos
 * folder AND in a smart folder" — a state with no meaning, no breadcrumb, and
 * no answer to "what am I looking at". One slot cannot express it.
 */
export type LibraryLocation =
  | { at: 'all' }
  | { at: 'derived'; id: FolderId }
  | { at: 'folder'; id: string; deep: boolean }
  | { at: 'smart'; id: string }

export const ROOT: LibraryLocation = { at: 'all' }

/** The shape `matchesQuery` needs, from the shape a tile has. */
export function organizable(card: AssetCard): OrganizableFile {
  return {
    kind: card.kind,
    title: card.title,
    alt: card.alt,
    bytes: card.bytes,
    width: card.width,
    height: card.height,
    createdAt: card.createdAt,
    // The page's read returns `unreadable` rather than a partial usage list, so
    // a card that exists always has its usage. Carried through as an array and
    // never as null here for that reason: inventing an unknown the read cannot
    // produce would make every usage rule report "could not check".
    usage: card.usage,
  }
}

/**
 * What a place holds.
 *
 * `unknown` is only ever non-zero for a smart folder, and it is the count of
 * files whose membership turns on a column that could not be read. It is kept
 * OUT of `files` and reported beside it, because a folder that cannot tell must
 * say it cannot tell rather than quietly under-report.
 */
export interface LocationContents {
  files: AssetCard[]
  unknown: number
  /** Real folders whose parent is this place. Empty for every place but `folder` and `all`. */
  subfolders: AssetFolder[]
}

export function contentsAt(
  location: LibraryLocation,
  cards: readonly AssetCard[],
  folders: readonly AssetFolder[],
  smart: readonly AssetSmartFolder[],
  now: Date,
): LocationContents {
  switch (location.at) {
    case 'all':
      return {
        files: [...cards],
        unknown: 0,
        subfolders: folders.filter((folder) => folder.parent_id === null),
      }

    case 'derived': {
      // The folder's OWN predicate is the authority. Restating "in use means
      // usage.length > 0" here is how the row's count and the list under it
      // drift apart, which `lib/assets/folders.ts` already warns about.
      const derived = ASSET_FOLDERS.find((entry) => entry.id === location.id)
      const files = derived === undefined ? [] : cards.filter((card) => derived.match(card))
      return { files, unknown: 0, subfolders: [] }
    }

    case 'folder': {
      // `deep` is the thing Drive makes you guess at: its folder view shows
      // direct children only and gives no count of what is nested below, so
      // "did I file that photo in here or in a sub-folder" is unanswerable
      // without opening every one. Both counts are available here and the
      // screen states them.
      const held = location.deep
        ? new Set([location.id, ...descendantIds(folders, location.id)])
        : new Set([location.id])
      // A card whose filings were never read cannot be PROVEN to be in here, so
      // it is left out. Unreachable on this screen, where the page always reads
      // memberships; the guard is here so a future caller that does not cannot
      // silently populate a folder with files it never checked.
      const files = cards.filter((card) => (card.folderIds ?? []).some((id) => held.has(id)))
      return {
        files,
        unknown: 0,
        subfolders: folders.filter((folder) => folder.parent_id === location.id),
      }
    }

    case 'smart': {
      const saved = smart.find((entry) => entry.id === location.id)
      if (saved === undefined) return { files: [], unknown: 0, subfolders: [] }
      const files: AssetCard[] = []
      let unknown = 0
      for (const card of cards) {
        const answer = matchesQuery(saved.query, organizable(card), now)
        if (answer === 'yes') files.push(card)
        else if (answer === 'unknown') unknown += 1
      }
      return { files, unknown, subfolders: [] }
    }
  }
}

/**
 * Direct and nested counts for one real folder.
 *
 * Both are returned always, and `nested` INCLUDES `direct`. A folder holding two
 * photos directly and forty across its sub-folders says both numbers; showing
 * only the first is Drive's behaviour and it is the reason people lose files in
 * their own filing system.
 *
 * A file filed in both a folder and its own sub-folder is counted ONCE in
 * `nested`, because it is one file and a person counting tiles would count it
 * once. That is what the set is for.
 */
export interface FolderTally {
  direct: number
  nested: number
  subfolders: number
}

export function folderTally(
  folderId: string,
  cards: readonly AssetCard[],
  folders: readonly AssetFolder[],
): FolderTally {
  const below = descendantIds(folders, folderId)
  const all = new Set([folderId, ...below])
  let direct = 0
  let nested = 0
  for (const card of cards) {
    const filings = card.folderIds ?? []
    if (filings.includes(folderId)) direct += 1
    if (filings.some((id) => all.has(id))) nested += 1
  }
  return { direct, nested, subfolders: below.size }
}

/**
 * Files in the library that are filed nowhere.
 *
 * ── WHY THIS IS NOT A FOLDER CALLED "UNCATEGORIZED" ──────────────────────────
 * It is a count and a link, not a container. A folder named Uncategorized is a
 * place files appear to LIVE, so filing one elsewhere makes it vanish from a
 * folder the person was looking at, with no action of theirs. A count that goes
 * down as you file things is the same information without the disappearing act.
 */
export function unfiledCount(cards: readonly AssetCard[]): number {
  // `null` is NOT counted as unfiled. "We did not read this file's folders" and
  // "this file is in no folder" are different sentences, and only the second one
  // is what this number claims.
  return cards.filter((card) => card.folderIds !== null && card.folderIds.length === 0).length
}

/**
 * The sentence naming where you are. Never an empty string: a header that
 * renders nothing is a header a person reads as a loading state.
 */
export function locationName(
  location: LibraryLocation,
  folders: readonly AssetFolder[],
  smart: readonly AssetSmartFolder[],
): string {
  switch (location.at) {
    case 'all':
      return 'All files'
    case 'derived': {
      const derived = ASSET_FOLDERS.find((entry) => entry.id === location.id)
      return derived?.name ?? 'All files'
    }
    case 'folder': {
      const folder = folders.find((entry) => entry.id === location.id)
      // A folder deleted in another tab. "Gone" is the honest word: the screen
      // must not name a folder that is not there, and must not silently
      // pretend the person is somewhere else.
      return folder?.name ?? 'This folder is no longer here'
    }
    case 'smart': {
      const saved = smart.find((entry) => entry.id === location.id)
      return saved?.name ?? 'This smart folder is no longer here'
    }
  }
}
