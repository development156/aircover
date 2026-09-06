import type { Asset, AssetUsageSite } from '@sahoda/shared'

import type { AssetCard } from '@/lib/assets/view'

/**
 * One place that turns a row into a tile.
 *
 * `page.tsx`, the composer's picker, the older-page loader, the server search
 * and the deferred trash read all hand the client the same shape, and they
 * used to each spell out the fourteen fields by hand. Four copies of a mapping
 * is four places a new field is forgotten; this is the one.
 *
 * Every field is a column that was read, a URL that was signed, or null. The
 * two URLs are keyed by id by the CALLER and looked up here, never positional:
 * a positional read would hang one photo's preview on another the day a row
 * fails to parse.
 */
export interface CardUrls {
  /** Signed URL of the original, by asset id. */
  preview: ReadonlyMap<string, string | null>
  /** Signed URL of the 480 px thumbnail, by asset id. Absent means none was minted. */
  thumb: ReadonlyMap<string, string | null>
}

export function toAssetCard(
  asset: Asset,
  usage: AssetUsageSite[],
  urls: CardUrls,
  /**
   * `[]` means FILED NOWHERE; `null` means this read did not ask. The composer's
   * picker passes null because it renders no filing. See `AssetCard.folderIds`.
   */
  folderIds: string[] | null,
): AssetCard {
  return {
    id: asset.id,
    title: asset.title,
    alt: asset.alt,
    kind: asset.kind,
    mime: asset.mime,
    bytes: asset.bytes,
    width: asset.width,
    height: asset.height,
    createdAt: asset.created_at,
    previewUrl: urls.preview.get(asset.id) ?? null,
    thumbUrl: urls.thumb.get(asset.id) ?? null,
    usage,
    folderIds,
    // Written from the column rather than hard-coded per list, so a card handed
    // to the wrong list still says what it is.
    deletedAt: asset.deleted_at,
  }
}
