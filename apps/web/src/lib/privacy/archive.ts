import 'server-only'

import type { WorkspaceExport } from './export'
import { renderReadableExport } from './readable'
import { safeEntryName, type ZipEntry } from './zip'

/**
 * Turn an export into the entries of an archive — and, when not everything
 * fits, say so INSIDE the document rather than shipping a short zip.
 *
 * ## Why this is not in the route
 *
 * It was, and that made the one property this module exists for untestable
 * without mounting a Next.js route with a Clerk session and a Supabase client.
 * The property is: **a file that is listed in the document and absent from
 * `files/` must be named, with a reason, in the document itself.** That is the
 * whole export's claim in miniature — a short archive that reads as complete is
 * the failure this codebase keeps closing — and it was the only part of it with
 * no assertion behind it.
 *
 * The route now does authentication, the response and the headers. This does the
 * arithmetic, and `archive.test.ts` drives it.
 *
 * ## The caps are refusals, not truncations
 *
 * Everything is assembled in memory in one request, so there is a ceiling. When
 * it is reached, the files are still LISTED with their names and sizes, their
 * bytes are not in the zip, and `filesNotListed` gains an entry saying how many
 * and what to do. Nothing is silently dropped.
 */

/** Total uncompressed file bytes the archive will carry. */
export const MAX_FILE_BYTES = 180 * 1024 * 1024

/** The most objects fetched, whatever they weigh. Each is one round trip. */
export const MAX_FILES = 2000

/** How many skipped paths are named individually before the count speaks for them. */
const NAMED_SKIPS = 50

/**
 * Fetch one object's bytes, or `null`.
 *
 * A function rather than a Supabase client, so this module has no opinion about
 * where bytes come from and the test does not need a storage stand-in to check
 * arithmetic.
 */
export type Downloader = (bucket: string, path: string) => Promise<Buffer | null>

export interface Archive {
  readonly entries: ZipEntry[]
  /** The export as it will be written, INCLUDING the note about what was skipped. */
  readonly document: WorkspaceExport
}

export async function buildArchiveEntries(
  payload: WorkspaceExport,
  download: Downloader,
): Promise<Archive> {
  const files: ZipEntry[] = []
  const skipped: string[] = []
  /** What the LISTING says has been accepted so far. Decides the cap up front. */
  let planned = 0
  /** What actually arrived. The listing can be wrong, or silent. */
  let actual = 0

  for (const file of payload.files) {
    // Checked BEFORE the download, so a file over the ceiling costs no round
    // trip, and so the ceiling is a property of the list rather than of how far
    // the loop happened to get.
    //
    // ⚠ `planned` and `actual` are SEPARATE and both are needed. A first
    // version accumulated only the downloaded length and compared it against the
    // declared size of the next file — so the running total was always near zero
    // until the downloads had already happened, and three files each half the
    // ceiling all passed the check. MEASURED by `archive.test.ts` with a
    // downloader that returns one byte regardless of what the listing claims,
    // which is also what a storage backend does when `metadata.size` is absent.
    if (files.length >= MAX_FILES || planned + (file.bytes ?? 0) > MAX_FILE_BYTES) {
      skipped.push(file.path)
      continue
    }
    const buffer = await download(file.bucket, file.path)
    if (buffer === null) {
      skipped.push(file.path)
      continue
    }
    // The second half: a file the listing did not size, or sized wrongly, is
    // caught here rather than being allowed to blow the ceiling silently.
    if (actual + buffer.length > MAX_FILE_BYTES) {
      skipped.push(file.path)
      continue
    }
    planned += file.bytes ?? buffer.length
    actual += buffer.length
    files.push({ name: safeEntryName('files', `${file.bucket}/${file.path}`), data: buffer })
  }

  // The skipped list goes INTO the document, not into a log. A file missing from
  // `files/` and named nowhere is an omission the customer cannot see, which is
  // the same defect as an empty table with no explanation.
  const document: WorkspaceExport =
    skipped.length === 0
      ? payload
      : {
          ...payload,
          filesNotListed: [
            ...payload.filesNotListed,
            {
              bucket: '(various)',
              prefix: skipped.slice(0, NAMED_SKIPS).join(', '),
              reason:
                `${skipped.length} file(s) are listed in this document but their contents are ` +
                `not in the archive, because this download has a size limit. Ask Sahoda and we will ` +
                `send them another way.`,
            },
          ],
        }

  return {
    // The readable page and the data file are built from the FINAL document, so
    // both carry the skipped note. Building them from `payload` would produce a
    // summary page that says nothing was left out of an archive that is short.
    entries: [
      { name: 'your-data.html', data: Buffer.from(renderReadableExport(document), 'utf8') },
      // Indented on purpose. This file exists to be READ — by the customer, by a
      // lawyer, possibly by a regulator — and a single-line JSON blob is
      // technically the same data and practically unreadable.
      { name: 'data.json', data: Buffer.from(JSON.stringify(document, null, 2), 'utf8') },
      ...files,
    ],
    document,
  }
}
