import 'server-only'

import type { Channel } from '@sahoda/shared'
import type { PostFormat } from '@sahoda/publishing/format'

import type { ChannelRejection } from '../posts/attach-decision'
import { buildOffer, type OfferCandidate } from './crop-offer'
import { orientedSize, suggestFocal } from './derive'
import type { CropOfferView } from './offer-state'

/**
 * Turn a refusal into an OFFER — or say, specifically, why there is not one.
 *
 * ── NOTHING IS WRITTEN HERE ─────────────────────────────────────────────────
 * No upload, no row, no ledger entry. This reads bytes the caller already has in
 * memory and returns a description of a crop that does not exist yet. That is the
 * founder's rule stated as a module boundary: nothing is written until they
 * accept, so the thing that composes the offer has no write path at all.
 *
 * ── AND THE DIMENSIONS ARE THE ORIENTED ONES ────────────────────────────────
 * `sniffImage` reads a JPEG's SOF header, which is the size of the stored pixels.
 * A browser applies EXIF orientation before it paints. For a photo taken in
 * portrait on most phones those two disagree by a quarter turn — so the preview a
 * person adjusts would be of a different rectangle from the one that was planned.
 * The plan is made against `orientedSize`, and `renderDerivative` calls
 * `.rotate()` before it extracts, so all three agree.
 */

export type OfferResult =
  | { offered: true; offer: CropOfferView }
  | { offered: false; reason: string }

export interface OfferInput {
  /** The ORIGINAL's bytes. Read, never written. */
  bytes: Uint8Array
  /** What `sniffImage` proved about the file, as the engine judged it. */
  candidate: OfferCandidate
  channels: readonly Channel[]
  formats: Readonly<Partial<Record<Channel, PostFormat | null>>>
  /** `decideAttach`'s own rejections, so the fixable split is made on real codes. */
  rejections: readonly ChannelRejection[]
  /** The library file this is, when it is one. */
  assetId: string | null
  /** A signed URL for the original, when the browser does not already hold it. */
  previewUrl: string | null
}

export async function offerFor(input: OfferInput): Promise<OfferResult> {
  const oriented = await orientedSize(input.bytes)
  if (oriented === null) return { offered: false, reason: 'unreadable' }

  // ── A MOVING IMAGE IS NOT OFFERED A CROP ──────────────────────────────────
  // Sharp would happily extract the first frame and write a still. That is not a
  // fix, it is a different file: the customer uploaded something that moves and
  // would get back something that does not, with nothing on screen saying so.
  // Refused, and the refusal names the reason.
  if (oriented.animated) return { offered: false, reason: 'animated' }

  const decision = buildOffer(
    input.channels,
    input.formats,
    // The ORIENTED dimensions — see the header. The mime and byte count are the
    // sniffed facts, which orientation does not change.
    { ...input.candidate, width: oriented.width, height: oriented.height },
    input.rejections,
  )
  if (!decision.offered) return { offered: false, reason: decision.reason }

  const size = { width: decision.offer.rect.width, height: decision.offer.rect.height }
  // Best effort, and the centre is a perfectly good answer. See `suggestFocal`.
  const focal = await suggestFocal(input.bytes, oriented, size)

  return {
    offered: true,
    offer: {
      previewUrl: input.previewUrl,
      assetId: input.assetId,
      original: {
        width: oriented.width,
        height: oriented.height,
        mime: input.candidate.mime,
        bytes: input.candidate.bytes,
      },
      size,
      focal,
      outputMime: decision.offer.outputMime,
      outcomes: decision.offer.outcomes,
    },
  }
}
