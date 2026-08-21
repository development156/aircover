import 'server-only'

import type { Asset, Channel } from '@sahoda/shared'
import type { PostFormat } from '@sahoda/publishing/format'

import type { ChannelRejection } from '../posts/attach-decision'
import { MEDIA_BUCKET } from '../posts/media-constants'
import { signMediaPreviews } from '../posts/media-url'
import { createServerSupabase } from '../supabase/server'
import { offerFor, type OfferResult } from './offer'

/**
 * The offer for a file that is ALREADY IN THE LIBRARY.
 *
 * The direct-upload path has the bytes in its hand; this one has to fetch them,
 * because the crop plan is made against the ORIENTED dimensions and only the
 * bytes know the EXIF orientation. `assets.width`/`height` are the sniffed,
 * unrotated numbers.
 *
 * Returns `null` — not a refusal — when the file's own facts were never
 * established. A row with a null mime or null dimensions cannot be judged at all,
 * and `attachAssetToPost` already refuses it with its own sentence upstream;
 * inventing a second one here would be two different explanations of one problem.
 */
export async function offerForAsset(input: {
  asset: Asset
  channels: readonly Channel[]
  formats: Readonly<Partial<Record<Channel, PostFormat | null>>>
  rejections: readonly ChannelRejection[]
}): Promise<OfferResult | null> {
  const { mime, bytes, width, height } = input.asset
  if (mime === null || bytes === null || width === null || height === null) return null

  const supabase = createServerSupabase()
  const download = await supabase.storage.from(MEDIA_BUCKET).download(input.asset.storage_path)
  if (download.error || !download.data) return { offered: false, reason: 'unreadable' }

  // Signed here rather than on the client: the bucket is private, and a URL that
  // could not be minted comes back null so the screen says the preview is
  // unavailable instead of rendering a broken frame.
  const [preview] = await signMediaPreviews([
    { id: input.asset.id, storage_path: input.asset.storage_path },
  ])

  return offerFor({
    bytes: new Uint8Array(await download.data.arrayBuffer()),
    candidate: { mime, bytes, width, height },
    channels: input.channels,
    formats: input.formats,
    rejections: input.rejections,
    assetId: input.asset.id,
    previewUrl: preview?.url ?? null,
  })
}
