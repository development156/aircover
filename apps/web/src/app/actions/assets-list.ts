'use server'

import { auth } from '@clerk/nextjs/server'

import { toAssetCard } from '@/lib/assets/card'
import { readFolderIdsFor } from '@/lib/assets/folders-read'
import { readOlderAssets, readTrashedAssets, searchAssetsByText } from '@/lib/assets/read'
import type { LibraryAsset } from '@/lib/assets/read'
import type { OlderAssetsState, SearchAssetsState, TrashLoadState } from '@/lib/assets/state'
import type { AssetCard } from '@/lib/assets/view'
import { reportServerError } from '@/lib/observability/report'
import { signMediaPreviews } from '@/lib/posts/media-url'

/**
 * The library's LATER reads: the page after the cap, a search the capped
 * screen cannot answer, and the trash when it is opened.
 *
 * ── WHY THESE ARE ACTIONS AND NOT PART OF THE PAGE ───────────────────────────
 * `page.tsx` reads the newest two hundred files and stops, and says so. Every
 * read here is one a person asks for by pressing something, so it costs nothing
 * on the visits that never press it: the trash's usage and signed links used to
 * ride with every page load for a view most visits never open.
 *
 * ── THE SAME SHAPE THE PAGE HANDS OUT ────────────────────────────────────────
 * Each returns `AssetCard[]` built by `toAssetCard`, with folder memberships
 * read for the rows it returns, so a file that arrives by "Show older photos"
 * renders its filing exactly as the first two hundred do. A card without its
 * memberships would render as filed nowhere, which is a claim about the
 * customer's library that nobody checked.
 */

const CANNOT_LOAD = 'Sahoda could not read more of your library. Try again.'
const CANNOT_SEARCH = 'Sahoda could not search the rest of your library. Try again.'
const CANNOT_LOAD_TRASH = 'Sahoda could not read your trash. This is not a claim that it is empty.'

/** Sign the originals and the thumbnails in one pass and build the cards. */
async function cardsFor(
  entries: readonly LibraryAsset[],
  folderIds: ReadonlyMap<string, string[]> | null,
): Promise<AssetCard[]> {
  const thumbs = entries.flatMap((entry) =>
    entry.thumbPath === null
      ? []
      : [{ id: `thumb:${entry.asset.id}`, storage_path: entry.thumbPath }],
  )
  const previews = await signMediaPreviews([...entries.map((entry) => entry.asset), ...thumbs])
  const preview = new Map<string, string | null>()
  const thumb = new Map<string, string | null>()
  for (const signed of previews) {
    if (signed.id.startsWith('thumb:')) thumb.set(signed.id.slice('thumb:'.length), signed.url)
    else preview.set(signed.id, signed.url)
  }
  return entries.map(({ asset, usage }) =>
    toAssetCard(
      asset,
      usage,
      { preview, thumb },
      // `null` when the membership read failed: the card then renders no
      // filing rather than "filed nowhere".
      folderIds === null ? null : (folderIds.get(asset.id) ?? []),
    ),
  )
}

/** The next two hundred live files older than the last one on screen. */
export async function loadOlderAssets(
  beforeCreatedAt: string,
  beforeId: string,
): Promise<OlderAssetsState> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to see more of your library.' }

    const read = await readOlderAssets({ createdAt: beforeCreatedAt, id: beforeId })
    if (read.status !== 'ok') return { ok: false, message: CANNOT_LOAD }

    const folderIds = await readFolderIdsFor(read.assets.map((entry) => entry.asset.id))
    return { ok: true, cards: await cardsFor(read.assets, folderIds), more: read.capped }
  } catch (error) {
    reportServerError(error, { action: 'loadOlderAssets' })
    return { ok: false, message: CANNOT_LOAD }
  }
}

/** Live files whose name or description contains the words, from the whole library. */
export async function searchAssets(text: string): Promise<SearchAssetsState> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to search your library.' }

    const read = await searchAssetsByText(text)
    if (read.status !== 'ok') return { ok: false, message: CANNOT_SEARCH }

    const folderIds = await readFolderIdsFor(read.assets.map((entry) => entry.asset.id))
    return { ok: true, cards: await cardsFor(read.assets, folderIds), capped: read.capped }
  } catch (error) {
    reportServerError(error, { action: 'searchAssets' })
    return { ok: false, message: CANNOT_SEARCH }
  }
}

/**
 * The trash, with usage and signed links, read when a person opens it.
 *
 * Usage is read for these too, and that is deliberate rather than wasteful: the
 * confirmation before "Delete for good" needs the same gate the live library's
 * delete uses, and a trashed file's posts can change while it sits here.
 */
export async function loadTrash(): Promise<TrashLoadState> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to see your trash.' }

    const read = await readTrashedAssets()
    if (read.status === 'no-workspace') return { ok: true, cards: [], capped: false }
    if (read.status !== 'ok') return { ok: false, message: CANNOT_LOAD_TRASH }

    // A trashed file's folder memberships are still there, so a restore puts
    // it back where it was rather than at the root.
    const folderIds = await readFolderIdsFor(read.assets.map((entry) => entry.asset.id))
    return { ok: true, cards: await cardsFor(read.assets, folderIds), capped: read.capped }
  } catch (error) {
    reportServerError(error, { action: 'loadTrash' })
    return { ok: false, message: CANNOT_LOAD_TRASH }
  }
}
