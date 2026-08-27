'use server'

import { auth } from '@clerk/nextjs/server'

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
export type PickerRead = { ok: true; cards: AssetCard[] } | { ok: false }

export async function listAssetsForPicker(): Promise<PickerRead> {
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false }

    const read = await readAssets()
    if (read.status === 'no-workspace') return { ok: true, cards: [] }
    if (read.status !== 'ok') return { ok: false }

    const previews = await signMediaPreviews(read.assets.map((entry) => entry.asset))
    const urlById = new Map(previews.map((preview) => [preview.id, preview.url]))

    return {
      ok: true,
      cards: read.assets.map(({ asset, usage }) => ({
        id: asset.id,
        title: asset.title,
        alt: asset.alt,
        kind: asset.kind,
        mime: asset.mime,
        bytes: asset.bytes,
        width: asset.width,
        height: asset.height,
        createdAt: asset.created_at,
        previewUrl: urlById.get(asset.id) ?? null,
        // NOT `[]`. The picker renders no filing, so it runs no memberships
        // query, and an empty array here would state that every photo in the
        // composer is filed nowhere. `null` says we did not look.
        folderIds: null,
        // The picker reads the LIVE library only, so nothing it returns is trashed.
        // Stated rather than omitted: a composer that could attach a file its owner
        // had deleted would be the whole point of the trash going wrong.
        deletedAt: null,
        usage,
      })),
    }
  } catch (error) {
    reportServerError(error, { action: 'listAssetsForPicker' })
    return { ok: false }
  }
}
