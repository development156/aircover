'use server'

import { auth } from '@clerk/nextjs/server'

import { toAssetCard } from '@/lib/assets/card'
import { readAssets } from '@/lib/assets/read'
import type { AssetCard } from '@/lib/assets/view'
import { reportServerError } from '@/lib/observability/report'
import { signMediaPreviews } from '@/lib/posts/media-url'

/**
 * The library, for the composer's picker.
 *
 * ── WHY THIS IS AN ACTION AND NOT PART OF THE PAGE'S READ ────────────────────
 * The composer already runs five reads before it paints. Signing two hundred
 * preview URLs for a writer who never opens the picker is work nobody asked for,
 * and the links expire within the hour anyway. So the list is fetched when the
 * picker is opened, which is also when the signatures are freshest.
 *
 * ── IT DOES NOT RETURN AN EMPTY LIST FOR A FAILED READ ───────────────────────
 * `ok: false` and `cards: []` are different sentences. An empty library invites
 * an upload; a failed read must not, because the photo the writer is looking for
 * may be sitting right there.
 */
/**
 * `capped` rides out with the list for the same reason it rides out of
 * `readAssets`: the picker shows the newest two hundred and has to SAY so, or a
 * writer scrolls to the end and concludes the photo they want was never added.
 */
export type PickerRead = { ok: true; cards: AssetCard[]; capped: boolean } | { ok: false }

export async function listAssetsForPicker(): Promise<PickerRead> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false }

    const read = await readAssets()
    if (read.status === 'no-workspace') return { ok: true, cards: [], capped: false }
    if (read.status !== 'ok') return { ok: false }

    // Originals and thumbnails in ONE signing pass, keyed by id. The picker's
    // tile draws the thumbnail; the attach still points at the original.
    const thumbs = read.assets.flatMap((entry) =>
      entry.thumbPath === null
        ? []
        : [{ id: `thumb:${entry.asset.id}`, storage_path: entry.thumbPath }],
    )
    const previews = await signMediaPreviews([
      ...read.assets.map((entry) => entry.asset),
      ...thumbs,
    ])
    const preview = new Map<string, string | null>()
    const thumb = new Map<string, string | null>()
    for (const signed of previews) {
      if (signed.id.startsWith('thumb:')) thumb.set(signed.id.slice('thumb:'.length), signed.url)
      else preview.set(signed.id, signed.url)
    }

    return {
      ok: true,
      // `folderIds: null`, NOT `[]`. The picker renders no filing, so it runs
      // no memberships query, and an empty array would state that every photo
      // in the composer is filed nowhere. `null` says we did not look.
      cards: read.assets.map(({ asset, usage }) =>
        toAssetCard(asset, usage, { preview, thumb }, null),
      ),
      capped: read.capped,
    }
  } catch (error) {
    reportServerError(error, { action: 'listAssetsForPicker' })
    return { ok: false }
  }
}
