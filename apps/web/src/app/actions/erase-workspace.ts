'use server'

import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'

import { reportServerError } from '@/lib/observability/report'
import { eraseConfirmationMatches } from '@/lib/privacy/confirm'
import { sweepWorkspaceStorage } from '@/lib/privacy/storage'
import { createServerSupabase } from '@/lib/supabase/server'
import { getWorkspaceRole } from '@/lib/workspace-role'
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
 * ## Why the ROLE is checked here too, and before the sweep
 *
 * The RPC refuses anyone but the owner (`ERASURE_NOT_OWNER`), and that is still
 * the control. But the RPC runs SECOND, and the sweep before it runs on the RLS
 * client, whose storage delete policy admits every member of the workspace. So
 * an editor who reached this action had every file removed, was refused by the
 * RPC, and was then told nothing had been deleted. The role is read before the
 * first irreversible step so the refusal lands while that sentence is true.
 *
 * And when something IS removed before a refusal (the RPC throws, or ownership
 * changes between the role read and the RPC), the sentence counts the files
 * rather than claiming nothing happened. `filesRemoved` is threaded through the
 * refusals for that reason alone.
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

/**
 * The clause that closes a refusal. "Nothing was deleted." is the whole promise
 * of these sentences, so it is only ever said when the sweep removed nothing.
 */
function nothingDeleted(filesRemoved: number): string {
  if (filesRemoved === 0) return 'Nothing was deleted.'
  const files = filesRemoved === 1 ? 'One file was' : `${filesRemoved} files were`
  return `${files} already removed from storage before this refusal. The rest of your workspace is untouched.`
}

function refusal(
  error: { code?: string | null; message?: string | null },
  filesRemoved: number,
): string {
  const message = error.message ?? ''
  const nothing = nothingDeleted(filesRemoved)
  // PostgREST cannot find the function: the migration has not been applied. Say
  // that, rather than "something went wrong" — the remedy is somebody else's,
  // and a customer told to try again would try forever.
  if (error.code === 'PGRST202' || message.includes('erase_workspace')) {
    return `Deleting a workspace is not switched on for this database yet. ${nothing} Write to support@sahodalabs.com and we will do it by hand.`
  }
  if (message.includes('ERASURE_NOT_OWNER')) {
    return `Only the owner of this workspace can delete it. ${nothing}`
  }
  if (message.includes('ERASURE_NOT_SIGNED_IN')) {
    return `Sign in again and try once more. ${nothing}`
  }
  if (message.includes('ERASURE_NAME_MISMATCH')) {
    return filesRemoved === 0
      ? 'The name did not match, so nothing was deleted.'
      : `The name did not match. ${nothing}`
  }
  if (message.includes('ERASURE_UNKNOWN_WORKSPACE')) {
    return 'That workspace no longer exists.'
  }
  if (message.includes('ERASURE_INCOMPLETE')) {
    // The RPC rolled back, so the database half is genuinely "nothing happened"
    // and not a half-deletion. Saying so is the difference between a customer
    // who waits and a customer who assumes the worst. The storage half is
    // counted honestly: the sweep ran first and is not part of that rollback.
    const database =
      filesRemoved === 0
        ? 'Something refused to be deleted, so the whole deletion was undone and your workspace is exactly as it was.'
        : `Something refused to be deleted, so the database deletion was undone. ${nothing}`
    return `${database} Write to support@sahodalabs.com. This one needs a person.`
  }
  return filesRemoved === 0
    ? 'That deletion was not applied, and nothing was deleted.'
    : `That deletion was not applied. ${nothing}`
}

export async function eraseWorkspaceData(typed: string): Promise<EraseState> {
  let workspaceId: string | undefined
  /** How many files the sweep has removed so far. Zero until it runs. */
  let filesRemoved = 0
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

    // 0 · Who is asking. BEFORE the sweep, because the sweep is the irreversible
    // step and the storage policy would let any member run it. `null` is "could
    // not tell", which is a different fact from "not the owner" and gets its own
    // sentence rather than borrowing one that names a role we never read.
    const role = await getWorkspaceRole(workspace.id)
    if (role === null) {
      return {
        ok: false,
        message:
          'Sahoda could not confirm you own this workspace, so nothing was deleted. Try again in a moment.',
      }
    }
    if (role !== 'owner') {
      return {
        ok: false,
        message: 'Only the owner of this workspace can delete it. Nothing was deleted.',
      }
    }

    const supabase = createServerSupabase()

    // 1 · The files. See the header for why this is first.
    const sweep = await sweepWorkspaceStorage(supabase, workspace.id)
    filesRemoved = sweep.removed
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
    if (error) return { ok: false, message: refusal(error, filesRemoved) }

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
    return {
      ok: false,
      message:
        filesRemoved === 0
          ? 'That deletion was not applied, and nothing was deleted.'
          : `That deletion was not applied. ${nothingDeleted(filesRemoved)}`,
    }
  }
}
