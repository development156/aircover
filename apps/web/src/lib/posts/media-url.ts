import 'server-only'

import type { PostMedia } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'

import { MEDIA_BUCKET } from './media-constants'

/**
 * The `media` bucket is PRIVATE — a stored object has no public URL, and the RLS
 * policy on `storage.objects` only admits paths under a workspace the caller
 * belongs to. So previews are short-lived signed URLs minted per request, under
 * the caller's own JWT: a link that leaks is useless within the hour, and a
 * caller who is not a member cannot mint one at all.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60

/** A preview URL, or null when one could not be minted. Never a placeholder. */
export interface MediaPreview {
  id: string
  url: string | null
}

/**
 * Sign every row in one round trip. A row whose URL could not be signed comes
 * back with `url: null` rather than being dropped: the file genuinely exists and
 * the writer needs to see it listed, count it against the channel media caps and
 * be able to remove it. Hiding it would understate the post's media.
 */
export async function signMediaPreviews(rows: readonly PostMedia[]): Promise<MediaPreview[]> {
  if (rows.length === 0) return []

  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(
      rows.map((row) => row.storage_path),
      SIGNED_URL_TTL_SECONDS,
    )

    if (error || !data) {
      if (error) console.error('[media] signing failed', error.message)
      return rows.map((row) => ({ id: row.id, url: null }))
    }

    // createSignedUrls returns results positionally, one per requested path, and
    // reports per-object failures inline rather than throwing.
    return rows.map((row, index) => {
      const signed = data[index]
      const url = signed?.signedUrl
      return { id: row.id, url: typeof url === 'string' && url !== '' ? url : null }
    })
  } catch (error) {
    console.error('[media] signing threw', error instanceof Error ? error.message : 'unknown')
    return rows.map((row) => ({ id: row.id, url: null }))
  }
}
