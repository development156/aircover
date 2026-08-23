import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { EXPORT_TABLES, OMITTED_BY_DESIGN, type ExportTable } from './export-manifest'
import { walkWorkspaceStorage, type StoredObject } from './storage'

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
 *  - **A table the sweep is structurally blind to.** `workspaces` and
 *    `users_profile` hold the business name and the customer's own email and are
 *    keyed by something other than `workspace_id`, so no version of that query
 *    would ever return them. They are read by name, below. `connection_secrets`
 *    is the third and is named in `notIncluded` instead, permanently — see
 *    `OMITTED_BY_DESIGN`.
 *  - **A file.** A photograph is personal data as much as the row pointing at
 *    it. Every object under the workspace's storage prefix is inventoried, and
 *    the caller carries the bytes.
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
  /**
   * v2 — v1 carried no files, no `workspaces` row and no `users_profile` row.
   * The version is in the file so a customer holding an old export can tell
   * which one they have, and so can anybody they hand it to.
   */
  readonly format: 'sahoda.workspace-export.v2'
  readonly workspaceId: string
  readonly generatedAt: string
  readonly included: ExportedTable[]
  /** Named, always. An omission that is not listed is an omission nobody can see. */
  readonly notIncluded: OmittedTable[]
  /**
   * Every file under this workspace's storage prefix. The bytes travel beside
   * this document, under `files/`; this is the record of what should be there,
   * so a short download is detectable rather than invisible.
   */
  readonly files: StoredObject[]
  /** Storage folders that could not be listed. Same rule as `notIncluded`. */
  readonly filesNotListed: { bucket: string; prefix: string; reason: string }[]
}

const NO_READ_POLICY_REASON =
  'This table has no read policy for members, so the app cannot read it on your behalf. It is not empty. It simply cannot be included from here. Ask Sahoda for it directly.'

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
 * A row identified by something other than `workspace_id`.
 *
 * Separate from `readTable` on purpose: that function's `.eq('workspace_id', …)`
 * IS the tenant filter, and making the column a parameter of the main path would
 * turn the one line that scopes every read into something a caller can get
 * wrong.
 */
async function readByKey(
  supabase: SupabaseClient,
  table: string,
  describes: string,
  column: string,
  value: string,
): Promise<{ ok: true; value: ExportedTable } | { ok: false; value: OmittedTable }> {
  try {
    const { data, error } = await supabase.from(table).select('*').eq(column, value)
    if (error) {
      return {
        ok: false,
        value: {
          table,
          describes,
          reason: `Could not be read: ${error.message ?? 'the read failed'}`,
        },
      }
    }
    const rows = Array.isArray(data) ? data : []
    return { ok: true, value: { table, describes, rows, truncated: false } }
  } catch (thrown) {
    return {
      ok: false,
      value: {
        table,
        describes,
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
export interface ExportRequest {
  readonly workspaceId: string
  /**
   * The signed-in person, for the ONE row that is theirs rather than the
   * workspace's. `null` is allowed and is REPORTED — `users_profile` lands in
   * `notIncluded` saying the profile could not be identified, never silently
   * skipped.
   */
  readonly userId: string | null
  /** The caller's instant, so the file's timestamp is the caller's and this stays testable. */
  readonly now: Date
}

/**
 * An OBJECT and not three positional arguments.
 *
 * `(supabase, workspaceId, userId, now)` reads identically to
 * `(supabase, workspaceId, now, userId)` at every call site, and this repo has
 * shipped two defects in two days from exactly that shape — an optional
 * positional whose default was silently taken. Here the wrong order would put a
 * Date where an identity goes and quietly drop the customer's own email out of
 * their subject-access export.
 */
export async function buildWorkspaceExport(
  supabase: SupabaseClient,
  { workspaceId, userId, now }: ExportRequest,
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

  // The two tables no sweep over `workspace_id` can reach. Read by name, with
  // their own `where`, because their keys are not the one the sweep uses.
  const workspaceRow = await readByKey(
    supabase,
    'workspaces',
    'the name and settings of this workspace',
    'id',
    workspaceId,
  )
  if (workspaceRow.ok) included.push(workspaceRow.value)
  else notIncluded.push(workspaceRow.value)

  if (userId !== null) {
    const profile = await readByKey(
      supabase,
      'users_profile',
      'your name, email and sign-in preferences',
      'user_id',
      userId,
    )
    if (profile.ok) included.push(profile.value)
    else notIncluded.push(profile.value)
  } else {
    notIncluded.push({
      table: 'users_profile',
      describes: 'your name, email and sign-in preferences',
      reason:
        'This export was built without a signed-in person, so the profile row could not be identified.',
    })
  }

  // Permanent omissions, in the file, in the customer's words. An omission the
  // customer cannot see is a lie by silence — the whole reason this shape exists.
  for (const entry of OMITTED_BY_DESIGN) {
    notIncluded.push({ table: entry.table, describes: entry.describes, reason: entry.reason })
  }

  const storage = await walkWorkspaceStorage(supabase, workspaceId)

  return {
    format: 'sahoda.workspace-export.v2',
    workspaceId,
    generatedAt: now.toISOString(),
    included,
    notIncluded,
    files: storage.objects,
    filesNotListed: storage.truncated
      ? [
          ...storage.unreadable,
          {
            bucket: '(all)',
            prefix: workspaceId,
            reason:
              'The file listing hit its own size limit, so this list may be short. Ask Sahoda for the rest.',
          },
        ]
      : storage.unreadable,
  }
}
