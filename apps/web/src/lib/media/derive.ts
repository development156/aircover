import 'server-only'

import sharp from 'sharp'

import { sniffImage } from '../posts/sniff-image'
import type { CropRect, FocalPoint } from './crop-geometry'
import { CENTRE, normaliseFocal } from './crop-geometry'

/**
 * THE PIPELINE. Sharp, server-side, one buffer in and a NEW buffer out.
 *
 * ── THE ORIGINAL IS NEVER MODIFIED ──────────────────────────────────────────
 * Not "is not currently modified" — cannot be. `sharp(input)` reads the buffer
 * and every operation writes into a new one; there is no in-place mode and this
 * module never calls `toFile`. The stored object is never opened for writing by
 * anything here, and the derivative is uploaded to a different key under a
 * different folder. `derive.test.ts` asserts the input buffer is byte-identical
 * after a crop, which is the version of that claim a reader can check.
 *
 * ── AND THE FACTS ABOUT THE OUTPUT ARE SNIFFED, NOT PREDICTED ───────────────
 * Sharp reports what it thinks it wrote. Everything downstream — the Constraint
 * Engine re-run, the row, the "used in" record — is fed `sniffImage`'s reading of
 * the actual bytes instead, which is the same discipline the upload paths already
 * apply to what the browser claims. A derivative whose dimensions came from the
 * thing that produced it is a derivative nobody checked.
 *
 * ── EXIF ORIENTATION IS BAKED IN, DELIBERATELY ──────────────────────────────
 * `.rotate()` with no argument applies the EXIF orientation and drops the tag.
 * That matters here more than anywhere else: a browser applies EXIF when it
 * renders, so the crop preview a person adjusts is of the ORIENTED image. A
 * derivative cut from the unoriented pixels would be a different photograph from
 * the one they approved. Baking it in makes the preview, the crop and the stored
 * file one thing.
 *
 * It also means `plannedSize` must be computed against ORIENTED dimensions, which
 * is what `orientedSize` below is for. Note that `sniffImage` reads a JPEG's SOF
 * header and knows nothing about EXIF — so an EXIF-rotated original is judged by
 * the Constraint Engine on its unrotated dimensions. That is a pre-existing gap
 * in the attach path, it is not widened here, and it is recorded in the lane
 * report rather than fixed quietly inside a module that only handles crops.
 */

/** Sharp's own ceiling on how many pixels it will decode. Guards a decompression bomb. */
const MAX_PIXELS = 100_000_000

/** Quality steps tried in order until the output is under the channel's byte cap. */
const QUALITY_LADDER: readonly number[] = [82, 72, 62, 52]

function open(input: Uint8Array): sharp.Sharp {
  // `limitInputPixels` refuses an image whose declared dimensions would allocate
  // more than this, which is the defence against a small file that decodes to
  // gigabytes. `failOn: 'error'` refuses a truncated file rather than returning
  // whatever it managed to read.
  return sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
}

export interface OrientedImage {
  width: number
  height: number
  /** True when more than one frame — an animated GIF or WebP. */
  animated: boolean
}

/**
 * The image's dimensions AS A BROWSER WOULD SHOW THEM, and whether it moves.
 *
 * An EXIF orientation of 5–8 means the stored pixels are rotated a quarter turn
 * from how the photograph is meant to be seen, so width and height swap. Reading
 * the stored dimensions and planning a crop from them would cut a landscape
 * rectangle out of a portrait photograph.
 */
export async function orientedSize(input: Uint8Array): Promise<OrientedImage | null> {
  try {
    const meta = await open(input).metadata()
    const width = meta.width
    const height = meta.height
    if (width === undefined || height === undefined || width < 1 || height < 1) return null
    const quarterTurn = typeof meta.orientation === 'number' && meta.orientation >= 5
    return {
      width: quarterTurn ? height : width,
      height: quarterTurn ? width : height,
      animated: (meta.pages ?? 1) > 1,
    }
  } catch {
    return null
  }
}

export interface RenderedDerivative {
  bytes: Uint8Array
  mime: string
  width: number
  height: number
  /** The quality actually used, or null for a lossless container. */
  quality: number | null
}

export type RenderResult =
  | { ok: true; derivative: RenderedDerivative }
  | { ok: false; reason: 'decode_failed' | 'unreadable_output' | 'still_too_large' }

function encode(pipeline: sharp.Sharp, mime: string, quality: number): sharp.Sharp {
  switch (mime) {
    case 'image/webp':
      return pipeline.webp({ quality })
    case 'image/png':
      // Quality is not a JPEG-style knob for PNG. `palette` quantises, which is
      // what actually moves the byte count for the graphics PNG usually holds.
      return pipeline.png({ compressionLevel: 9, palette: quality < 82 })
    case 'image/gif':
      return pipeline.gif()
    default:
      // JPEG. `mozjpeg` is a strictly better encoder at the same quality number.
      return pipeline.jpeg({ quality, mozjpeg: true })
  }
}

