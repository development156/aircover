import type { ChannelOutcome } from './crop-offer'
import type { FocalPoint } from './crop-geometry'

/**
 * The offer as it crosses to the browser.
 *
 * ── THE CLIENT SENDS BACK ONE THING: A FOCAL POINT ──────────────────────────
 * Not a rectangle. The crop SIZE is a function of the original's dimensions and
 * the channels' declared bands, and the server recomputes it from
 * `planCrop` at accept time rather than trusting a number that made a round trip
 * through a browser. A client that sent `{width: 4000}` would otherwise be asking
 * for a crop nobody validated.
 *
 * Both sides derive the rectangle from `placeCrop(size, focal)` — one pure
 * function, two callers — so the region a person adjusts on screen and the region
 * sharp extracts are the same region by construction rather than by agreement.
 */
export interface CropOfferView {
  /**
   * Short-lived signed URL for the ORIGINAL, so the preview can draw it. Null on
   * the direct-upload path, where the browser already holds the File it picked —
   * and null when signing failed, which the screen says rather than showing a
   * broken frame.
   */
  previewUrl: string | null
  /** The library file this crop is of, or null for a file not yet in the library. */
  assetId: string | null
  /** The original AS A BROWSER SHOWS IT: EXIF orientation already applied. */
  original: { width: number; height: number; mime: string; bytes: number }
  /** The crop's size in the original's pixels. The aspect the preview box shows. */
  size: { width: number; height: number }
  /** Where the subject probably is. The starting point, which the person moves. */
  focal: FocalPoint
  /** The container the cropped copy will be written in. */
  outputMime: string
  /** Per channel: what it ends up with, and the rule that now holds. */
  outcomes: ChannelOutcome[]
}

/**
 * Why no fix was offered, in the writer's words.
 *
 * Every one of these is a real, distinct situation and none of them is "it did
 * not work". A photo that is too small cannot be fixed by any crop; a photo whose
 * channels want contradictory shapes cannot be served by one file. Saying which
 * is the difference between a refusal a person can act on and one they cannot.
 */
export const NO_OFFER_COPY: Readonly<Record<string, string>> = {
  nothing_fixable: '',
  bands_conflict:
    'These channels want shapes that cannot both be met by one photo, so there is no crop that works for all of them.',
  below_floor:
    'Cropping can only make a photo smaller, and this one is already under a channel’s minimum size. Use a larger photo.',
  no_fit: 'This photo is too small to crop into a shape the channels accept.',
  no_common_type:
    'These channels accept no file type in common, so one photo cannot be sent to all of them.',
  animated:
    'This is a moving image. Cropping it would freeze it into a still, so Sahoda leaves it alone.',
  unreadable: 'Sahoda could not read this file well enough to offer a crop.',
}
