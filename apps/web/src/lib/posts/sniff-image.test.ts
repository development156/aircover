import { CONSTRAINTS, validateMedia } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { sniffImage, type SniffResult } from './sniff-image'

// ---------------------------------------------------------------------------
// Fixtures. Every byte is constructed here — nothing is read from disk, so the
// test proves the sniffer reads bytes rather than trusting a name or an extension.
// ---------------------------------------------------------------------------

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const nth = (value: number, index: number): number => Math.floor(value / 256 ** index) % 256
const beU16 = (value: number): number[] => [nth(value, 1), nth(value, 0)]
const beU32 = (value: number): number[] => [
  nth(value, 3),
  nth(value, 2),
  nth(value, 1),
  nth(value, 0),
]
const leU16 = (value: number): number[] => [nth(value, 0), nth(value, 1)]
const leU24 = (value: number): number[] => [nth(value, 0), nth(value, 1), nth(value, 2)]
const leU32 = (value: number): number[] => [
  nth(value, 0),
  nth(value, 1),
  nth(value, 2),
  nth(value, 3),
]
const ascii = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0))
const join = (...parts: number[][]): Uint8Array => Uint8Array.from(parts.flat())

function png(width: number, height: number, chunkType = 'IHDR'): Uint8Array {
  // 8-byte signature, then a 13-byte IHDR: length, type, width, height, then
  // bit depth / colour type / compression / filter / interlace, then the CRC.
  return join(
    PNG_SIG,
    beU32(13),
    ascii(chunkType),
    beU32(width),
    beU32(height),
    [8, 6, 0, 0, 0],
    beU32(0),
  )
}

function gif(version: '87a' | '89a', width: number, height: number): Uint8Array {
  return join(ascii(`GIF${version}`), leU16(width), leU16(height), [0xf7, 0x00, 0x00])
}

interface Segment {
  marker: number
  payload: number[]
}

const seg = (marker: number, payload: number[]): Segment => ({ marker, payload })

/** A start-of-frame payload: precision, then height, then width, then component count. */
const sofPayload = (width: number, height: number): number[] => [
  8,
  ...beU16(height),
  ...beU16(width),
  3,
]

/** `fill` extra 0xFF bytes are emitted before each marker — legal padding a walker must skip. */
function jpeg(segments: readonly Segment[], fill = 0): Uint8Array {
  const out: number[] = [0xff, 0xd8]
  for (const segment of segments) {
    for (let i = 0; i < fill; i += 1) out.push(0xff)
    out.push(0xff, segment.marker, ...beU16(segment.payload.length + 2), ...segment.payload)
  }
  return Uint8Array.from(out)
}

function webp(fourcc: string, payload: number[]): Uint8Array {
  const body = [...ascii('WEBP'), ...ascii(fourcc), ...leU32(payload.length), ...payload]
  return join(ascii('RIFF'), leU32(body.length), body)
}

const vp8 = (width: number, height: number): Uint8Array =>
  webp('VP8 ', [0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a, ...leU16(width), ...leU16(height)])

/**
 * 14 bits of width-1, then 14 bits of height-1, then the alpha flag and a
 * three-bit version — packed little-endian after the 0x2F signature. The trailing
 * flags matter: they sit directly above the height, so a reader that fails to mask
 * them off reports a wrong height for any image that uses them.
 */
function vp8l(width: number, height: number, alpha = false, version = 0): Uint8Array {
  const flags = (alpha ? 0x10000000 : 0) + version * 0x20000000
  const packed = width - 1 + (height - 1) * 0x4000 + flags
  return webp('VP8L', [0x2f, nth(packed, 0), nth(packed, 1), nth(packed, 2), nth(packed, 3)])
}

const vp8x = (width: number, height: number): Uint8Array =>
  webp('VP8X', [0x10, 0x00, 0x00, 0x00, ...leU24(width - 1), ...leU24(height - 1)])

function expectOk(result: SniffResult): { mime: string; width: number; height: number } {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
  return result.image
}

function expectFail(result: SniffResult): { reason: string; message: string } {
  if (result.ok) throw new Error(`expected failure, got ${result.image.mime}`)
  return result
}

// ---------------------------------------------------------------------------

