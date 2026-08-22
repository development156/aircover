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

  // ── AN OFFER MAY NEVER DAMAGE THE REFUSAL IT RIDES ON ────────────────────
  // This runs INSIDE the refusal arm of `attachAssetToPost`, which has already
  // composed a sentence and a per-channel objection list. A throw here would
  // escape to that action's catch and replace both with "Could not add that file
  // — try again": the writer would lose the reason their photo was refused
  // because an extra feature failed. MEASURED — an existing test
  // (`assets.test.ts`, "the refusal names the channel rather than failing
  // anonymously") went red the moment this call was added, for exactly that
  // reason.
  //
  // So the whole body is inside the catch. The worst case is a refusal with no
  // offer, which is precisely what the screen showed before this lane existed.
  try {
    const supabase = createServerSupabase()
    const download = await supabase.storage.from(MEDIA_BUCKET).download(input.asset.storage_path)
    if (download.error || !download.data) return { offered: false, reason: 'unreadable' }

    // Signed here rather than on the client: the bucket is private, and a URL
    // that could not be minted comes back null so the screen says the preview is
    // unavailable instead of rendering a broken frame.
    const [preview] = await signMediaPreviews([
      { id: input.asset.id, storage_path: input.asset.storage_path },
    ])

    return await offerFor({
      bytes: new Uint8Array(await download.data.arrayBuffer()),
      candidate: { mime, bytes, width, height },
      channels: input.channels,
      formats: input.formats,
      rejections: input.rejections,
      assetId: input.asset.id,
      previewUrl: preview?.url ?? null,
    })
  } catch {
    return null
  }
}
