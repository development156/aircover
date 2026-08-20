import { isLockedSite, nameOfPost, reasonForLock } from '@sahoda/shared'
import type { AssetKind, AssetUsageSite } from '@sahoda/shared'

/**
 * What one library tile knows about itself.
 *
 * A plain, serialisable shape rather than the `Asset` row plus a signed URL plus
 * a usage list threaded separately: this crosses the server/client boundary, and
 * three parallel arrays keyed by position is how a preview ends up on the wrong
 * tile. Everything a tile renders is on the tile.
 *
 * Every field is either a column that was read or null. Nothing here is derived
 * from an assumption — `usage` is the rows `asset_usages` actually returned, and
 * `previewUrl` is null when signing failed rather than a placeholder image.
 */
export interface AssetCard {
  id: string
  title: string | null
  alt: string | null
  kind: AssetKind
  mime: string | null
  bytes: number | null
  width: number | null
  height: number | null
  createdAt: string
  /** Short-lived signed URL. null means it could not be minted; the FILE exists. */
  previewUrl: string | null
  usage: AssetUsageSite[]
}

/** Posts using this file that would refuse a delete. */
export function lockedSites(card: AssetCard): AssetUsageSite[] {
  return card.usage.filter(isLockedSite)
}

/**
 * The name a tile shows.
 *
 * Falls back to the file's own storage name only as far as the library ever
 * knew it: `title` is the upload's filename. With neither, the tile says the
 * file is unnamed rather than printing a uuid.
 */
export function displayName(card: AssetCard): string {
  const title = typeof card.title === 'string' ? card.title.trim() : ''
  return title === '' ? 'Unnamed file' : title
}

/**
 * The one-line usage sentence under a tile.
 *
 * Three distinct claims, and they are not interchangeable:
 *   · nothing uses it            → "Not used yet"
 *   · used, and something locks  → the lock, named
 *   · used, nothing locks        → the count
 *
 * There is no zero. "In 0 posts" and "Not used yet" read the same to a person
 * and only one of them is a sentence.
 */
export function usageLine(card: AssetCard): string {
  const locked = lockedSites(card)
  if (locked.length > 0) {
    const first = locked[0] as AssetUsageSite
    if (locked.length === 1) return `In ${nameOfPost(first)} — ${reasonForLock(first)}`
    return `In ${locked.length} posts that have gone out or are going out`
  }
  if (card.usage.length === 0) return 'Not used yet'
  return card.usage.length === 1 ? 'In 1 post' : `In ${card.usage.length} posts`
}

/**
 * Alt text for a tile's preview.
 *
 * Never invents a description. This code has not seen the picture, and "a photo"
 * is worse than saying the photo has no description — a screen-reader user needs
 * to know the description is missing so they can add one.
 */
export function previewAlt(card: AssetCard): string {
  const alt = typeof card.alt === 'string' ? card.alt.trim() : ''
  if (alt !== '') return alt
  return `${displayName(card)} — no description added`
}