describe('sniffImage — PNG', () => {
  test('reads the mime and both dimensions from a minimal PNG', () => {
    expect(expectOk(sniffImage(png(1280, 720)))).toEqual({
      mime: 'image/png',
      width: 1280,
      height: 720,
    })
  })

  test('reads dimensions above 65535 because PNG stores them as 32-bit values', () => {
    expect(expectOk(sniffImage(png(70000, 100000)))).toEqual({
      mime: 'image/png',
      width: 70000,
      height: 100000,
    })
  })

  test('reports png for bytes a caller might have labelled jpeg, which is the whole point', () => {
    // The browser's File.type is attacker-controlled; only the bytes are evidence.
    const misnamed = png(250, 250)
    expect(expectOk(sniffImage(misnamed)).mime).toBe('image/png')
  })

  test('treats a PNG signature with a truncated IHDR as incomplete rather than unknown', () => {
    const cut = png(640, 480).slice(0, 22)
    expect(expectFail(sniffImage(cut)).reason).toBe('truncated')
  })

  test('refuses a PNG whose first chunk is not the header chunk instead of reading junk dimensions', () => {
    // Without the chunk-type check the sniffer would read whatever the first
    // chunk happens to hold and report it as a confident pixel size.
    expect(expectFail(sniffImage(png(640, 480, 'tEXt'))).reason).toBe('truncated')
  })

  test('refuses a PNG whose header chunk declares a length the format does not allow', () => {
    // Naming the chunk IHDR is not enough. If it declares any length but 13 it is
    // not a header chunk, and the bytes where the width should sit belong to
    // whatever chunk actually follows — a confident size the file never stated.
    const lying = join(
      PNG_SIG,
      beU32(0),
      ascii('IHDR'),
      beU32(640),
      beU32(480),
      [8, 6, 0, 0, 0],
      beU32(0),
    )
    expect(expectFail(sniffImage(lying)).reason).toBe('truncated')
  })

  test('refuses a PNG declaring a zero dimension rather than passing 0 to the constraint engine', () => {
    // 0 slips under every maxMediaMB and under channels that set no imageDims.
    expect(expectFail(sniffImage(png(0, 480))).reason).toBe('truncated')
    expect(expectFail(sniffImage(png(640, 0))).reason).toBe('truncated')
  })
})

describe('sniffImage — GIF', () => {
  test('reads little-endian dimensions from a GIF87a', () => {
    expect(expectOk(sniffImage(gif('87a', 300, 200)))).toEqual({
      mime: 'image/gif',
      width: 300,
      height: 200,
    })
  })

  test('reads little-endian dimensions from a GIF89a', () => {
    expect(expectOk(sniffImage(gif('89a', 4, 4)))).toEqual({
      mime: 'image/gif',
      width: 4,
      height: 4,
    })
  })

  test('treats a GIF header cut before the screen size as incomplete', () => {
    expect(expectFail(sniffImage(gif('89a', 300, 200).slice(0, 9))).reason).toBe('truncated')
  })
})

