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
        <div
          className="relative w-full overflow-hidden rounded-input bg-s2"
          style={{ aspectRatio: `${original.width} / ${original.height}` }}
        >
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
        <div
          className="relative w-full overflow-hidden rounded-input border border-line bg-s2"
          style={{ aspectRatio: `${size.width} / ${size.height}` }}
        >
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
