import { auth } from '@clerk/nextjs/server'

import { buildWorkspaceExport } from '@/lib/privacy/export'
import { renderReadableExport } from '@/lib/privacy/readable'
import { buildZip, safeEntryName, type ZipEntry } from '@/lib/privacy/zip'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'

/**
 * The DPDP export, as one archive the customer downloads (DPDP §11, the right
 * to access).
 *
 * ## Why a route handler and not the server action it replaces
 *
 * The action returned a JSON string through the RSC boundary and the browser
 * turned it into a Blob. That works for text and cannot work for FILES: a
 * customer's photographs would have to be base64'd into a React payload, which
 * is a third larger, entirely in memory on both sides, and buffered by the
 * framework before a single byte reaches the browser — so the person watching
 * gets a spinner and no idea whether anything is happening.
 *
 * A route handler returns the bytes. The browser's own download progress is real
 * progress, which is what P3 of this lane's brief asks for and what a fake
 * spinner is not.
 *
 * ## It reads as the member, under RLS
 *
 * `apps/web` has no service-role client on purpose (`lib/supabase/server.ts`).
 * An export endpoint holding a key that bypasses RLS would be the single most
 * attractive thing in this codebase to point at another tenant. The cost is that
 * the archive contains what this member may read — the correct answer to "export
 * MY data" anyway — and every gap is named inside the file rather than left as
 * an absence.
 *
 * ## The size cap, and why it refuses rather than truncates
 *
 * Everything is assembled in memory, so there is a ceiling and it is stated. A
 * customer whose files exceed it gets the JSON and the summary page and a NAMED
 * omission telling them the pictures were too large to send this way and to ask.
 * A truncated archive that reported success would be the one thing this whole
 * module exists to prevent, arriving through the back door.
 */

/** Total uncompressed file bytes the archive will carry. */
const MAX_FILE_BYTES = 180 * 1024 * 1024

/** The most objects fetched, whatever they weigh. Each is one round trip. */
const MAX_FILES = 2000

/** `sahoda-export-2026-08-23.zip` — dated, so two downloads do not overwrite. */
function exportFilename(now: Date): string {
  return `sahoda-export-${now.toISOString().slice(0, 10)}.zip`
}

function refusal(message: string, status: number): Response {
  // Plain text, not JSON. Whatever goes wrong here reaches a person who clicked
  // a download button, and a JSON error object rendered in a browser tab is a
  // dead end with no next step in it.
  return new Response(`${message}\n`, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

export async function GET(): Promise<Response> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return refusal('Sign in to download your data.', 401)

    const workspace = await getActiveWorkspace()
    if (workspace === null) {
      // Not an error, and it must not be worded as one: a person with no
      // workspace has nothing to export, and "something went wrong" would send
      // them looking for a fault that does not exist.
      return refusal('There is no workspace to export yet.', 404)
    }
    workspaceId = workspace.id

    const now = new Date()
    const supabase = createServerSupabase()
    const payload = await buildWorkspaceExport(supabase, {
      workspaceId: workspace.id,
      userId,
      now,
    })

    const entries: ZipEntry[] = []
    const skipped: string[] = []
    let bytes = 0

    for (const file of payload.files) {
      if (entries.length >= MAX_FILES || bytes + (file.bytes ?? 0) > MAX_FILE_BYTES) {
        skipped.push(file.path)
        continue
      }
      const downloaded = await supabase.storage.from(file.bucket).download(file.path)
      if (downloaded.error || !downloaded.data) {
        skipped.push(file.path)
        continue
      }
      const buffer = Buffer.from(await downloaded.data.arrayBuffer())
      bytes += buffer.length
      entries.push({
        name: safeEntryName('files', `${file.bucket}/${file.path}`),
        data: buffer,
      })
    }

    // The skipped list goes INTO the document, not into a log. A file that is
    // missing from `files/` and named nowhere is an omission the customer cannot
    // see, which is the same defect as an empty table with no explanation.
    const document = {
      ...payload,
      filesNotListed:
        skipped.length > 0
          ? [
              ...payload.filesNotListed,
              {
                bucket: '(various)',
                prefix: skipped.slice(0, 50).join(', '),
                reason:
                  `${skipped.length} file(s) are listed in this document but their contents are ` +
                  `not in the archive — this download has a size limit. Ask Sahoda and we will ` +
                  `send them another way.`,
              },
            ]
          : payload.filesNotListed,
    }

    entries.unshift(
      { name: 'your-data.html', data: Buffer.from(renderReadableExport(document), 'utf8') },
      // Indented on purpose. This file exists to be READ — by the customer, by a
      // lawyer, possibly by a regulator — and a single-line JSON blob is
      // technically the same data and practically unreadable.
      { name: 'data.json', data: Buffer.from(JSON.stringify(document, null, 2), 'utf8') },
    )

    const archive = buildZip(entries, now)
    return new Response(new Uint8Array(archive), {
      status: 200,
      headers: {
        'content-type': 'application/zip',
        'content-length': String(archive.length),
        'content-disposition': `attachment; filename="${exportFilename(now)}"`,
        // Never cached, anywhere. This is one person's entire record.
        'cache-control': 'no-store, private',
      },
    })
  } catch (error) {
    await reportServerError(error, { action: 'privacyExportRoute', workspaceId })
    return refusal('We could not build that export, so nothing was downloaded.', 500)
  }
}
