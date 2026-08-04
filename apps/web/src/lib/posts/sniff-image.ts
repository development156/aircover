/**
 * Derive the REAL media type and pixel size from a file's own bytes.
 *
 * `validateMedia` checks mime against `spec.mediaTypes`, bytes against
 * `spec.maxMediaMB` and width/height against `spec.imageDims`. If those inputs
 * come from the browser — `File.type`, a filename, anything the client sends —
 * the validation is theatre: a 40 MB video renamed `photo.jpg` clears every
 * channel. So the server sniffs the bytes and feeds the engine facts.
 *
 * Only the four types the Constraint Engine allows are recognised. Anything
 * else is refused outright; there is deliberately no fallback to a
 * client-supplied value, because a wrong guess here reads downstream as a
 * cleared file.
 *
 * The two refusal reasons partition the failure space by what the bytes prove:
 *
 *  - `unknown_format` — we read enough to know this is NOT one of the four.
 *  - `truncated`      — we could not read enough to say. The container may be
 *                       recognised (a JPEG with no frame header) or absent
 *                       entirely (an empty file); either way we ran out of
 *                       usable bytes, and claiming the type is unsupported
 *                       would be a verdict the bytes do not support.
 *
 * Pure and runtime-agnostic: `Uint8Array` in, plain object out. No I/O.
 */

export interface SniffedImage {
  mime: string
  width: number
  height: number
}

export type SniffResult =
  | { ok: true; image: SniffedImage }
  | { ok: false; reason: 'unknown_format' | 'truncated'; message: string }

const UNKNOWN_FORMAT_MESSAGE =
  'Upload a JPEG, PNG, WebP or GIF — this file is not an image type the channels accept.'

const TRUNCATED_MESSAGE =
  'Re-upload this file to check it — it looks incomplete, so it cannot be checked against the channel limits.'

const unknownFormat = (): SniffResult => ({
  ok: false,
  reason: 'unknown_format',
  message: UNKNOWN_FORMAT_MESSAGE,
})

const truncated = (): SniffResult => ({
  ok: false,
  reason: 'truncated',
  message: TRUNCATED_MESSAGE,
})

/**
 * Build the success case, but only for a size that could describe a real image.
 * A zero dimension is not a small picture, it is a dimension we failed to read —
 * and left alone it would sail past every channel that sets no `imageDims`.
 */
function sized(mime: string, width: number | undefined, height: number | undefined): SniffResult {
  if (width === undefined || height === undefined) return truncated()
  if (width <= 0 || height <= 0) return truncated()
  return { ok: true, image: { mime, width, height } }
}

// --- byte readers. Each returns undefined when the file ends first, which is
// how "ran out of bytes" propagates without a length check at every call site.

function beU16(bytes: Uint8Array, at: number): number | undefined {
  const hi = bytes[at]
  const lo = bytes[at + 1]
  if (hi === undefined || lo === undefined) return undefined
  return hi * 0x100 + lo
}

function beU32(bytes: Uint8Array, at: number): number | undefined {
  const hi = beU16(bytes, at)
  const lo = beU16(bytes, at + 2)
  if (hi === undefined || lo === undefined) return undefined
  return hi * 0x10000 + lo
}

function leU16(bytes: Uint8Array, at: number): number | undefined {
  const lo = bytes[at]
  const hi = bytes[at + 1]
  if (lo === undefined || hi === undefined) return undefined
  return hi * 0x100 + lo
}

function leU24(bytes: Uint8Array, at: number): number | undefined {
  const low = leU16(bytes, at)
  const high = bytes[at + 2]
  if (low === undefined || high === undefined) return undefined
  return high * 0x10000 + low
}

/**
 * Read four little-endian bytes as an unsigned value using arithmetic rather
 * than shifts. The field is unsigned and nothing stops a file from setting its
 * top bit; JavaScript's shift operators are signed, so `<<24` would turn such a
 * value negative and the dimensions unpacked from it into nonsense.
 */
