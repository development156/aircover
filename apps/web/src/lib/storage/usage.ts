import 'server-only'

import {
  storageState,
  storageWouldExceed,
  WORKSPACE_STORAGE_LIMIT_LABEL,
  formatStorageBytes,
  type StorageState,
} from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'

/**
 * How much of its 1 GB a workspace has used.
 *
 * ── FOUR ANSWERS, NOT TWO ────────────────────────────────────────────────────
 * "You have used nothing", "we could not read it", "the figure is not available
 * in this environment yet" and "there is no workspace" are four different claims,
 * and three of them are not zero. A meter showing an empty bar for a failed read
 * tells the customer their library is empty, which is a statement about THEIR
 * files that we would have no basis for. `lib/inbox/emptiness.ts` keeps eight such
 * sentences apart for the same reason; this keeps four.
 *
 * ── WHY `not_deployed` IS ITS OWN ANSWER ─────────────────────────────────────
 * `workspace_storage_bytes` ships as a migration and migrations are applied by a
 * person, so between this code landing and that push the function does not exist.
 * Postgres answers 42883 (undefined_function) and PostgREST forwards it as
 * PGRST202 or a 404. Treating that as a read failure would put a scary sentence on
 * a screen for a condition nobody can act on except us; treating it as zero would
 * be a lie. It is named, and the panel says the honest thing.
 */

export type StorageUsage =
  | { kind: 'ok'; state: StorageState }
  | { kind: 'no_workspace' }
  | { kind: 'not_deployed' }
  | { kind: 'read_failed' }

/** Postgres and PostgREST both have a way of saying "that function is not here". */
function isMissingFunction(code: string | undefined, message: string): boolean {
  if (code === '42883' || code === 'PGRST202') return true
  return /could not find the function|does not exist/i.test(message)
}

export async function readStorageUsage(workspaceId: string | null): Promise<StorageUsage> {
  if (!workspaceId) return { kind: 'no_workspace' }

  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('workspace_storage_bytes', {
      p_workspace_id: workspaceId,
    })

    if (error) {
      return isMissingFunction(error.code, error.message ?? '')
        ? { kind: 'not_deployed' }
        : { kind: 'read_failed' }
    }

    // The function returns bigint, which PostgREST serialises as a STRING once the
    // value passes 2^53. `Number(null)` is 0 and `Number('')` is 0, so both are
    // refused rather than rendered as an empty workspace.
    if (data === null || data === undefined || data === '') return { kind: 'read_failed' }
    const bytes = Number(data)
    if (!Number.isFinite(bytes)) return { kind: 'read_failed' }

    return { kind: 'ok', state: storageState(bytes) }
  } catch {
    return { kind: 'read_failed' }
  }
}

/**
 * The refusal an upload gets when the workspace has no room, or `null` when it fits.
 *
 * ── IT FAILS OPEN, DELIBERATELY, AND ONLY FOR A READ WE COULD NOT DO ─────────
 * If usage cannot be read the upload is ALLOWED. The alternative is refusing every
 * upload in the product the moment one query fails, or before the migration is
 * applied — turning a reporting fault into an outage. The cost is bounded: every
 * single file is already capped at 4 MB by the platform, so a workspace cannot run
 * away while the read is broken, and the next successful read shows the true figure.
 *
 * A workspace that is genuinely full is refused, every time, before one byte is
 * accepted.
 */
export function storageRefusal(usage: StorageUsage, incomingBytes: number): string | null {
  if (usage.kind !== 'ok') return null
  if (!storageWouldExceed(usage.state, incomingBytes)) return null

  const free = formatStorageBytes(usage.state.remainingBytes)
  const size = formatStorageBytes(incomingBytes)

  // Names the three numbers that decide it, then the one remedy that works. The
  // trash is named because trashed files still occupy the allowance, so "delete
  // something" without it sends a person to do a thing that changes nothing.
  return usage.state.remainingBytes === 0
    ? `This workspace has used all of its ${WORKSPACE_STORAGE_LIMIT_LABEL}, so nothing was uploaded. Delete some files for good to make room. Files in the trash still take up space until they are deleted for good.`
    : `That file is ${size} and this workspace has ${free} left of its ${WORKSPACE_STORAGE_LIMIT_LABEL}, so nothing was uploaded. Delete some files for good to make room. Files in the trash still take up space until they are deleted for good.`
}
