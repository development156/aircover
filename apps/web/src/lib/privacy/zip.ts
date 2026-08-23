import 'server-only'

import { crc32, deflateRawSync } from 'node:zlib'

/**
 * A ZIP writer, in about a hundred lines, because the export has to carry FILES.
 *
 * ## Why not a dependency
 *
 * A subject-access export is one archive with a handful of entries and no
 * encryption, no spanning, no zip64, no unicode path games. That is the smallest
 * corner of a format whose libraries exist to handle the rest of it. Against
 * that: this repo runs one lane per session against a shared lockfile, adding a
 * package here makes every other lane rebuild, and `pnpm-lock.yaml` has already
 * been corrupted once by a merge. The corner is written out instead, and it is
 * written to be read.
 *
 * ## What it produces
 *
 * A standard ZIP with deflate (method 8) entries and no data descriptors: the
 * sizes and the CRC are known before the header is written, because every entry
 * is a Buffer already in memory. `unzip`, macOS Archive Utility, Windows
 * Explorer and every language's stdlib open it.
 *
 * ## What it deliberately does NOT do
 *
 *  · **No zip64.** An archive over 4 GB, or one entry over 4 GB, would need it.
 *    `assertFits` REFUSES rather than emitting a file that unzips to silent
 *    truncation — which is the export failure mode this whole module exists to
 *    avoid, arriving through the back door.
 *  · **No streaming.** Everything is in memory. The caller owns the size cap,
 *    and `route.ts` states what it is and what it does when it is reached.
 */

/** ZIP's own limit before zip64 is required, for a size, an offset or a count. */
const FOUR_GB = 0xffffffff
const MAX_ENTRIES = 0xffff

export interface ZipEntry {
  /** The path inside the archive. Forward slashes, no leading slash. */
  readonly name: string
  readonly data: Buffer
}

/**
 * A DOS date-time, which is what ZIP stores.
 *
 * Taken from a real instant rather than fixed, so the archive's timestamps mean
 * something — but clamped at 1980 because DOS cannot represent anything earlier
 * and an out-of-range value writes a header a stricter reader rejects.
 */
function dosDateTime(when: Date): { time: number; date: number } {
  const year = Math.max(1980, when.getFullYear())
  const time =
    (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2)
  const date = ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate()
  return { time, date }
}

function assertFits(value: number, what: string): void {
  if (value > FOUR_GB) {
    throw new Error(
      `this export needs zip64 (${what} is ${value} bytes) and the writer does not emit it`,
    )
  }
}

/**
 * Every entry, as one archive.
 *
 * Names are encoded UTF-8 and general-purpose bit 11 is set to say so — without
 * it a reader is entitled to decode them as CP437, and a customer's file whose
 * name is not ASCII comes out as mojibake in the one document that is supposed
 * to be evidence of what was held.
 */
export function buildZip(entries: readonly ZipEntry[], when: Date = new Date()): Buffer {
  if (entries.length > MAX_ENTRIES) {
    throw new Error(
      `this export needs zip64 (${entries.length} entries) and the writer does not emit it`,
    )
  }
  const { time, date } = dosDateTime(when)
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const crc = crc32(entry.data)
    const compressed = deflateRawSync(entry.data)
    assertFits(entry.data.length, `"${entry.name}" uncompressed`)
    assertFits(compressed.length, `"${entry.name}" compressed`)
    assertFits(offset, 'the archive')

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0) // local file header signature
    local.writeUInt16LE(20, 4) // version needed: 2.0, which is deflate
    local.writeUInt16LE(0x0800, 6) // bit 11: the name is UTF-8
    local.writeUInt16LE(8, 8) // method: deflate
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28) // no extra field
    locals.push(local, name, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0) // central directory header signature
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(entry.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30) // extra length
    central.writeUInt16LE(0, 32) // comment length
    central.writeUInt16LE(0, 34) // disk number
    central.writeUInt16LE(0, 36) // internal attributes
    central.writeUInt32LE(0, 38) // external attributes
    central.writeUInt32LE(offset, 42) // where the local header is
    centrals.push(central, name)

    offset += local.length + name.length + compressed.length
  }

  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0)
  assertFits(centralSize, 'the central directory')

  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0) // end of central directory signature
  end.writeUInt16LE(0, 4) // this disk
  end.writeUInt16LE(0, 6) // disk with the central directory
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20) // no comment

  return Buffer.concat([...locals, ...centrals, end])
}

/**
 * A path that is safe to put in an archive.
 *
 * A storage key is customer-influenced — a file name reaches it — and an entry
 * called `../../etc/x` is a zip-slip: several extractors will happily write
 * outside the destination folder. Nothing here should ever produce one, which is
 * exactly why it is enforced rather than assumed.
 */
export function safeEntryName(prefix: string, path: string): string {
  const cleaned = path
    .split('/')
    .filter((part) => part !== '' && part !== '.' && part !== '..')
    // The characters a file system refuses, and nothing else.
    //
    // Written as an explicit set rather than a range. The first draft used
    // `[ -\\:*?"<>|]`, in which ` -\\` is a RANGE from space (0x20) to
    // backslash (0x5C): it swallows every capital letter and every digit, so
    // `Shopfront2.JPG` would have unzipped as `__________.JPG`. A test asserts
    // an ordinary name survives, because that mistake is invisible in a review
    // and obvious in an assertion.
    .map((part) => part.replace(/[\u0000-\u001f\\:*?"<>|]/g, '_'))
    .join('/')
  return `${prefix}/${cleaned === '' ? 'unnamed' : cleaned}`
}