function leU32(bytes: Uint8Array, at: number): number | undefined {
  const low = leU16(bytes, at)
  const high = leU16(bytes, at + 2)
  if (low === undefined || high === undefined) return undefined
  return high * 0x10000 + low
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false
  return prefix.every((value, index) => bytes[index] === value)
}

/** True when the file is too short to decide but everything present still matches. */
function isPrefixOf(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length >= signature.length) return false
  return Array.from(bytes).every((value, index) => signature[index] === value)
}

const chars = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0))

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const GIF87A = chars('GIF87a')
const GIF89A = chars('GIF89a')
const JPEG_SOI = [0xff, 0xd8]
const RIFF = chars('RIFF')
const WEBP = chars('WEBP')
const IHDR = chars('IHDR')

// --- PNG ---------------------------------------------------------------------

/** The header chunk is a fixed thirteen bytes; the format allows no other size. */
const IHDR_PAYLOAD_LENGTH = 13

function sniffPng(bytes: Uint8Array): SniffResult {
  // The header chunk is required to come first. Without checking its type we
  // would happily read whatever the first chunk holds and call it a size.
  const isHeaderChunk = IHDR.every((value, index) => bytes[12 + index] === value)
  if (!isHeaderChunk) return truncated()
  // The type alone is not enough. A chunk that names itself the header but
  // declares a different length is not one, and the four bytes where the width
  // should be are then just the next chunk's contents — a confident size for a
  // file that never stated one.
  if (beU32(bytes, 8) !== IHDR_PAYLOAD_LENGTH) return truncated()
  return sized('image/png', beU32(bytes, 16), beU32(bytes, 20))
}

// --- GIF ---------------------------------------------------------------------

function sniffGif(bytes: Uint8Array): SniffResult {
  return sized('image/gif', leU16(bytes, 6), leU16(bytes, 8))
}

// --- JPEG --------------------------------------------------------------------

/** DHT (0xC4), JPG (0xC8) and DAC (0xCC) sit inside the 0xC0-0xCF run but frame nothing. */
const NON_FRAME_MARKERS: ReadonlySet<number> = new Set([0xc4, 0xc8, 0xcc])

const isFrameMarker = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && !NON_FRAME_MARKERS.has(marker)

/**
 * The shortest legal frame segment: the length field itself, then precision,
 * height, width and the component count.
 */
const MIN_FRAME_SEGMENT_LENGTH = 8

/** TEM and the eight restart markers carry no length field to skip. */
const isStandaloneMarker = (marker: number): boolean =>
  marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)

/**
 * Walk the segment chain to the start-of-frame. There is no fixed offset to
 * read: the frame sits behind however many application, comment and table
 * segments the encoder chose to write.
 */
function sniffJpeg(bytes: Uint8Array): SniffResult {
  let at = 2
  while (at < bytes.length) {
    if (bytes[at] !== 0xff) return truncated()
    // A marker may be padded with any number of 0xFF fill bytes.
    while (bytes[at] === 0xff) at += 1

    const marker = bytes[at]
    if (marker === undefined) return truncated()
    at += 1

    if (isStandaloneMarker(marker)) continue
    // End of image, or the start of entropy-coded scan data, which is not a
    // segment chain and must not be walked as one. A frame would have come first.
    if (marker === 0xd9 || marker === 0xda) return truncated()

    const segmentLength = beU16(bytes, at)
    if (segmentLength === undefined || segmentLength < 2) return truncated()

    if (isFrameMarker(marker)) {
      // The dimensions have to lie INSIDE the segment the frame declared. A frame
      // that declares a shorter one has not stated a size at all, and reading on
      // regardless would report the bytes of whatever follows — the next segment,
      // or entropy data — as a confident width and height.
      if (segmentLength < MIN_FRAME_SEGMENT_LENGTH) return truncated()
      return sized('image/jpeg', beU16(bytes, at + 5), beU16(bytes, at + 3))
    }
    at += segmentLength
  }
  return truncated()
}

