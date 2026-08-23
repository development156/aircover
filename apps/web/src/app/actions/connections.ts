'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'

import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace, workspaceForWrite } from '@/lib/workspaces'

export type DisconnectState = { ok: true } | { ok: false; message: string }

const NO_ACCESS = "Couldn't disconnect this account. Reload and try again."

/**
 * Disconnect = DELETE the connection row; `connection_secrets` cascades, so
 * the sealed tokens go with it (the vault has zero member policies — this
 * cascade is the ONLY way apps/web can make tokens disappear, and that is by
 * design). Members hold a real `conn_delete` policy, so this is an honest
 * control today even while CONNECTING is still blocked (no INSERT policy —
 * see lib/guide/anchors.ts on `connections.connect_x`).
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
