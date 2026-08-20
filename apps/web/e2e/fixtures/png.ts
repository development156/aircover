import { deflateSync } from 'node:zlib'

/**
 * Synthesise a real PNG of a chosen size.
 *
 * ── WHY NOT A BASE64 LITERAL ─────────────────────────────────────────────────
 * The server derives a file's type and pixel size from its own BYTES — `File.type`
 * is never read — so a fixture has to be a genuine PNG that a decoder agrees
 * with. The smallest useful one is 320×320, because that is Instagram's
 * `imageDims.minW/minH` and an 8×8 placeholder is refused by the Constraint
 * Engine before it ever reaches storage. A 320×320 literal is ~180 KB of
 * base64 pasted into a spec file; this is twenty lines that produce the same
 * thing and can produce a 4×4 as well, for the tests that need one REFUSED.
 *
 * Solid colour, so `deflate` reduces it to a few hundred bytes on the wire while
 * the decoded image is full size — which is exactly the shape that separates
 * "byte length" from "pixel dimensions" in the engine's rules.
 */
const CRC_TABLE: readonly number[] = (() => {
  const table: number[] = []
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buf) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([len, typed, crc])
}

/** A valid 8-bit RGB PNG, `width`×`height`, in one flat colour. */
export function makePng(
  width: number,
  height: number,
  rgb: [number, number, number] = [255, 102, 0],
): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  // Scanlines: one filter byte (0 = None) then RGB triples.
  const stride = width * 3 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * stride
    raw[row] = 0
    for (let x = 0; x < width; x += 1) {
      const p = row + 1 + x * 3
      raw[p] = rgb[0]
      raw[p + 1] = rgb[1]
      raw[p + 2] = rgb[2]
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