// --- WebP --------------------------------------------------------------------

const VP8_SCALE_MASK = 0x3fff

/**
 * A still WebP is always a keyframe, and a keyframe always carries this start
 * code right after its three-byte frame tag. Without it the four bytes we would
 * read are not a size — the chunk is simply not the lossy bitstream it claims.
 */
const VP8_START_CODE = [0x9d, 0x01, 0x2a]

function sniffVp8(bytes: Uint8Array, payloadAt: number): SniffResult {
  const hasStartCode = VP8_START_CODE.every(
    (value, index) => bytes[payloadAt + 3 + index] === value,
  )
  if (!hasStartCode) return truncated()
  const width = leU16(bytes, payloadAt + 6)
  const height = leU16(bytes, payloadAt + 8)
  if (width === undefined || height === undefined) return truncated()
  // The top two bits of each field are a scale hint, not part of the size.
  return sized('image/webp', width & VP8_SCALE_MASK, height & VP8_SCALE_MASK)
}

function sniffVp8Lossless(bytes: Uint8Array, payloadAt: number): SniffResult {
  if (bytes[payloadAt] !== 0x2f) return truncated()
  const packed = leU32(bytes, payloadAt + 1)
  if (packed === undefined) return truncated()
  // 14 bits of width-1, then 14 bits of height-1, then alpha and version bits.
  return sized('image/webp', (packed % 0x4000) + 1, (Math.floor(packed / 0x4000) % 0x4000) + 1)
}

function sniffVp8Extended(bytes: Uint8Array, payloadAt: number): SniffResult {
  const width = leU24(bytes, payloadAt + 4)
  const height = leU24(bytes, payloadAt + 7)
  if (width === undefined || height === undefined) return truncated()
  return sized('image/webp', width + 1, height + 1)
}

function sniffWebp(bytes: Uint8Array): SniffResult {
  // RIFF is a container family — WAV and AVI share the first four bytes.
  if (bytes.length < 12) return truncated()
  const isWebp = WEBP.every((value, index) => bytes[8 + index] === value)
  if (!isWebp) return unknownFormat()

  const fourcc = Array.from(bytes.slice(12, 16))
  if (fourcc.length < 4) return truncated()
  const payloadAt = 20

  if (fourcc.every((value, index) => chars('VP8 ')[index] === value))
    return sniffVp8(bytes, payloadAt)
  if (fourcc.every((value, index) => chars('VP8L')[index] === value)) {
    return sniffVp8Lossless(bytes, payloadAt)
  }
  if (fourcc.every((value, index) => chars('VP8X')[index] === value)) {
    return sniffVp8Extended(bytes, payloadAt)
  }
  // A WebP whose first chunk is something else (an animation block, metadata)
  // carries no size we can read here, and guessing one is worse than refusing.
  return unknownFormat()
}

// --- entry point -------------------------------------------------------------

const SIGNATURES: readonly (readonly number[])[] = [PNG_SIGNATURE, GIF87A, GIF89A, JPEG_SOI, RIFF]

/** Determine mime and pixel size from the bytes alone. Never consults a filename. */
export function sniffImage(bytes: Uint8Array): SniffResult {
  if (startsWith(bytes, PNG_SIGNATURE)) return sniffPng(bytes)
  if (startsWith(bytes, GIF87A) || startsWith(bytes, GIF89A)) return sniffGif(bytes)
  if (startsWith(bytes, JPEG_SOI)) return sniffJpeg(bytes)
  if (startsWith(bytes, RIFF)) return sniffWebp(bytes)

  // Too short to have ruled anything out yet — an empty file included. Saying
  // the type is unsupported here would be a claim about bytes we never saw.
  if (SIGNATURES.some((signature) => isPrefixOf(bytes, signature))) return truncated()

  return unknownFormat()
}
