/**
 * Derive the REAL type, pixel size and DURATION of a video from its own bytes.
 *
 * ── WHY THIS FILE HAD TO EXIST BEFORE A REEL COULD ─────────────────────────
 * `sniff-image.ts` recognises four image containers and refuses everything else,
 * with no fallback to a client-supplied `File.type`. That refusal is correct and
 * load-bearing — it is the only thing standing between `validateMedia` and a
 * 40 MB video renamed `photo.jpg` — and it means a video cannot ENTER the system
 * at all. Not "is not offered": cannot be stored. So Reels, LinkedIn video and
 * every other moving format were blocked at the door rather than at the adapter
 * (docs/31 §5.1).
 *
 * ── AND WHY DURATION IS THE HALF THAT MATTERS ──────────────────────────────
 * Every video rule worth enforcing is a rule about TIME. A Reel is ≤90 seconds,
 * an X video ≤140, a LinkedIn personal video ≤10 minutes. None of that is
 * derivable from magic bytes or a file size — a 3 MB file can be four seconds or
 * four minutes. A sniffer that returned only a mime would let the product offer
 * "video" while enforcing nothing about it, which is precisely the format this
 * repo refuses to ship.
 *
 * So this reads the ISO base-media `mvhd` box for timescale and duration, and
 * `tkhd` for the displayed size. If it cannot read them it says so, and the
 * caller refuses the file rather than storing one whose rules cannot be checked.
 *
 * Pure and runtime-agnostic: `Uint8Array` in, plain object out. No I/O.
 */

export interface SniffedVideo {
  mime: string
  width: number
  height: number
  /** Whole seconds, rounded up — a 90.2s clip is 91s against a 90s ceiling. */
  durationSeconds: number
}

export type VideoSniffResult =
  | { ok: true; video: SniffedVideo }
  | { ok: false; reason: 'unknown_format' | 'truncated'; message: string }

const UNKNOWN_FORMAT_MESSAGE =
  'Upload an MP4 — this file is not a video type the channels accept.'

/**
 * ── "WE COULD NOT READ IT" IS NOT "IT IS TOO LONG" ─────────────────────────
 * A video whose `moov` box sits at the END of the file — which is what every
 * camera and most encoders produce until the file is explicitly prepared for
 * streaming — cannot be measured from a prefix. Telling that person their file
 * is the wrong type would be false, and telling them nothing would leave them
 * re-uploading forever. So the message names the actual fix.
 */
const UNREADABLE_MESSAGE =
  'This video’s details could not be read, so its length cannot be checked against the channel limits. Re-save it for web or streaming and upload it again.'

const unknownFormat = (): VideoSniffResult => ({
  ok: false,
  reason: 'unknown_format',
  message: UNKNOWN_FORMAT_MESSAGE,
})

const unreadable = (): VideoSniffResult => ({
  ok: false,
  reason: 'truncated',
  message: UNREADABLE_MESSAGE,
})

const chars = (text: string): number[] => Array.from(text, (c) => c.charCodeAt(0))

const FTYP = chars('ftyp')
/** Matroska/WebM's EBML magic. Recognised so it can be REFUSED by name, see below. */
const EBML = [0x1a, 0x45, 0xdf, 0xa3]

function beU32(bytes: Uint8Array, at: number): number | undefined {
  const a = bytes[at]
  const b = bytes[at + 1]
  const c = bytes[at + 2]
  const d = bytes[at + 3]
  if (a === undefined || b === undefined || c === undefined || d === undefined) return undefined
  // Arithmetic, never shifts: `<<24` is signed in JavaScript, and a box length or
  // duration with its top bit set would come back negative and unpack to nonsense.
  return a * 0x1000000 + b * 0x10000 + c * 0x100 + d
}

function beU64(bytes: Uint8Array, at: number): number | undefined {
  const hi = beU32(bytes, at)
  const lo = beU32(bytes, at + 4)
  if (hi === undefined || lo === undefined) return undefined
  // Beyond 2^53 the arithmetic stops being exact. Nothing this product accepts is
  // remotely near it, and returning undefined is the honest answer for a file
  // claiming a duration no format allows anyway.
  if (hi > 0x1fffff) return undefined
  return hi * 0x100000000 + lo
}

const boxType = (bytes: Uint8Array, at: number): string =>
  String.fromCharCode(...Array.from(bytes.slice(at + 4, at + 8)))

/**
 * Walk the boxes at one level, calling `visit` for each.
 *
 * ISO base media is a tree of length-prefixed boxes and there is no fixed offset
 * to anything: `moov` may follow `mdat` of any size, and `tkhd` sits behind
 * however many boxes the encoder wrote. A size of 0 means "to end of file" and a
 * size of 1 means the real 64-bit size follows the type — both are legal and both
 * are handled, because a walker that mishandles them either loops forever or
 * silently reads a neighbouring box's bytes as a duration.
 */
function walkBoxes(
  bytes: Uint8Array,
  start: number,
  end: number,
  visit: (type: string, contentAt: number, contentEnd: number) => boolean,
): boolean {
  let at = start
  while (at + 8 <= end) {
    const declared = beU32(bytes, at)
    if (declared === undefined) return false
    const type = boxType(bytes, at)

    let headerLength = 8
    let size = declared
    if (declared === 1) {
      const large = beU64(bytes, at + 8)
      if (large === undefined) return false
      size = large
      headerLength = 16
    } else if (declared === 0) {
      size = end - at
    }

    // A box that does not advance is a malformed file, and continuing would spin.
    if (size < headerLength) return false

    const contentAt = at + headerLength
    const contentEnd = Math.min(at + size, end)
    if (visit(type, contentAt, contentEnd)) return true
    at += size
  }
  return false
}

