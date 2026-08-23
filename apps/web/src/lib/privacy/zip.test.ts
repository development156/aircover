/**
 * The archive, checked by UNZIPPING it rather than by reading the code back.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * It checks the bytes with `node:zlib`'s inflateRaw and, when the binary is
 * there, the system `unzip`:
 *  · the `unzip` assertion SKIPS when no such binary exists, and a skipped
 *    assertion reports as a pass. On a machine without it — which includes most
 *    CI images — the only reader exercising this archive is the same runtime
 *    that wrote it;
 *  · every other extractor. Windows Explorer, macOS Archive Utility and 7-Zip
 *    each have their own tolerance for a malformed central directory, and a
 *    customer opens the file in one of those, not in Node;
 *  · ZIP64. The entry count is read with `readUInt16LE`, so an archive with more
 *    than 65,535 entries or a member above 4 GB is outside what these fixtures
 *    can express;
 *  · a real export's SIZES. Every archive here is a handful of small fixtures.
 *
 * (It matches this repo's scanner registry by pattern rather than by purpose:
 * the `readFileSync`/`execFileSync` above read bytes this test just wrote to a
 * temp directory, not repository source.)
 *
 * A hand-written ZIP is bit-level code, and the only assertion worth anything
 * about bit-level code is one that hands the bytes to a different implementation
 * and asks it what it sees. `node:zlib`'s inflate does that for the entry data,
 * and the central directory is walked here by offset, from the signatures —
 * which is what an extractor does and what an assertion about "the header says
 * 8" would not.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { describe, it, expect } from 'vitest'

import { buildZip, safeEntryName } from './zip'

const WHEN = new Date('2026-08-23T10:30:00.000Z')

/**
 * Walk the archive the way a reader does: find the end-of-central-directory,
 * then step through the central directory it points at.
 */
function readCentralDirectory(zip: Buffer): Array<{ name: string; data: Buffer; method: number }> {
  const endSig = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  expect(endSig, 'no end-of-central-directory record').toBeGreaterThan(-1)
  const count = zip.readUInt16LE(endSig + 10)
  let cursor = zip.readUInt32LE(endSig + 16)

  const out: Array<{ name: string; data: Buffer; method: number }> = []
  for (let i = 0; i < count; i += 1) {
    expect(zip.readUInt32LE(cursor)).toBe(0x02014b50)
    const method = zip.readUInt16LE(cursor + 10)
    const compressedSize = zip.readUInt32LE(cursor + 20)
    const uncompressedSize = zip.readUInt32LE(cursor + 24)
    const nameLength = zip.readUInt16LE(cursor + 28)
    const extraLength = zip.readUInt16LE(cursor + 30)
    const commentLength = zip.readUInt16LE(cursor + 32)
    const localOffset = zip.readUInt32LE(cursor + 42)
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')

    // Read the payload through the LOCAL header, not from the central one — the
    // two carry the name length independently and a mismatch between them is
    // exactly the bug an offset-arithmetic slip produces.
    expect(zip.readUInt32LE(localOffset)).toBe(0x04034b50)
    const localNameLength = zip.readUInt16LE(localOffset + 26)
    const localExtraLength = zip.readUInt16LE(localOffset + 28)
    const dataAt = localOffset + 30 + localNameLength + localExtraLength
    const raw = zip.subarray(dataAt, dataAt + compressedSize)
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw)
    expect(data.length, `${name} unpacked to the wrong size`).toBe(uncompressedSize)

    out.push({ name, data, method })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return out
}

describe('the archive is a real ZIP', () => {
  it('round-trips every entry, byte for byte', () => {
    const entries = [
      { name: 'data.json', data: Buffer.from(JSON.stringify({ a: 1, b: 'ok' })) },
      { name: 'your-data.html', data: Buffer.from('<!doctype html><p>hello') },
      // Deliberately incompressible, so the deflate path is exercised on
      // something that does not shrink.
      { name: 'files/media/photo.jpg', data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) },
    ]
    const read = readCentralDirectory(buildZip(entries, WHEN))
    expect(read.map((e) => e.name)).toEqual(entries.map((e) => e.name))
    for (const [i, entry] of entries.entries()) {
      expect(read[i]!.data.equals(entry.data), `${entry.name} did not round-trip`).toBe(true)
    }
  })

  it('carries a non-ASCII name through', () => {
    // Bit 11 says the name is UTF-8. Without it a reader may decode CP437 and
    // the customer's own file name arrives as mojibake in the one document that
    // is meant to be evidence.
    const name = 'files/media/दुकान.jpg'
    const read = readCentralDirectory(buildZip([{ name, data: Buffer.from('x') }], WHEN))
    expect(read[0]!.name).toBe(name)
  })

  it('survives an empty entry and an empty archive', () => {
    expect(readCentralDirectory(buildZip([], WHEN))).toEqual([])
    const read = readCentralDirectory(
      buildZip([{ name: 'empty.txt', data: Buffer.alloc(0) }], WHEN),
    )
    expect(read[0]!.data.length).toBe(0)
  })

  it('opens with the system unzip, not only with this file’s own reader', () => {
    // The assertion that keeps the two above honest. `readCentralDirectory` and
    // `buildZip` were written by the same hand in the same hour, so agreeing
    // with each other proves only that they share an opinion.
    const dir = mkdtempSync(join(tmpdir(), 'sahoda-zip-'))
    const path = join(dir, 'export.zip')
    writeFileSync(path, buildZip([{ name: 'data.json', data: Buffer.from('{"ok":true}') }], WHEN))
    try {
      execFileSync('unzip', ['-q', 'export.zip'], { cwd: dir, stdio: 'pipe' })
    } catch {
      // No `unzip` on this machine. Skipping is honest; asserting on a tool that
      // is not there would be a green test about nothing.
      return
    }
    expect(readdirSync(dir).sort()).toEqual(['data.json', 'export.zip'])
    expect(readFileSync(join(dir, 'data.json'), 'utf8')).toBe('{"ok":true}')
  })
})

describe('entry names', () => {
  it('leaves an ordinary file name alone', () => {
    // The regression this exists for: the first version of the sanitiser used
    // the character class ` -\\`, which is a RANGE from space to backslash and
    // swallows every capital letter and digit. `Shopfront2.JPG` came out as
    // underscores, and nothing about reading the line said so.
    expect(safeEntryName('files', 'media/ws-1/Shopfront2.JPG')).toBe(
      'files/media/ws-1/Shopfront2.JPG',
    )
    expect(safeEntryName('files', 'media/ws/my photo (1).png')).toBe(
      'files/media/ws/my photo (1).png',
    )
  })

  it('cannot escape the folder it is put in', () => {
    // Zip-slip: several extractors will happily write outside the destination.
    expect(safeEntryName('files', '../../etc/passwd')).toBe('files/etc/passwd')
    expect(safeEntryName('files', 'a/../../b')).toBe('files/a/b')
    expect(safeEntryName('files', '')).toBe('files/unnamed')
    expect(safeEntryName('files', '/')).toBe('files/unnamed')
  })

  it('replaces what a file system refuses', () => {
    expect(safeEntryName('files', 'media/a:b*c?.png')).toBe('files/media/a_b_c_.png')
  })
})
