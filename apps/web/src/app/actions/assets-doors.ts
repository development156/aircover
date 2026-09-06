'use server'

import { auth } from '@clerk/nextjs/server'

import { attachAssetToPost } from '@/app/actions/assets'
import { createPost } from '@/app/actions/posts'
import { readAsset } from '@/lib/assets/read'
import type { DownloadAssetState, WritePostState } from '@/lib/assets/state'
import { reportServerError } from '@/lib/observability/report'
import { MEDIA_BUCKET } from '@/lib/posts/media-constants'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * The two doors OUT of the library: take the file, or start a post with it.
 *
 * Neither is a write to the library. A download mints a signed link that
 * expires; writing a post creates a post and puts the photo on it through the
 * same `attachAssetToPost` the composer's picker uses, so the channel rules
 * are the same rules whichever door a person came in by.
 */

/** Long enough for a download to start; short enough that a leaked link is useless by lunch. */
const DOWNLOAD_TTL_SECONDS = 5 * 60

/** The name the browser saves under. Never the storage key, which is a uuid. */
function downloadName(title: string | null, mime: string | null): string {
  const base = (title ?? '').trim() || 'photo'
  if (/\.[a-z0-9]{2,5}$/i.test(base)) return base
  const ext =
    mime === 'image/jpeg'
      ? 'jpg'
      : mime === 'image/png'
        ? 'png'
        : mime === 'image/webp'
          ? 'webp'
          : mime === 'image/gif'
            ? 'gif'
            : null
  return ext === null ? base : `${base}.${ext}`
}

/**
 * A signed link with `Content-Disposition: attachment`, so following it saves
 * the file instead of showing it. The bucket is private, so this is the only
 * way a browser can be handed the bytes at all.
 */
export async function downloadAssetUrl(assetId: string): Promise<DownloadAssetState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to download a file.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const read = await readAsset(assetId)
    if (read.status === 'missing')
      return { ok: false, message: 'That file is not in your library.' }
    if (read.status !== 'ok') {
      return { ok: false, message: 'Sahoda could not read that file. Reload and try again.' }
    }
    const asset = read.asset.asset

    const supabase = createServerSupabase()
    const { data, error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(asset.storage_path, DOWNLOAD_TTL_SECONDS, {
        download: downloadName(asset.title, asset.mime),
      })
    if (error || !data?.signedUrl) {
      return { ok: false, message: 'Could not make a download link. Try again.' }
    }
    return { ok: true, url: data.signedUrl }
  } catch (error) {
    reportServerError(error, { action: 'downloadAssetUrl', workspaceId })
    return { ok: false, message: 'Could not make a download link. Try again.' }
  }
}

/**
 * Make a post and put this photo on it.
 *
 * ── CREATE FIRST, ATTACH BEST-EFFORT ─────────────────────────────────────────
 * A new post has no channels, and `attachAssetToPost` judges a file against
 * the post's channels, so the attach can be refused before anyone has picked
 * one. That is not a reason to refuse the post: the person asked to start
 * writing with this photo, the post exists, and the composer says what it
 * needs. `attached` and `message` carry the attach's own answer so the
 * composer's own picker is the second door, not a dead end.
 */
export async function writePostWithAsset(assetId: string): Promise<WritePostState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to write a post.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const created = await createPost('')
    if (!created.ok) return { ok: false, message: created.message }

    const attached = await attachAssetToPost(created.postId, assetId)
    return {
      ok: true,
      postId: created.postId,
      attached: attached.ok,
      message: attached.ok ? null : attached.message,
    }
  } catch (error) {
    reportServerError(error, { action: 'writePostWithAsset', workspaceId })
    return { ok: false, message: 'Could not start a post with that photo. Try again.' }
  }
}
