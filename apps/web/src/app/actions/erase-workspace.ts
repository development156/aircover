'use server'

import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'

import { reportServerError } from '@/lib/observability/report'
import { eraseConfirmationMatches } from '@/lib/privacy/confirm'
import { sweepWorkspaceStorage } from '@/lib/privacy/storage'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'

/**
 * Delete everything (DPDP §12 — the right to erasure).
 *
 * ## Storage FIRST, then the database, and the order is the whole design
 *
 * They cannot be one transaction: Postgres does not hold the files. So one of
 * the two goes first, and the two residues are not equivalent.
 *
 *  · Database first, storage second. If the sweep then fails, the rows that
 *    pointed at those files are already gone. The pictures sit in the bucket
 *    with nothing referencing them — personal data nobody will ever look at
 *    again and nobody knows is there. The customer has been told it is finished.
 *  · Storage first, database second. If the delete then fails, the files are
 *    gone and the rows remain. The customer sees an error and a workspace with
 *    broken pictures, and pressing the button again reaches a COMPLETE state,
 *    because the sweep is idempotent and the erasure is one transaction.
 *
 * The second residue is recoverable and visible. The first is neither. So the
 * sweep runs first and a file it could not remove STOPS the whole thing — the
 * database is not touched at all. `packages/db/.../20260823000000_dpdp_erasure.sql`
 * carries the same note from the other side.
 *
 * ## Why the confirmation is checked twice
 *
 * The typed name is re-checked in `public.erase_workspace`, which is the one
 * that counts: this action is a callable endpoint whatever the screen does, and
 * so is the RPC. The check here exists to give a person a sentence instead of a
 * database error code, not to be the control.
 *
 * ## What it does NOT do
 *
 * It does not delete the Clerk account. Signing out of Sahoda and closing a
 * sign-in account are different requests, and this one is about the workspace.
 * `users_profile` — the copy of the email and display name that lives in this
 * database — IS removed by the RPC, for anybody left with no workspace at all.
 */

const InputSchema = z.object({
  // `z.guid()`, not `z.uuid()`. zod 4's `uuid()` enforces the version and
  // variant nibbles and refuses a well-formed id Postgres would accept.
  workspaceId: z.guid(),
  typed: z.string().min(1),
})

export type EraseState =
  | { ok: true; rowsRemoved: number; filesRemoved: number; retained: string[] }
  | { ok: false; message: string }

function refusal(error: { code?: string | null; message?: string | null }): string {
  const message = error.message ?? ''
  // PostgREST cannot find the function: the migration has not been applied. Say
  // that, rather than "something went wrong" — the remedy is somebody else's,
  // and a customer told to try again would try forever.
  if (error.code === 'PGRST202' || message.includes('erase_workspace')) {
    return 'Deleting a workspace is not switched on for this database yet. Nothing was deleted. Write to support@sahodalabs.com and we will do it by hand.'
  }
  if (message.includes('ERASURE_NOT_OWNER')) {
    return 'Only the owner of this workspace can delete it. Nothing was deleted.'
  }
  if (message.includes('ERASURE_NOT_SIGNED_IN')) {
    return 'Sign in again and try once more. Nothing was deleted.'
  }
  if (message.includes('ERASURE_NAME_MISMATCH')) {
    return 'The name did not match, so nothing was deleted.'
  }
  if (message.includes('ERASURE_UNKNOWN_WORKSPACE')) {
    return 'That workspace no longer exists.'
  }
  if (message.includes('ERASURE_INCOMPLETE')) {
    // The RPC rolled back, so this is genuinely "nothing happened" and not a
    // half-deletion. Saying so is the difference between a customer who waits
    // and a customer who assumes the worst.
    return 'Something refused to be deleted, so the whole deletion was undone and your workspace is exactly as it was. Write to support@sahodalabs.com — this one needs a person.'
  }
  return 'That deletion was not applied, and nothing was deleted.'
}

export async function eraseWorkspaceData(typed: string): Promise<EraseState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to delete your workspace.' }

    const workspace = await getActiveWorkspace()
    if (workspace === null) return { ok: false, message: 'There is no workspace to delete.' }
    workspaceId = workspace.id

    const parsed = InputSchema.safeParse({ workspaceId: workspace.id, typed })
    if (!parsed.success) {
      return { ok: false, message: 'Type the workspace name to confirm, then try again.' }
    }
    if (!eraseConfirmationMatches(parsed.data.typed, workspace.name)) {
      return { ok: false, message: 'The name did not match, so nothing was deleted.' }
    }

    const supabase = createServerSupabase()

    // 1 · The files. See the header for why this is first.
    const sweep = await sweepWorkspaceStorage(supabase, workspace.id)
    if (sweep.failed.length > 0 || sweep.leftUnread.length > 0) {
      // NOT rounded up into a success. A customer told their data is gone, whose
      // photographs are still in a bucket, has been lied to — so the database is
      // left alone and they are told to try again, which is a real remedy
      // because the sweep is idempotent.
      const count = sweep.failed.length + sweep.leftUnread.length
      return {
        ok: false,
        message: `${count === 1 ? 'One of your files' : `${count} of your files`} could not be deleted, so nothing else was deleted either. Try again in a moment. If it keeps happening, write to support@sahodalabs.com.`,
      }
    }

    // 2 · Everything else, in one transaction.
    const { data, error } = await supabase.rpc('erase_workspace', {
      p_workspace_id: parsed.data.workspaceId,
      p_typed_name: parsed.data.typed,
    })
    if (error) return { ok: false, message: refusal(error) }

    const result = (data ?? {}) as {
      rowsRemoved?: unknown
      retained?: unknown
    }

    // NOT revalidated and NOT redirected from here. The workspace this session
    // was pointed at no longer exists in any readable form, so a revalidate
    // would re-render a layout against nothing. The screen sends the person
    // somewhere real once it has this answer.
    return {
      ok: true,
      rowsRemoved: typeof result.rowsRemoved === 'number' ? result.rowsRemoved : 0,
      filesRemoved: sweep.removed,
      retained: Array.isArray(result.retained) ? result.retained.map(String) : [],
    }
  } catch (error) {
    await reportServerError(error, { action: 'eraseWorkspaceData', workspaceId })
    return { ok: false, message: 'That deletion was not applied, and nothing was deleted.' }
  }
}
