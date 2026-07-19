'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'

import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'

export type DisconnectState = { ok: true } | { ok: false; message: string }

const NO_ACCESS = "Couldn't disconnect this account — reload and try again."

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
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to disconnect this account.' }

    const workspace = await getActiveWorkspace()
    if (!workspace) return { ok: false, message: 'Create a workspace first.' }

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
  } catch {
    return { ok: false, message: 'Could not disconnect — try again.' }
  }
}