describe('sniffImage — JPEG', () => {
  test('finds the frame header when it appears after several other segments', () => {
    // A naive "read a fixed offset" implementation gets this wrong: the frame sits
    // behind a JFIF header, a long comment and a quantisation table.
    const bytes = jpeg([
      seg(0xe0, [...ascii('JFIF'), 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
      seg(0xfe, ascii('a comment long enough to move every downstream offset')),
      seg(
        0xdb,
        Array.from({ length: 65 }, (_unused, i) => i % 256),
      ),
      seg(0xc0, sofPayload(1920, 1080)),
    ])
    expect(expectOk(sniffImage(bytes))).toEqual({ mime: 'image/jpeg', width: 1920, height: 1080 })
  })

  test('reads progressive frames as well as baseline ones', () => {
    expect(expectOk(sniffImage(jpeg([seg(0xc2, sofPayload(800, 600))])))).toEqual({
      mime: 'image/jpeg',
      width: 800,
      height: 600,
    })
  })

  test('reads every start-of-frame marker the format defines', () => {
    const frameMarkers = [
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ]
    for (const marker of frameMarkers) {
      const image = expectOk(sniffImage(jpeg([seg(marker, sofPayload(640, 480))])))
      expect(image).toEqual({ mime: 'image/jpeg', width: 640, height: 480 })
    }
  })

  test('skips the fill bytes that may pad the run-up to a marker', () => {
    const padded = jpeg([seg(0xe0, [0, 0]), seg(0xc0, sofPayload(320, 240))], 3)
    expect(expectOk(sniffImage(padded))).toEqual({ mime: 'image/jpeg', width: 320, height: 240 })
  })

  test('skips standalone markers without trying to read a length that is not there', () => {
    // TEM and RST0 carry no length. Reading two bytes after them would consume the
    // frame marker itself and jump far past the end of the file.
    const bytes = Uint8Array.from([
      0xff,
      0xd8,
      0xff,
      0x01,
      0xff,
      0xd0,
      0xff,
      0xd7,
      0xff,
      0xc0,
      ...beU16(sofPayload(300, 200).length + 2),
      ...sofPayload(300, 200),
    ])
    expect(expectOk(sniffImage(bytes))).toEqual({ mime: 'image/jpeg', width: 300, height: 200 })
  })

  test('does not mistake the huffman, arithmetic-coding or extension markers for a frame', () => {
    // 0xC4, 0xC8 and 0xCC sit inside the 0xC0-0xCF run but are DHT, JPG and DAC.
    // A range check alone would read their payloads as dimensions and return a
    // confidently wrong size for a file that never declares one.
    const bytes = jpeg([
      seg(0xc4, sofPayload(9999, 8888)),
      seg(0xc8, sofPayload(7777, 6666)),
      seg(0xcc, sofPayload(5555, 4444)),
    ])
    expect(expectFail(sniffImage(bytes)).reason).toBe('truncated')
  })

  test('reports incomplete, not unknown, for a JPEG that carries no frame at all', () => {
    // The container is recognised; only the size is missing. Telling the user the
    // file type is unsupported would be a claim the bytes do not support.
    const bytes = jpeg([seg(0xe0, [0, 0]), seg(0xfe, ascii('no frame here'))])
    expect(expectFail(sniffImage(bytes)).reason).toBe('truncated')
  })

  test('gives up at the scan marker instead of walking entropy data as if it were segments', () => {
    // Entropy-coded data is arbitrary bytes, not a segment chain, and it can
    // contain something that looks exactly like a frame marker. A walker that
    // does not stop at the scan reads this and returns a confident 9999x8888
    // for a file that never declared a size.
    const bytes = Uint8Array.from([
      ...jpeg([seg(0xda, [1, 0, 0, 0x3f, 0])]),
      0xff,
      0xc0,
      ...beU16(sofPayload(9999, 8888).length + 2),
      ...sofPayload(9999, 8888),
    ])
    expect(expectFail(sniffImage(bytes)).reason).toBe('truncated')
  })

  test('refuses a frame that declares a segment too short to hold the size it is read for', () => {
    // The frame declares an empty segment, so it states no size at all — but the
    // bytes where a size would have been still exist, because the next segment
    // starts there. Reading them returns a confident 9999x8888 for a file that
    // never declared a dimension, which is exactly what feeds the engine a lie.
    const emptyFrame = Uint8Array.from([
      0xff,
      0xd8,
      0xff,
      0xc0,
      ...beU16(2),
      0x08,
      ...beU16(8888),
      ...beU16(9999),
      3,
      1,
      2,
      3,
    ])
    expect(expectFail(sniffImage(emptyFrame)).reason).toBe('truncated')
  })

  test('refuses a frame whose declared segment ends part-way through the size fields', () => {
    // Worse than the empty case: the height is half inside the segment and half
    // out, so a reader that ignores the declared length returns a size that is
    // neither the file's nor obviously wrong.
    const partialFrame = Uint8Array.from([
      0xff,
      0xd8,
      0xff,
      0xc0,
      ...beU16(5),
      0x08,
      0x11,
      0x22,
      ...beU16(4321),
      ...beU16(1234),
      3,
    ])
    expect(expectFail(sniffImage(partialFrame)).reason).toBe('truncated')
  })

  test('still accepts a frame segment that only just contains the size fields', () => {
    // The guard is about containment, not full frame validation: it must reject
    // everything that puts the size outside the segment and nothing beyond that.
    // Eight bytes is exactly the boundary, so the boundary itself must stay open.
    const minimal = Uint8Array.from([
      0xff,
      0xd8,
      0xff,
      0xc0,
      ...beU16(8),
      0x08,
      ...beU16(48),
      ...beU16(64),
      1,
    ])
    expect(expectOk(sniffImage(minimal))).toEqual({ mime: 'image/jpeg', width: 64, height: 48 })
  })

  test('treats a frame header cut short as incomplete', () => {
    const full = jpeg([seg(0xc0, sofPayload(640, 480))])
    expect(expectFail(sniffImage(full.slice(0, 8))).reason).toBe('truncated')
  })

  test('treats the two-byte start of a JPEG as incomplete rather than unknown', () => {
    expect(expectFail(sniffImage(Uint8Array.from([0xff, 0xd8]))).reason).toBe('truncated')
  })
})

describe('sniffImage — WebP', () => {
  test('reads dimensions from a lossy VP8 chunk', () => {
    expect(expectOk(sniffImage(vp8(640, 480)))).toEqual({
      mime: 'image/webp',
      width: 640,
      height: 480,
    })
  })

  test('masks the scale bits a lossy VP8 chunk packs above the dimensions', () => {
    // The top two bits of each 16-bit field are a scale hint, not size.
    const scaled = vp8(640 | (0b11 << 14), 480 | (0b10 << 14))
    expect(expectOk(sniffImage(scaled))).toEqual({ mime: 'image/webp', width: 640, height: 480 })
  })

  test('reads dimensions from a lossless VP8L chunk, which stores them minus one', () => {
    expect(expectOk(sniffImage(vp8l(1024, 768)))).toEqual({
      mime: 'image/webp',
      width: 1024,
      height: 768,
    })
  })

  test('reads the largest dimensions a lossless VP8L chunk can express', () => {
    expect(expectOk(sniffImage(vp8l(16384, 16384)))).toEqual({
      mime: 'image/webp',
      width: 16384,
      height: 16384,
    })
  })

  test('masks off the alpha flag a lossless VP8L chunk packs directly above the height', () => {
    // A transparent WebP is ordinary, and its alpha bit sits immediately above the
    // 14 height bits. Left unmasked it adds 16384 to every such image's height.
    expect(expectOk(sniffImage(vp8l(1024, 768, true)))).toEqual({
      mime: 'image/webp',
      width: 1024,
      height: 768,
    })
  })

  test('masks off the version bits a lossless VP8L chunk packs above the alpha flag', () => {
    // The version occupies the top three bits, so an unmasked read of a file that
    // sets them returns a height larger than the format can even express.
    expect(expectOk(sniffImage(vp8l(1024, 768, true, 7)))).toEqual({
      mime: 'image/webp',
      width: 1024,
      height: 768,
    })
  })

  test('reads the canvas size from an extended VP8X chunk', () => {
    expect(expectOk(sniffImage(vp8x(2000, 1500)))).toEqual({
      mime: 'image/webp',
      width: 2000,
      height: 1500,
    })
  })

  test('treats a WebP whose chunk stops before the dimensions as incomplete', () => {
    expect(expectFail(sniffImage(vp8(640, 480).slice(0, 24))).reason).toBe('truncated')
    expect(expectFail(sniffImage(vp8l(640, 480).slice(0, 22))).reason).toBe('truncated')
    expect(expectFail(sniffImage(vp8x(640, 480).slice(0, 25))).reason).toBe('truncated')
  })

  test('refuses a lossy chunk that does not carry the keyframe start code', () => {
    // A chunk can name itself VP8 and hold anything. Without the start code the
    // two 16-bit fields we would read are not a size, and returning them would be
    // a confident 640x480 for bytes that are not a bitstream at all.
    const withStartCode = (startCode: number[]): Uint8Array =>
      join(
        ascii('RIFF'),
        leU32(30),
        ascii('WEBP'),
        ascii('VP8 '),
        leU32(14),
        [0xff, 0xff, 0xff],
        startCode,
        leU16(640),
        leU16(480),
      )
    // All three bytes are checked, not just the first: a chunk that opens 0x9D and
    // then diverges is no more a bitstream than one that never matched at all.
    expect(expectFail(sniffImage(withStartCode([0xde, 0xad, 0xbe]))).reason).toBe('truncated')
    expect(expectFail(sniffImage(withStartCode([0x9d, 0x00, 0x00]))).reason).toBe('truncated')
    expect(expectFail(sniffImage(withStartCode([0x9d, 0x01, 0x00]))).reason).toBe('truncated')
    // The control: the same file with the real start code is read normally.
    expect(expectOk(sniffImage(withStartCode([0x9d, 0x01, 0x2a])))).toEqual({
      mime: 'image/webp',
      width: 640,
      height: 480,
    })
  })

  test('refuses a lossless chunk that does not open with the VP8L signature byte', () => {
    // Same trap as the lossy start code: without the signature the four bytes
    // read as a packed size are just whatever the chunk happens to contain.
    const noSignature = join(
      ascii('RIFF'),
      leU32(20),
      ascii('WEBP'),
      ascii('VP8L'),
      leU32(5),
      [0x00],
      leU32(1023 + 767 * 0x4000),
    )
    expect(expectFail(sniffImage(noSignature)).reason).toBe('truncated')
  })

  test('treats a RIFF file that is not WebP as an unsupported type', () => {
    const wav = join(ascii('RIFF'), leU32(40), ascii('WAVEfmt '), leU32(16))
    expect(expectFail(sniffImage(wav)).reason).toBe('unknown_format')
  })

  test('checks the RIFF form itself, not just the chunk that follows it', () => {
    // The fixture above is rejected by the chunk switch alone — its chunk is
    // 'fmt ' — so it never exercises the form field. WAV and AVI open with the
    // same four bytes as WebP, and a chunk id is only four bytes of anyone's
    // choosing: this file declares form WAVE but carries a chunk named 'VP8 '
    // with a valid-looking payload, so only the form check can refuse it.
    const notWebp = join(
      ascii('RIFF'),
      leU32(40),
      ascii('WAVE'),
      ascii('VP8 '),
      leU32(14),
      [0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a],
      leU16(640),
      leU16(480),
    )
    expect(expectFail(sniffImage(notWebp)).reason).toBe('unknown_format')
  })

  test('treats a RIFF header too short to name its form as incomplete', () => {
    expect(expectFail(sniffImage(join(ascii('RIFF'), leU32(40)))).reason).toBe('truncated')
  })

  test('treats a WebP carrying an unrecognised chunk as an unsupported type', () => {
    expect(expectFail(sniffImage(webp('ANIM', [0, 0, 0, 0, 0, 0]))).reason).toBe('unknown_format')
  })
})

describe('sniffImage — refusals', () => {
  test('treats an empty file as incomplete, because no bytes cannot prove a bad format', () => {
    expect(expectFail(sniffImage(new Uint8Array(0))).reason).toBe('truncated')
  })

  test('treats two bytes that match no signature as an unsupported type', () => {
    expect(expectFail(sniffImage(Uint8Array.from([0x00, 0x01]))).reason).toBe('unknown_format')
  })

  test('treats a partial PNG signature as incomplete rather than unknown', () => {
    expect(expectFail(sniffImage(Uint8Array.from(PNG_SIG.slice(0, 4)))).reason).toBe('truncated')
  })

  test('rejects a BMP, a PDF and a ZIP as unsupported types', () => {
    const bmp = join(ascii('BM'), leU32(70), leU32(0), leU32(54), leU32(40), leU32(640), leU32(480))
    const pdf = join(ascii('%PDF-1.7'), [0x0a, 0x25])
    const zip = join([0x50, 0x4b, 0x03, 0x04], [0x14, 0x00, 0x00, 0x00])
    for (const bytes of [bmp, pdf, zip]) {
      expect(expectFail(sniffImage(bytes)).reason).toBe('unknown_format')
    }
  })

  test('never falls back to a guess when the format is not one of the four allowed types', () => {
    // TIFF is a real image format the channels do not accept — reporting it as
    // jpeg or png to get past validateMedia is exactly the failure to avoid.
    const tiff = join([0x49, 0x49, 0x2a, 0x00], leU32(8), leU16(1))
    expect(expectFail(sniffImage(tiff)).reason).toBe('unknown_format')
  })
})

describe('sniffImage — copy', () => {
  // Computed inside each test, not in the describe body: a failure here must show
  // up as a failing test, not as a collection crash that hides the whole file.
  const unsupported = (): { message: string } =>
    expectFail(sniffImage(Uint8Array.from([0x42, 0x4d, 0x36, 0x00])))
  const incomplete = (): { message: string } => expectFail(sniffImage(new Uint8Array(0)))

  test('tells the user which formats to upload when the type is not supported', () => {
    expect(unsupported().message).toMatch(/upload a jpeg, png, webp or gif/i)
  })

  test('tells the user the file looks incomplete rather than blaming its type', () => {
    expect(incomplete().message).toMatch(/re-upload/i)
    expect(incomplete().message).toMatch(/incomplete/i)
    expect(incomplete().message).not.toMatch(/not an image/i)
  })

  test('never leaks byte values, offsets or format internals into any message', () => {
    const failures = [
      new Uint8Array(0),
      Uint8Array.from([0xff, 0xd8]),
      Uint8Array.from([0x00, 0x01]),
      png(640, 480).slice(0, 22),
      png(640, 480, 'tEXt'),
      png(0, 0),
      gif('89a', 300, 200).slice(0, 9),
      jpeg([seg(0xc4, sofPayload(10, 10))]),
      jpeg([seg(0xda, [1, 0])]),
      vp8(640, 480).slice(0, 24),
      webp('ANIM', [0, 0, 0, 0]),
      join(ascii('RIFF'), leU32(40), ascii('WAVEfmt ')),
      join(ascii('%PDF-1.7'), [0x0a]),
      join([0x50, 0x4b, 0x03, 0x04], [0x14]),
    ].map((bytes) => expectFail(sniffImage(bytes)).message)

    expect(failures.length).toBeGreaterThan(0)
    for (const message of failures) {
      expect(message).not.toMatch(/\d/)
      expect(message).not.toMatch(/0x|byte|offset|marker|chunk|header|signature|magic/i)
      expect(message).not.toMatch(/ihdr|riff|vp8|sof|jfif|huffman|entropy|uint8|undefined|null/i)
    }
  })
})

describe('sniffImage — against the real Constraint Engine', () => {
  // The module exists to feed `validateMedia` facts. These pin it to the actual
  // spec in @sahoda/shared rather than to a mime string restated in this file.
  test('only ever reports a type the engine already accepts', () => {
    const reported = [
      expectOk(sniffImage(png(300, 300))).mime,
      expectOk(sniffImage(gif('89a', 300, 300))).mime,
      expectOk(sniffImage(jpeg([seg(0xc0, sofPayload(300, 300))]))).mime,
      expectOk(sniffImage(vp8(300, 300))).mime,
    ]
    // x is the channel that accepts all four; a sniffer that emitted anything
    // else — `image/jpg`, `image/svg+xml` — would fail MEDIA_TYPE everywhere.
    expect(new Set(reported)).toEqual(new Set(CONSTRAINTS.x.mediaTypes))
    for (const mime of reported) {
      const [verdict] = validateMedia([CONSTRAINTS.x], { mime, bytes: 1024 })
      expect(verdict?.violations).toEqual([])
    }
  })

  test('hands the engine dimensions it actually judges, without restating the limits here', () => {
    // gbp sets the tightest floor. The number lives in the spec, never in this
    // module — sniffing reports the size, the engine owns the threshold.
    const floor = CONSTRAINTS.gbp.imageDims
    if (floor === undefined) throw new Error('gbp is expected to declare imageDims')

    const tooSmall = expectOk(sniffImage(png(floor.minW - 1, floor.minH)))
    const [rejected] = validateMedia([CONSTRAINTS.gbp], {
      mime: tooSmall.mime,
      bytes: 1024,
      width: tooSmall.width,
      height: tooSmall.height,
    })
    expect(rejected?.violations.map((violation) => violation.code)).toEqual(['MEDIA_DIMS'])

    const big = expectOk(sniffImage(png(floor.minW, floor.minH)))
    const [cleared] = validateMedia([CONSTRAINTS.gbp], {
      mime: big.mime,
      bytes: 1024,
      width: big.width,
      height: big.height,
    })
    expect(cleared?.violations).toEqual([])
  })
})

describe('sniffImage — accepted limitations', () => {
  test('does not verify that the declared chunk length matches the bytes that follow', () => {
    // A lie about a chunk's length does not change the dimensions we read, so it
    // is not worth a refusal. Pinned so widening this is a deliberate choice.
    const body = [
      ...ascii('WEBP'),
      ...ascii('VP8X'),
      ...leU32(9999),
      0x10,
      0,
      0,
      0,
      ...leU24(99),
      ...leU24(74),
    ]
    const lying = join(ascii('RIFF'), leU32(4), body)
    expect(expectOk(sniffImage(lying))).toEqual({ mime: 'image/webp', width: 100, height: 75 })
  })

  test('does not read past the first frame, so a multi-frame GIF reports the logical screen size', () => {
    const animated = Uint8Array.from([
      ...gif('89a', 500, 400),
      ...ascii('trailing frame data that is never parsed'),
    ])
    expect(expectOk(sniffImage(animated))).toEqual({ mime: 'image/gif', width: 500, height: 400 })
  })

  test('accepts any pixel size the format can express and leaves the limits to the constraint engine', () => {
    // Sniffing reports facts; validateMedia owns MEDIA_DIMS.
    expect(expectOk(sniffImage(png(1, 1)))).toEqual({ mime: 'image/png', width: 1, height: 1 })
  })
})