/** Whether this container has a quality knob worth stepping down. */
function lossy(mime: string): boolean {
  return mime === 'image/jpeg' || mime === 'image/webp' || mime === 'image/png'
}

/**
 * Cut `rect` out of `input` and encode it as `mime`, under `maxBytes`.
 *
 * `rect` is in ORIENTED coordinates — see the header. The extract happens after
 * `.rotate()`, so the two agree.
 *
 * The quality ladder is walked only as far as it needs to be: the first encode
 * that lands under the cap wins, so an ordinary photo is written once at 82 and
 * nothing worse is ever stored to save bytes nobody needed.
 */
export async function renderDerivative(
  input: Uint8Array,
  rect: CropRect,
  mime: string,
  maxBytes: number,
): Promise<RenderResult> {
  let smallest: RenderedDerivative | null = null

  for (const quality of lossy(mime) ? QUALITY_LADDER : [82]) {
    let out: Buffer
    try {
      // A fresh pipeline per attempt. Reusing one across encodes is how a second
      // `toBuffer` on a consumed stream turns into an empty file.
      // `extract` names its origin `left`/`top`, not `x`/`y`. Passing a CropRect
      // straight in type-checks — every field is optional to sharp's typings —
      // and then crops from (0,0) or throws. Mapped explicitly, once.
      out = await encode(
        open(input)
          .rotate()
          .extract({ left: rect.x, top: rect.y, width: rect.width, height: rect.height }),
        mime,
        quality,
      ).toBuffer()
    } catch {
      return { ok: false, reason: 'decode_failed' }
    }

    const bytes = new Uint8Array(out)
    // Facts from the bytes, not from the encoder that produced them.
    const sniffed = sniffImage(bytes)
    if (!sniffed.ok) return { ok: false, reason: 'unreadable_output' }

    const candidate: RenderedDerivative = {
      bytes,
      mime: sniffed.image.mime,
      width: sniffed.image.width,
      height: sniffed.image.height,
      quality: lossy(mime) ? quality : null,
    }
    if (bytes.byteLength <= maxBytes) return { ok: true, derivative: candidate }
    // Kept only so the failure can report how close it got; never returned as a
    // success. A file over the cap is one the engine refuses.
    if (smallest === null || bytes.byteLength < smallest.bytes.byteLength) smallest = candidate
  }

  return { ok: false, reason: 'still_too_large' }
}

/**
 * WHERE THE SUBJECT PROBABLY IS — the starting focal point, so the default crop
 * is not blindly centred.
 *
 * "A default centre crop cuts heads off product photos and faces out of team
 * photos" is the founder's complaint and it is correct. libvips can find the
 * region of highest entropy — the busy part of the picture, which for a portrait
 * is the face — and sharp exposes where it landed as `cropOffsetLeft/Top` after a
 * cover resize.
 *
 * BEST EFFORT, AND CENTRE IS A FINE ANSWER. This is a suggestion the person then
 * moves; if libvips declines, or the numbers do not map back cleanly, the centre
 * is returned and the adjustment handle is what actually solves the problem. A
 * clever default that is silently wrong is worse than a plain one.
 */
export async function suggestFocal(
  input: Uint8Array,
  oriented: { width: number; height: number },
  size: { width: number; height: number },
): Promise<FocalPoint> {
  if (size.width >= oriented.width && size.height >= oriented.height) return CENTRE
  try {
    const { info } = await open(input)
      .rotate()
      .resize({
        width: size.width,
        height: size.height,
        fit: 'cover',
        position: sharp.strategy.attention,
      })
      .toBuffer({ resolveWithObject: true })

    const left = info.cropOffsetLeft
    const top = info.cropOffsetTop
    if (typeof left !== 'number' || typeof top !== 'number') return CENTRE

    // The offsets are reported in the SCALED image's coordinates, where the scale
    // is whatever made the source cover the requested box. Mapping back through
    // that scale is what turns them into a point in the original.
    const scale = Math.max(size.width / oriented.width, size.height / oriented.height)
    if (!Number.isFinite(scale) || scale <= 0) return CENTRE

    const centreX = (Math.abs(left) + size.width / 2) / scale
    const centreY = (Math.abs(top) + size.height / 2) / scale
    return normaliseFocal({ x: centreX / oriented.width, y: centreY / oriented.height })
  } catch {
    return CENTRE
  }
}
