'use server'

import { auth } from '@clerk/nextjs/server'

import { buildWorkspaceExport } from '@/lib/privacy/export'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'

/**
 * Hand a workspace everything it owns, as one file (DPDP §11 — the right to
 * access).
 *
 * Runs under the caller's own token, so RLS decides what comes back. That is not
 * a limitation worked around: it is the reason this endpoint is safe to have at
 * all. `apps/web` has no service-role client (see `lib/supabase/server.ts`), and
 * an export route holding a key that bypasses RLS would be the most attractive
 * thing in this codebase to point at somebody else's workspace.
 *
 * NOT REVALIDATED and nothing is written — this reads. A `revalidatePath` here
 * would be a lie about what happened.
 */

export type ExportState =
  { ok: true; filename: string; json: string; omitted: number } | { ok: false; message: string }

/** `sahoda-export-2026-08-19.json` — dated, so two downloads do not overwrite. */
function exportFilename(now: Date): string {
  return `sahoda-export-${now.toISOString().slice(0, 10)}.json`
}

export async function exportWorkspaceData(): Promise<ExportState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to export your data.' }

    const workspace = await getActiveWorkspace()
    if (workspace === null) {
      // Not an error, and it must not be worded as one: a person with no
      // workspace has nothing to export, and "something went wrong" would send
      // them looking for a fault that does not exist.
      return { ok: false, message: 'There is no workspace to export yet.' }
    }
    workspaceId = workspace.id

    const now = new Date()
    const payload = await buildWorkspaceExport(createServerSupabase(), {
      workspaceId: workspace.id,
      userId,
      now,
    })

    return {
      ok: true,
      filename: exportFilename(now),
      // Indented on purpose. This file exists to be READ — by the customer, by
      // a lawyer, possibly by a regulator — and a single-line JSON blob is
      // technically the same data and practically unreadable.
      json: JSON.stringify(payload, null, 2),
      // Surfaced so the panel can say it out loud. A count of omissions buried
      // inside the file is a count nobody sees before they rely on it.
      omitted: payload.notIncluded.length,
    }
  } catch (error) {
    await reportServerError(error, { action: 'exportWorkspaceData', workspaceId })
    return { ok: false, message: 'We could not build that export, so nothing was downloaded.' }
  }
}
