'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { OpsWriteState } from '@/lib/ops/action-state'
import { requireOpsAdmin } from '@/lib/ops/guard'
import { reportServerError } from '@/lib/observability/report'
import { resetConfirmationMatches } from '@/lib/ops/reset-scope'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Reset one workspace's CONTENT (doc 13 · owner tool).
 *
 * OWNER-ONLY, and decided by the DATABASE, not here: `ops_workspace_reset` opens
 * with `app.ops_owner()`, which raises 42501 for anyone who is not an active ops
 * owner. This action deliberately does not re-check the role — the same rule
 * `ops-team.ts` follows, so the gate cannot drift from the one that is enforced.
 *
 * WHY AN RPC AND NOT DELETES FROM HERE. Three reasons, each on its own decisive:
 *
 *  1. ONE TRANSACTION. Thirteen sequential `.delete()` calls have none. A failure
 *     on the fifth leaves a half-reset workspace with no resume path and no
 *     record of where it stopped — worse than not starting.
 *  2. `brand_memory` and `memory_events` carry `app.apply_tenant_read_policy`,
 *     which grants SELECT only. No client can delete them at all, and they are
 *     the headline item of a Brand Brain reset.
 *  3. IDENTITY. `/admin` authorises against `ops_admins`; RLS deletes are scoped
 *     by `app.member_workspace_ids()`. Those are different identities — an ops
 *     owner need not be a member of the workspace being reset — so a client-side
 *     delete would silently affect nothing, or the wrong tenant.
 */

const InputSchema = z.object({
  // `z.guid()`, not `z.uuid()`. zod 4's uuid() enforces the version and variant
  // nibbles, so it refuses a well-formed id that Postgres would happily accept —
  // a false refusal on the operator's side of a `uuid` column. Shape is what
  // matters here; the column is the authority on validity.
  workspaceId: z.guid(),
  workspaceName: z.string().min(1),
  typed: z.string().min(1),
})

function refusal(error: { code?: string | null; message?: string | null }): string {
  const message = error.message ?? ''
  // PostgREST cannot find the function: the migration has not landed yet. Say
  // that, rather than "something went wrong" — the remedy is somebody else's.
  if (error.code === 'PGRST202' || message.includes('ops_workspace_reset')) {
    return 'Reset is not available yet. The ops_workspace_reset function has not been applied to this database.'
  }
  if (error.code === '42501' || message.includes('not permitted')) {
    return 'Only an ops owner can reset a workspace.'
  }
  if (message.includes('OPS_RESET_UNKNOWN_WORKSPACE')) {
    return 'No workspace with that id.'
  }
  return 'That reset was not applied.'
}

export async function resetWorkspace(
  workspaceId: string,
  workspaceName: string,
  typed: string,
): Promise<OpsWriteState> {
  try {
    await requireOpsAdmin()

    const parsed = InputSchema.safeParse({ workspaceId, workspaceName, typed })
    if (!parsed.success) return { ok: false, message: 'Check the workspace and try again.' }

    // The typed phrase is re-checked HERE as well as in the browser. A disabled
    // button is a courtesy to someone who is paying attention; it is not a
    // control, because this action is a callable endpoint whatever the UI does.
    if (!resetConfirmationMatches(parsed.data.typed, parsed.data.workspaceName)) {
      return { ok: false, message: 'The name did not match, so nothing was reset.' }
    }

    const supabase = createServerSupabase()
    const { error } = await supabase.rpc('ops_workspace_reset', {
      p_workspace_id: parsed.data.workspaceId,
    })
    if (error) return { ok: false, message: refusal(error) }

    // The credit chip and the Brand Brain ring both live in the app LAYOUT, so a
    // page-scoped revalidate leaves them reading a workspace that no longer has
    // a brain. This trap has been hit twice in this codebase already.
    revalidatePath('/', 'layout')
    revalidatePath('/admin/dev')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'resetWorkspace', workspaceId })
    return { ok: false, message: 'That reset was not applied.' }
  }
}
