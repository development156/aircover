import { auth } from '@clerk/nextjs/server'

import { buildArchiveEntries } from '@/lib/privacy/archive'
import { buildWorkspaceExport } from '@/lib/privacy/export'
import { buildZip } from '@/lib/privacy/zip'
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
 * ## What this file does NOT decide
 *
 * The size ceiling, what happens when it is reached, and how a skipped file is
 * named in the document all live in `lib/privacy/archive.ts`. They were here,
 * and that made the one property this endpoint exists to keep — a file listed in
 * the document and absent from `files/` must be NAMED, with a reason, in the
 * document itself — reachable only by mounting a route with a Clerk session and
 * a Supabase client. It is the whole export's claim in miniature and it was the
 * only part with no assertion behind it. `archive.test.ts` drives it now.
 *
 * What is left here is authentication, one download function, and the response.
 */

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

    const { entries } = await buildArchiveEntries(payload, async (bucket, path) => {
      const downloaded = await supabase.storage.from(bucket).download(path)
      if (downloaded.error || !downloaded.data) return null
      return Buffer.from(await downloaded.data.arrayBuffer())
    })

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
