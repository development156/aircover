'use client'

import { ImageOff } from 'lucide-react'

import { placeCrop, type FocalPoint } from '@/lib/media/crop-geometry'
import type { CropOfferView } from '@/lib/media/offer-state'

/**
 * BEFORE and AFTER, side by side, at the shape the crop will actually be.
 *
 * ── THE "AFTER" IS NOT A MOCK-UP ────────────────────────────────────────────
 * It is the original image, shown through a window of the crop's exact aspect,
 * offset by the crop's exact origin — and the origin comes from `placeCrop`, the
 * same pure function the server hands to sharp. So the region on screen and the
 * region extracted are one rectangle, arrived at by one piece of arithmetic,
 * rather than two that agree until they do not.
 *
 * The arithmetic in the style block is the same mapping written in percentages:
 * a box `crop.width` wide holds an image `original.width` wide, so the image is
 * `original.width / crop.width` of the box, shifted left by `rect.x / crop.width`
 * of it. Percentages rather than pixels because the box is fluid — this has to
 * hold at 390 as well as at 1440.
 *
 * ── AND IT IS AN <img>, NOT next/image ──────────────────────────────────────
 * The same reason `asset-thumb.tsx` gives: the bucket is private and the URL is
 * a signed link dead within the hour, so the optimiser would cache an address
 * that expires and serve a broken picture from its own cache.
 */

/**
 * THE HEIGHT IS CAPPED, AND THE CAP IS LOAD-BEARING.
 *
 * MEASURED in Chromium at both widths before this existed. A 9:16 photograph in
 * a 560px dialog is 995px tall, so:
 *
 *   · at 1440 the dialog exceeded the UA's own `max-height` for `<dialog>`, the
 *     overflow was clipped, and BOTH FOOTER BUTTONS WERE OFF-SCREEN — a dialog
 *     that cannot be accepted or declined, only escaped.
 *   · at 390 the "Now" frame alone filled the entire viewport. The after, the
 *     sliders and the channel rows were all a long scroll away, so the one
 *     comparison this screen exists to show could not be seen at once.
 *
 * Driving HEIGHT and letting `aspect-ratio` compute the width is what keeps the
 * shape honest: a `max-h` on a `w-full` box clamps the height and leaves the
 * width alone, which silently draws the crop at the wrong aspect. `max-w-full`
 * then re-clamps a very wide photo, and the ratio follows that instead.
 */
const FRAME = 'relative mx-auto overflow-hidden rounded-input bg-s2'

/** Tallest a frame may be. Beyond this the comparison stops being one. */
const MAX_H = 'min(30vh, 300px)'

/**
 * The box for one frame, capped by HEIGHT but expressed as a WIDTH.
 *
 * MEASURED, twice, because the two obvious spellings both fail:
 *   `max-h` on a `w-full` box clamps the height and leaves the width alone, so
 *   the crop is drawn at the WRONG ASPECT — the one thing this screen may never
 *   do. `w-auto`/`w-fit` with a height and an `aspect-ratio` gives 0×0, because
 *   the image inside is absolutely positioned and contributes no intrinsic width.
 *
 * So the width is derived from the height cap and the ratio, and `aspect-ratio`
 * takes the height back from whichever of the two limits actually bound. A very
 * wide photo hits `100%` first and gets shorter; a tall one hits the cap.
 */
function frameStyle(width: number, height: number): React.CSSProperties {
  return {
    aspectRatio: `${width} / ${height}`,
    width: `min(100%, calc(${MAX_H} * ${width} / ${height}))`,
  }
}

export function CropPreview({
  offer,
  focal,
  src,
  onPick,
}: {
  offer: CropOfferView
  focal: FocalPoint
  /** The original. A blob URL on the upload path, a signed URL from the library. */
  src: string | null
  /**
   * Move the focus point by pointing at the photo. A convenience ON TOP of the
   * two sliders, never instead of them: a click carries a position and a key
   * press does not, so the sliders are what makes this operable from a keyboard.
   */
  onPick?: (focal: FocalPoint) => void
}) {
  const { original, size } = offer
  const rect = placeCrop(original.width, original.height, size, focal)

  if (src === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 rounded-input border border-line bg-s2 px-3 py-8 text-center">
        <ImageOff size={18} strokeWidth={1.6} className="text-muted" aria-hidden />
        <span className="type-sm text-muted">
          Preview unavailable — the crop can still be made.
        </span>
      </div>
    )
  }

  return (
    <div className="grid gap-3 min-[520px]:grid-cols-2">
      <Frame label="Now" dimensions={`${original.width}×${original.height}`}>
        <div className={FRAME} style={frameStyle(original.width, original.height)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            decoding="async"
            className="absolute inset-0 h-full w-full object-contain"
          />
          {onPick === undefined ? null : (
            <button
              type="button"
              aria-label="Set the focus point by pointing at the subject"
              className="absolute inset-0 z-10 cursor-crosshair rounded-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              onPointerDown={(event) => {
                // The photo is drawn with `object-contain`, so it does not fill
                // the box unless the aspects match — mapping a click through the
                // BOX would put the focus point somewhere the subject is not.
                const box = event.currentTarget.getBoundingClientRect()
                if (box.width === 0 || box.height === 0) return
                const scale = Math.min(box.width / original.width, box.height / original.height)
                const drawnW = original.width * scale
                const drawnH = original.height * scale
                const x = (event.clientX - box.left - (box.width - drawnW) / 2) / drawnW
                const y = (event.clientY - box.top - (box.height - drawnH) / 2) / drawnH
                onPick({ x, y })
              }}
            />
          )}
          {/* What survives, shown against what does not. The kept region is
              clear and the discarded part is dimmed — a border alone reads as
              decoration at 390px. */}
          <div
            aria-hidden
            className="absolute border-2 border-primary shadow-[0_0_0_9999px_var(--scrim)]"
            style={{
              left: `${(rect.x / original.width) * 100}%`,
              top: `${(rect.y / original.height) * 100}%`,
              width: `${(rect.width / original.width) * 100}%`,
              height: `${(rect.height / original.height) * 100}%`,
            }}
          />
        </div>
      </Frame>

      <Frame label="After the crop" dimensions={`${size.width}×${size.height}`}>
        <div className={`${FRAME} border border-line`} style={frameStyle(size.width, size.height)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            decoding="async"
            className="absolute max-w-none"
            style={{
              width: `${(original.width / size.width) * 100}%`,
              height: `${(original.height / size.height) * 100}%`,
              left: `${(-rect.x / size.width) * 100}%`,
              top: `${(-rect.y / size.height) * 100}%`,
            }}
          />
        </div>
      </Frame>
    </div>
  )
}

function Frame({
  label,
  dimensions,
  children,
}: {
  label: string
  dimensions: string
  children: React.ReactNode
}) {
  return (
    <figure className="m-0 space-y-1.5">
      <figcaption className="flex items-baseline justify-between gap-2 type-chip text-muted">
        <span className="type-eyebrow font-mono">{label}</span>
        <span className="tabular-nums">{dimensions}</span>
      </figcaption>
      {children}
    </figure>
  )
}
