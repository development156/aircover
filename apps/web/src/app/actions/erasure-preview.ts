'use server'

import { auth } from '@clerk/nextjs/server'

import { EXPORT_TABLES } from '@/lib/privacy/export-manifest'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'

/**
 * What deleting this workspace would actually remove, counted from the database
 * at the moment the person asks.
 *
 * ## Why the confirmation is not a written sentence
 *
 * Because a written sentence goes stale and nothing notices. That is not a
 * hypothesis about this codebase — it is what this whole lane was opened to fix.
 * The export manifest's comment said 30 tables when there were 39. The deletion
 * note said "15 of 30 lack a member DELETE policy" when it was 20 of 39. Both
 * were written from a real measurement and both were wrong within days.
 *
 * `workspace_erasure_preview` walks `information_schema` — the SAME query
 * `erase_workspace` walks — and counts rows. So the screen and the deletion
 * cannot disagree about what is in scope, because there is one query and they
 * both read it.
 *
 * ## What the plain words come from
 *
 * The counts come from the database; the ENGLISH comes from the export manifest,
 * which already had to describe every table in a customer's words for the
 * export. A table the manifest does not know about still appears — under its own
 * name rather than being dropped, because a row silently missing from this list
 * would be a row silently missing from the sentence "here is what goes".
 */

export interface ErasureLine {
  readonly table: string
  readonly describes: string
  readonly rows: number
  readonly disposition: 'removed' | 'kept'
}

export type ErasurePreviewState =
  | { ok: true; workspaceName: string; removed: ErasureLine[]; kept: ErasureLine[] }
  | { ok: false; message: string }

/** Customer-facing words for the three tables the export manifest never sees. */
const EXTRA_WORDS: Record<string, string> = {
  ledger_actor_redactions: 'whether your name is shown on your credit record',
}

function describeFor(table: string): string {
  const entry = EXPORT_TABLES.find((t) => t.table === table)
  return entry?.describes ?? EXTRA_WORDS[table] ?? table
}

export async function previewWorkspaceErasure(): Promise<ErasurePreviewState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to see this.' }

    const workspace = await getActiveWorkspace()
    if (workspace === null) return { ok: false, message: 'There is no workspace to delete.' }
    workspaceId = workspace.id

    const { data, error } = await createServerSupabase().rpc('workspace_erasure_preview', {
      p_workspace_id: workspace.id,
    })
    if (error) {
      if (
        error.code === 'PGRST202' ||
        (error.message ?? '').includes('workspace_erasure_preview')
      ) {
        return {
          ok: false,
          message:
            'Deleting a workspace is not switched on for this database yet. Write to support@sahodalabs.com and we will do it by hand.',
        }
      }
      if ((error.message ?? '').includes('ERASURE_NOT_OWNER')) {
        return { ok: false, message: 'Only the owner of this workspace can delete it.' }
      }
      return { ok: false, message: 'We could not work out what would be deleted, so nothing is.' }
    }

    const rows = (Array.isArray(data) ? data : []) as Array<{
      table_name?: unknown
      rows_held?: unknown
      disposition?: unknown
    }>

    const lines: ErasureLine[] = rows.map((row) => ({
      table: String(row.table_name ?? ''),
      describes: describeFor(String(row.table_name ?? '')),
      rows: Number(row.rows_held ?? 0),
      disposition: row.disposition === 'kept' ? 'kept' : 'removed',
    }))

    return {
      ok: true,
      workspaceName: workspace.name,
      // Only what the workspace actually HAS. A confirmation listing forty
      // things a person does not own buries the two they do, and this screen is
      // the last chance they have to notice one of them.
      removed: lines.filter((l) => l.disposition === 'removed' && l.rows > 0),
      kept: lines.filter((l) => l.disposition === 'kept'),
    }
  } catch (error) {
    await reportServerError(error, { action: 'previewWorkspaceErasure', workspaceId })
    return { ok: false, message: 'We could not work out what would be deleted, so nothing is.' }
  }
}
