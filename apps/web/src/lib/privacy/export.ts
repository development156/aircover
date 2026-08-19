import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { EXPORT_TABLES, type ExportTable } from './export-manifest'

/**
 * Build the DPDP export: everything this workspace owns, plus an honest account
 * of what is missing from it.
 *
 * ## The part that is not the data
 *
 * An export is a document somebody may rely on for a legal request, and the
 * person reading it has no way to check it. So the only thing worse than an
 * incomplete export is an incomplete export that reads as complete. Three ways
 * that could happen here, and each is closed by construction:
 *
 *  - **A table with no read policy.** PostgREST answers `[]` rather than an
 *    error, and `[]` is indistinguishable from "you have no rows".
 *    `ai_provider_logs` is exactly this — RLS on, no policies at all. It is
 *    listed in `notIncluded` BY NAME with the reason, never as an empty array.
 *  - **A read that fails.** Reported per table in `notIncluded`, never
 *    swallowed into an empty list. A network blip must not silently shorten the
 *    export and call it the export.
 *  - **A table nobody remembered.** The manifest is derived from
 *    `information_schema`, and `export-manifest.test.ts` fails when the schema
 *    grows a workspace-owned table this file does not know about.
 *
 * ## Why it runs as the member and not as a service role
 *
 * `apps/web` has no service-role client on purpose — RLS is the security
 * boundary (see `lib/supabase/server.ts`). An export endpoint holding a key that
 * bypasses RLS would be the single most attractive thing in this codebase to
 * point at another tenant. The cost is that the export contains what this member
 * may read, which is the correct answer to "export MY data" anyway.
 *
 * ## Rows are not reshaped
 *
 * Whatever the column holds is what the file holds. No renaming, no flattening,
 * no prettying. A subject-access export is evidence, and a transformation is a
 * place for a mistake to hide — and for someone later to argue the export was
 * not what the system actually stored.
 */

/** Most rows taken from any one table. See the note on `truncated`. */
export const MAX_ROWS_PER_TABLE = 5000

export interface ExportedTable {
  readonly table: string
  readonly describes: string
  readonly rows: unknown[]
  /**
   * True when the row cap was reached, so the file itself says the list is
   * partial. A cap that is not reported turns a complete-looking export into a
   * quiet lie, which is the one thing this module may not do.
   */
  readonly truncated: boolean
}

export interface OmittedTable {
  readonly table: string
  readonly describes: string
  readonly reason: string
}

export interface WorkspaceExport {
  readonly format: 'sahoda.workspace-export.v1'
  readonly workspaceId: string
  readonly generatedAt: string
  readonly included: ExportedTable[]
  /** Named, always. An omission that is not listed is an omission nobody can see. */
  readonly notIncluded: OmittedTable[]
}

const NO_READ_POLICY_REASON =
  'This table has no read policy for members, so the app cannot read it on your behalf. It is not empty — it simply cannot be included from here. Ask Sahoda for it directly.'

async function readTable(
  supabase: SupabaseClient,
  workspaceId: string,
  entry: ExportTable,
): Promise<{ ok: true; value: ExportedTable } | { ok: false; value: OmittedTable }> {
  try {
    const { data, error } = await supabase
      .from(entry.table)
      .select('*')
      .eq('workspace_id', workspaceId)
      .limit(MAX_ROWS_PER_TABLE)

    if (error) {
      return {
        ok: false,
        value: {
          table: entry.table,
          describes: entry.describes,
          // The message is included because this file is for the customer AND
          // for whoever has to explain the gap to them. It is a PostgREST error
          // about a table name and a policy, never customer content.
          reason: `Could not be read: ${error.message ?? 'the read failed'}`,
        },
      }
    }

    const rows = Array.isArray(data) ? data : []
    return {
      ok: true,
      value: {
        table: entry.table,
        describes: entry.describes,
        rows,
        truncated: rows.length >= MAX_ROWS_PER_TABLE,
      },
    }
  } catch (thrown) {
    return {
      ok: false,
      value: {
        table: entry.table,
        describes: entry.describes,
        reason: `Could not be read: ${thrown instanceof Error ? thrown.message : 'the read threw'}`,
      },
    }
  }
}

/**
 * Read every workspace-owned table this member may read.
 *
 * Sequential rather than concurrent: thirty parallel PostgREST calls from one
 * request is a burst against the connection pool for no benefit a person waiting
 * on a download would notice.
 *
 * `now` is a parameter so the timestamp in the file is the caller's instant and
 * the function stays testable without a clock.
 */
export async function buildWorkspaceExport(
  supabase: SupabaseClient,
  workspaceId: string,
  now: Date = new Date(),
): Promise<WorkspaceExport> {
  const included: ExportedTable[] = []
  const notIncluded: OmittedTable[] = []

  for (const entry of EXPORT_TABLES) {
    if (entry.readability !== 'readable') {
      notIncluded.push({
        table: entry.table,
        describes: entry.describes,
        reason: NO_READ_POLICY_REASON,
      })
      continue
    }

    const result = await readTable(supabase, workspaceId, entry)
    if (result.ok) included.push(result.value)
    else notIncluded.push(result.value)
  }

  return {
    format: 'sahoda.workspace-export.v1',
    workspaceId,
    generatedAt: now.toISOString(),
    included,
    notIncluded,
  }
}
