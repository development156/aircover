import { inflateSync } from 'node:zlib'

/**
 * A minimal PNG reader, so a test can read the pixels a browser ACTUALLY
 * composited rather than the colours the cascade says it should have.
 *
 * ── WHY NOT A LIBRARY ────────────────────────────────────────────────────────
 * `sharp` is present in this repo only as a transitive dependency of Next, and
 * `pngjs` is not present at all. Adding either as a direct dependency rewrites
 * hundreds of lines of `pnpm-lock.yaml` — measured 2026-08-20 — which is a poor
 * trade against forty lines that do exactly one thing.
 *
 * ── WHAT IT HANDLES, AND WHAT IT REFUSES ─────────────────────────────────────
 * Non-interlaced, 8-bit, truecolour PNGs with or without alpha, which is what
 * `page.screenshot()` produces. Anything else THROWS rather than returning
 * plausible pixels: a decoder that guessed would make every luminance assertion
 * downstream meaningless while keeping the suite green.
 */

export interface RawImage {
  width: number
  height: number
  channels: 3 | 4
  data: Buffer
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Paeth, from the PNG spec. The one filter that is not obvious by inspection. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

export function decodePng(file: Buffer): RawImage {
  if (!file.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG')

  let width = 0
  let height = 0
  let channels: 3 | 4 = 4
  const idat: Buffer[] = []

  let at = 8
  while (at < file.length) {
    const length = file.readUInt32BE(at)
    const type = file.toString('ascii', at + 4, at + 8)
    const body = file.subarray(at + 8, at + 8 + length)
    at += 12 + length

    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      const depth = body.readUInt8(8)
      const colourType = body.readUInt8(9)
      const interlace = body.readUInt8(12)
      if (depth !== 8) throw new Error(`PNG bit depth ${depth} is not supported`)
      if (interlace !== 0) throw new Error('interlaced PNG is not supported')
      if (colourType === 2) channels = 3
      else if (colourType === 6) channels = 4
      else throw new Error(`PNG colour type ${colourType} is not supported`)
    } else if (type === 'IDAT') {
      idat.push(body)
    } else if (type === 'IEND') {
      break
    }
  }

  if (width === 0 || height === 0) throw new Error('PNG carried no IHDR')

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(height * stride)

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    for (let i = 0; i < stride; i += 1) {
      const x = line[i] ?? 0
      const a = i >= channels ? (out[y * stride + i - channels] ?? 0) : 0
      const b = y > 0 ? (out[(y - 1) * stride + i] ?? 0) : 0
      const c = i >= channels && y > 0 ? (out[(y - 1) * stride + i - channels] ?? 0) : 0
      let value: number
      switch (filter) {
        case 0:
          value = x
          break
        case 1:
          value = x + a
          break
        case 2:
          value = x + b
          break
        case 3:
          value = x + ((a + b) >> 1)
          break
        case 4:
          value = x + paeth(a, b, c)
          break
        default:
          throw new Error(`unknown PNG filter ${filter} on row ${y}`)
      }
      out[y * stride + i] = value & 0xff
    }
  }

  return { width, height, channels, data: out }
}

/**
 * Rec. 709 relative luminance of one pixel, 0-1000.
 *
 * After `filter: grayscale(1)` the three channels are equal, so this reads the
 * single remaining channel back out — which is exactly the point: it is a
 * measurement of what the eye receives with hue removed, not a comparison of two
 * colour strings.
 */
export function luminanceAt(img: RawImage, x: number, y: number): number {
  const px = Math.min(img.width - 1, Math.max(0, Math.round(x)))
  const py = Math.min(img.height - 1, Math.max(0, Math.round(y)))
  const i = (img.width * py + px) * img.channels
  const srgb = (v: number): number => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const r = srgb(img.data[i] ?? 0)
  const g = srgb(img.data[i + 1] ?? 0)
  const b = srgb(img.data[i + 2] ?? 0)
  return Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) * 1000)
}
