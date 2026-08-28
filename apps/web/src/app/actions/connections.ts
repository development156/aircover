'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'

import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace, workspaceForWrite } from '@/lib/workspaces'
import { zernioClient } from '@/lib/zernio/server'

export type DisconnectState = { ok: true } | { ok: false; message: string }

const NO_ACCESS = "Couldn't disconnect this account. Reload and try again."

/**
 * Disconnect = remove the account AT ZERNIO, then delete our row.
 *
 * ── WHY BOTH, AND IN THAT ORDER ──────────────────────────────────────────────
 * This used to be the delete alone. The consequence was reported as a bug — "you
 * disconnect and connect again and the other platforms get connected
 * automatically" — because Zernio still held the account, so the next reconcile
 * found it and wrote it straight back. Underneath the annoyance was a privacy
 * fact: a customer who disconnected still had Sahoda's access sitting on their
 * Instagram at the provider, and nothing in the product could take it away.
 *
 * `DELETE /v1/accounts/{accountId}` does exactly that, and this repository spent
 * weeks believing it did not exist — see the comment on `disconnectAccount` in
 * packages/publishing/src/zernio/client.ts for how that was settled.
 *
 * ── THE ORDER IS THE WHOLE DESIGN ────────────────────────────────────────────
 *   read our row   →  we need the Zernio account id, and reading it from OUR
 *                     table scoped by workspace_id IS the tenant boundary.
 *                     doc 13 §3: Zernio validates an accountId against the whole
 *                     TEAM, so a mis-scoped id disconnects somebody else's
 *                     account and returns 200.
 *   remove upstream→  first, because if this fails after we deleted our row we
 *                     have lost the only id that could ever remove it. The
 *                     account would stay live at the provider with nothing in
 *                     our database pointing at it — an orphan we cannot name.
 *   delete our row →  last. If THIS fails the account is already gone upstream
 *                     and the stale row is recoverable: the next reconcile finds
 *                     nothing and a retry deletes it. That is the survivable
 *                     direction of the two.
 *
 * ── A FAILED UPSTREAM REMOVAL DOES NOT DELETE THE ROW ────────────────────────
 * It would be kinder in the moment to drop our row anyway and let the customer
 * get on with their day. It is also exactly the old bug: the row comes back on
 * the next connect, and the customer's access is still granted at the platform.
 * So the action refuses and says why. Retrying is a real remedy, which is the
 * bar `no-impossible-remedy` sets.
 *
 * `.select('id').maybeSingle()` because a PostgREST delete matching zero rows
 * returns no error — zero rows is a refusal, not a success (deletePost lesson).
 */
export async function disconnectConnection(connectionId: string): Promise<DisconnectState> {
  // Hoisted so the catch can tag the tenant — see lib/observability/report.ts.
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to disconnect this account.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    const supabase = createServerSupabase()

    // SCOPED BY workspace_id, and that filter is the tenant boundary rather than a
    // convenience. The id this returns is about to be handed to a DELETE that
    // Zernio will not scope for us.
    const { data: row, error: readError } = await supabase
      .from('connections')
      .select('id, external_account')
      .eq('id', connectionId)
      .eq('workspace_id', workspace.id)
      .maybeSingle()

    if (readError) return { ok: false, message: NO_ACCESS }
    if (!row) return { ok: false, message: NO_ACCESS }

    const accountId = (row.external_account as { id?: unknown } | null)?.id
    const client = zernioClient()

    if (typeof accountId === 'string' && client) {
      try {
        await client.disconnectAccount(accountId)
      } catch (error) {
        await reportServerError(error, { action: 'disconnectConnection.zernio', workspaceId })
        return {
          ok: false,
          message:
            'Sahoda could not remove this account at the publishing provider, so nothing was changed. Try again.',
        }
      }
    }
    // NO `else` THAT SILENTLY PROCEEDS ON A MISSING CLIENT — see below. A row
    // whose stored account id is malformed, or an environment with no publishing
    // key, cannot reach Zernio at all. Deleting our row there is the honest
    // action: there is no upstream link we are leaving behind that we could have
    // removed, and refusing would strand the customer with a row they can never
    // delete. The reconcile cannot resurrect it either, because a create now
    // needs a press on record.

    const { data, error } = await supabase
      .from('connections')
      .delete()
      .eq('id', connectionId)
      .eq('workspace_id', workspace.id)
      .select('id')
      .maybeSingle()

    if (error || !data) return { ok: false, message: NO_ACCESS }

    revalidatePath('/connections')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'disconnectConnection', workspaceId })
    return { ok: false, message: 'Could not disconnect. Try again.' }
  }
}
