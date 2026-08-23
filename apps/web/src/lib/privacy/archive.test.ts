/**
 * The archive's arithmetic, and the one claim it exists to keep.
 *
 * A short archive that reads as complete is the failure this whole module set is
 * built against — and until this file existed it was the only part of that claim
 * with no assertion behind it, because the logic lived inline in a route handler
 * that needs a Clerk session and a Supabase client to reach.
 *
 * Everything here drives `buildArchiveEntries` directly with a fake downloader.
 */
import { describe, it, expect } from 'vitest'

import { buildArchiveEntries, MAX_FILE_BYTES, MAX_FILES, type Downloader } from './archive'
import type { WorkspaceExport } from './export'

const WS = '11111111-2222-3333-4444-555555555555'

function exportWith(files: WorkspaceExport['files']): WorkspaceExport {
  return {
    format: 'sahoda.workspace-export.v2',
    workspaceId: WS,
    generatedAt: '2026-08-23T00:00:00.000Z',
    included: [{ table: 'posts', describes: 'your posts', rows: [{ id: 'p1' }], truncated: false }],
    notIncluded: [],
    files,
    filesNotListed: [],
  }
}

function file(path: string, bytes: number): WorkspaceExport['files'][number] {
  return { bucket: 'media', path: `${WS}/${path}`, bytes, mime: 'image/jpeg', updatedAt: null }
}

const givesBytes =
  (size = 10): Downloader =>
  () =>
    Promise.resolve(Buffer.alloc(size, 1))

/** Reads `data.json` back out of the archive, the way an extractor would. */
function documentIn(entries: { name: string; data: Buffer }[]): WorkspaceExport {
  const json = entries.find((e) => e.name === 'data.json')
  expect(json, 'the archive has no data.json').toBeDefined()
  return JSON.parse(json!.data.toString('utf8')) as WorkspaceExport
}

describe('what the archive carries', () => {
  it('puts the readable page first, then the data, then the files', async () => {
    const archive = await buildArchiveEntries(exportWith([file('a.jpg', 10)]), givesBytes())
    expect(archive.entries.map((e) => e.name)).toEqual([
      'your-data.html',
      'data.json',
      `files/media/${WS}/a.jpg`,
    ])
  })

  it('says nothing was left out when nothing was', async () => {
    const archive = await buildArchiveEntries(exportWith([file('a.jpg', 10)]), givesBytes())
    expect(archive.document.filesNotListed).toEqual([])
    expect(archive.entries.find((e) => e.name === 'your-data.html')!.data.toString()).toContain(
      'Nothing was left out',
    )
  })
})

describe('what it does when something will not fit', () => {
  it('NAMES a file whose download failed, and keeps going', async () => {
    const download: Downloader = (_bucket, path) =>
      Promise.resolve(path.endsWith('bad.jpg') ? null : Buffer.alloc(10))
    const archive = await buildArchiveEntries(
      exportWith([file('a.jpg', 10), file('bad.jpg', 10), file('c.jpg', 10)]),
      download,
    )
    // The other two still travel. One unreadable object must not cost the
    // customer the rest of their library.
    expect(archive.entries.filter((e) => e.name.startsWith('files/'))).toHaveLength(2)

    const note = archive.document.filesNotListed[0]
    expect(note, 'a skipped file was not named in the document').toBeDefined()
    expect(note!.prefix).toContain('bad.jpg')
    expect(note!.reason).toMatch(/1 file/)
  })

  it('refuses to exceed the byte ceiling, and says how many it left', async () => {
    const big = Math.floor(MAX_FILE_BYTES / 2) + 1
    const archive = await buildArchiveEntries(
      exportWith([file('a.jpg', big), file('b.jpg', big), file('c.jpg', big)]),
      // The fake returns one byte regardless of the declared size: the ceiling
      // must be decided from the LISTING, before any download, or a customer
      // whose library is 4 GB pays for 4 GB of round trips to be told no.
      givesBytes(1),
    )
    expect(archive.entries.filter((e) => e.name.startsWith('files/'))).toHaveLength(1)
    expect(archive.document.filesNotListed[0]!.reason).toMatch(/2 file/)
  })

  it('refuses to exceed the file-count ceiling', async () => {
    const many = Array.from({ length: MAX_FILES + 5 }, (_, i) => file(`f${i}.jpg`, 1))
    const archive = await buildArchiveEntries(exportWith(many), givesBytes(1))
    expect(archive.entries.filter((e) => e.name.startsWith('files/'))).toHaveLength(MAX_FILES)
    expect(archive.document.filesNotListed[0]!.reason).toMatch(/5 file/)
  })

  it('keeps the note that was already there', async () => {
    // A folder that could not be LISTED and a file that could not be DOWNLOADED
    // are different facts, and both belong in the document.
    const payload = exportWith([file('a.jpg', 10)])
    const withNote: WorkspaceExport = {
      ...payload,
      filesNotListed: [{ bucket: 'media', prefix: WS, reason: 'a folder timed out' }],
    }
    const archive = await buildArchiveEntries(withNote, () => Promise.resolve(null))
    expect(archive.document.filesNotListed).toHaveLength(2)
    expect(archive.document.filesNotListed[0]!.reason).toBe('a folder timed out')
  })
})

describe('the document IN the archive is the document that describes it', () => {
  it('data.json carries the skipped note, not the pre-skip version', async () => {
    // The defect this closes: building the page and the JSON from the ORIGINAL
    // payload produces an archive whose own summary says nothing was left out
    // while three files are missing from it. That is precisely a short export
    // that reads as complete.
    const archive = await buildArchiveEntries(
      exportWith([file('a.jpg', 10), file('b.jpg', 10)]),
      () => Promise.resolve(null),
    )
    expect(documentIn(archive.entries).filesNotListed).toHaveLength(1)
    expect(documentIn(archive.entries).filesNotListed[0]!.reason).toMatch(/2 file/)
  })

  it('your-data.html says it too, in words a person reads', async () => {
    const archive = await buildArchiveEntries(exportWith([file('a.jpg', 10)]), () =>
      Promise.resolve(null),
    )
    const page = archive.entries.find((e) => e.name === 'your-data.html')!.data.toString('utf8')
    expect(page).toContain('Some of your files could not be listed')
    expect(page).not.toContain('Nothing was left out')
  })
})
