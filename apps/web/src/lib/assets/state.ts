import type { Asset, AssetUsageSite } from '@sahoda/shared'

import type { CropOfferView } from '@/lib/media/offer-state'
import type { ChannelRejection } from '@/lib/posts/attach-decision'

/**
 * Return shapes for the asset actions.
 *
 * Lives outside the `'use server'` module for the reason `media-state.ts` gives:
 * such a file may export only async functions, and re-exporting a type from one
 * makes Turbopack dev emit a runtime `ReferenceError` that 500s every route
 * importing the action.
 */

/**
 * `unusable` names the channels that will NOT take this file. The upload still
 * succeeds — a library is not a post and a photo that only Instagram accepts is
 * a photo worth keeping — but the tile has to be able to say so, or the writer
 * finds out at publish time.
 */
export type UploadAssetState =
  | { ok: true; asset: Asset; unusable: ChannelRejection[] }
  | { ok: false; message: string; rejections?: ChannelRejection[] }

/**
 * Three outcomes, not two.
 *
 * `needs-confirm` is the one a boolean could not carry: the file CAN go, but
 * posts lose it, and the person has to be shown which ones before they agree.
 * Collapsing it into `ok` would delete first and inform afterwards.
 */
export type DeleteAssetState =
  | { ok: true }
  | { ok: false; reason: 'refused'; message: string; locked: AssetUsageSite[] }
  | { ok: false; reason: 'needs-confirm'; message: string; detach: AssetUsageSite[] }
  | { ok: false; reason: 'failed'; message: string }

export type UpdateAssetState = { ok: true; asset: Asset } | { ok: false; message: string }

/** See `AttachMediaState`: the offer is carried BESIDE the refusal, never instead of it. */
export type AttachAssetState =
  | { ok: true; warnings: ChannelRejection[]; message?: string }
  | {
      ok: false
      message: string
      rejections?: ChannelRejection[]
      offer?: CropOfferView
      noOffer?: string
    }
