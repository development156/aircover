import { rgbToOklch } from './oklch'

// Client-side dominant-color extraction for the Theme step (docs/superpowers
// spec, "4. Theme") — canvas pixel math only, no color-quantization library.

/** Pixels below this alpha (0–255) are transparent padding — skip them. */
const MIN_ALPHA = 200
/** Pixels brighter than this on every channel are near-white background. */
const NEAR_WHITE_THRESHOLD = 245
/** Pixels darker than this on every channel are near-black background/text. */
const NEAR_BLACK_THRESHOLD = 12
/** Cap on how many dominant colors we ever return. */
const MAX_COLORS = 5

interface ColorBucket {
  rSum: number
  gSum: number
  bSum: number
  count: number
}

function isBackgroundPixel(r: number, g: number, b: number, a: number): boolean {
  if (a < MIN_ALPHA) return true
  if (r > NEAR_WHITE_THRESHOLD && g > NEAR_WHITE_THRESHOLD && b > NEAR_WHITE_THRESHOLD) return true
  if (r < NEAR_BLACK_THRESHOLD && g < NEAR_BLACK_THRESHOLD && b < NEAR_BLACK_THRESHOLD) return true
  return false
}

/**
 * Pure bucket-and-count quantizer. `pixels` is a flat RGBA byte array (the
 * same layout as `ImageData#data`: r,g,b,a,r,g,b,a,…). Groups pixels into
 * coarse RGB buckets, skips background-like pixels (transparent/near-white/
 * near-black — typical logo padding), and returns the most frequent bucket
 * averages as `oklch()` strings, most frequent first.
 */
export function quantize(pixels: ArrayLike<number>): string[] {
  const buckets = new Map<string, ColorBucket>()

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i]!
    const g = pixels[i + 1]!
    const b = pixels[i + 2]!
    const a = pixels[i + 3]!
    if (isBackgroundPixel(r, g, b, a)) continue

    const key = `${r >> 5}-${g >> 5}-${b >> 5}` // >>5 divides by BUCKET_SIZE (32)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.rSum += r
      bucket.gSum += g
      bucket.bSum += b
      bucket.count += 1
    } else {
      buckets.set(key, { rSum: r, gSum: g, bSum: b, count: 1 })
    }
  }

  return [...buckets.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, MAX_COLORS)
    .map((bucket) =>
      rgbToOklch(
        bucket.rSum / bucket.count,
        bucket.gSum / bucket.count,
        bucket.bSum / bucket.count,
      ),
    )
}

/** Downscale the image onto a small canvas, then quantize its pixels. Client-only. */
export function extractPalette(img: HTMLImageElement): string[] {
  const DOWNSCALE_SIZE = 48
  const canvas = document.createElement('canvas')
  canvas.width = DOWNSCALE_SIZE
  canvas.height = DOWNSCALE_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(img, 0, 0, DOWNSCALE_SIZE, DOWNSCALE_SIZE)
  const { data } = ctx.getImageData(0, 0, DOWNSCALE_SIZE, DOWNSCALE_SIZE)
  return quantize(data)
}