/** `mvhd`: the movie header, carrying the timescale and the duration in it. */
function readDuration(bytes: Uint8Array, at: number): number | undefined {
  const version = bytes[at]
  if (version === undefined) return undefined
  // v0 packs 32-bit fields, v1 64-bit, and the timescale sits at a different
  // offset in each. Reading v1 as v0 yields a duration off by orders of magnitude.
  const timescale = version === 1 ? beU32(bytes, at + 20) : beU32(bytes, at + 12)
  const duration = version === 1 ? beU64(bytes, at + 24) : beU32(bytes, at + 16)
  if (timescale === undefined || duration === undefined || timescale <= 0) return undefined
  // A duration of 0 is what an unfinalised or fragmented file reports. It is not
  // a zero-second video; it is an unknown, and rounding it to 0 would clear every
  // length limit there is.
  if (duration <= 0) return undefined
  return Math.ceil(duration / timescale)
}

/**
 * `tkhd`: the track header. Width and height are 16.16 fixed point at the very end.
 *
 * ── THE OFFSET IS COUNTED, NOT REMEMBERED, BECAUSE I GOT IT WRONG ───────────
 * The first version of this was four bytes short. It read the HEIGHT field as
 * the width and ran the height read past the end of the box into the next one's
 * length — which came back as 36, i.e. 0 after the fixed-point divide, so every
 * real MP4 was refused as unreadable. Measured against ffmpeg's own output, not
 * spotted by reading.
 *
 * So the layout is spelled out. From the start of the box CONTENT:
 *   v0: version+flags 4 · creation 4 · modification 4 · trackID 4 · reserved 4
 *       · duration 4  (=24) · reserved 8 (=32) · layer 2 · alternate_group 2
 *       (=36) · volume 2 · reserved 2 (=40) · matrix 36 (=76) → width, height
 *   v1: the three time fields widen to 8 bytes each, adding 12 → 88
 */
const TKHD_SIZE_OFFSET_V0 = 76
const TKHD_SIZE_OFFSET_V1 = 88

function readTrackSize(bytes: Uint8Array, at: number): { width: number; height: number } | null {
  const version = bytes[at]
  if (version === undefined) return null
  const widthAt = at + (version === 1 ? TKHD_SIZE_OFFSET_V1 : TKHD_SIZE_OFFSET_V0)
  const width = beU32(bytes, widthAt)
  const height = beU32(bytes, widthAt + 4)
  if (width === undefined || height === undefined) return null
  // 16.16 fixed point: the integer part is the top sixteen bits.
  const w = Math.round(width / 0x10000)
  const h = Math.round(height / 0x10000)
  // A sound track's tkhd is legally 0×0. Not a size — skip it and keep looking.
  if (w <= 0 || h <= 0) return null
  return { width: w, height: h }
}

/** The mime for an ISO base-media file, from the brand its `ftyp` declares. */
function mimeForBrand(brand: string): string {
  // QuickTime is its own container and X accepts it alongside MP4. Everything
  // else in the ISO family is served as video/mp4, which is what Zernio's
  // `MediaItem.mimeType` expects and what the Constraint Engine will list.
  return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4'
}

export function sniffVideo(bytes: Uint8Array): VideoSniffResult {
  if (bytes.length < 12) return unreadable()

  if (EBML.every((value, index) => bytes[index] === value)) {
    // A real container, and deliberately not supported: WebM duration lives in a
    // variable-length EBML element tree, and no channel here lists it. Refusing it
    // BY NAME beats letting it fall through to "not a video type", which would be
    // a true sentence about a file that plainly is one.
    return unknownFormat()
  }

  const isIso = FTYP.every((value, index) => bytes[4 + index] === value)
  if (!isIso) return unknownFormat()

  const brand = String.fromCharCode(...Array.from(bytes.slice(8, 12)))
  const mime = mimeForBrand(brand)

  let durationSeconds: number | undefined
  let size: { width: number; height: number } | null = null

  walkBoxes(bytes, 0, bytes.length, (type, contentAt, contentEnd) => {
    if (type !== 'moov') return false
    walkBoxes(bytes, contentAt, contentEnd, (child, childAt, childEnd) => {
      if (child === 'mvhd') durationSeconds = readDuration(bytes, childAt)
      if (child === 'trak') {
        walkBoxes(bytes, childAt, childEnd, (grand, grandAt) => {
          // The FIRST track with a real size wins, and a soundtrack's 0×0 tkhd is
          // skipped rather than accepted — `size ??=` would have taken it.
          if (grand === 'tkhd' && size === null) size = readTrackSize(bytes, grandAt)
          return false
        })
      }
      return false
    })
    return true
  })

  // Both halves or neither. A video whose length we cannot read is a video whose
  // rules we cannot enforce, and storing it would put a file in the library that
  // every channel silently clears.
  if (durationSeconds === undefined || size === null) return unreadable()

  const { width, height } = size as { width: number; height: number }
  return { ok: true, video: { mime, width, height, durationSeconds } }
}
