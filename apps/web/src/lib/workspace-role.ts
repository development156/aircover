import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { WorkspaceRoleSchema, type WorkspaceRole } from '@sahoda/shared'

import { createServerSupabase } from '@/lib/supabase/server'

/**
 * The signed-in user's role in one workspace, or null when it cannot be established.
 *
 * Null on ANY doubt — no row, an unreadable row, a role string the schema does not
 * recognise. Callers gate on an explicit allow-list of roles, so null denies rather
 * than defaulting to something permissive.
 *
 * The read is RLS-scoped (`wm_select`), so it can only ever return a membership the
 * caller is entitled to see. The role is nonetheless parsed through the shared schema
 * rather than compared as a raw string: `workspace_members.role` is a text column with
 * a CHECK, and a future value added to the database ahead of the code would otherwise
 * fall through a `!== 'viewer'` style test as if it were privileged.
 */
export async function getWorkspaceRole(workspaceId: string): Promise<WorkspaceRole | null> {
  try {
    const { userId } = await auth()
    if (!userId) return null

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error || !data) return null
    const parsed = WorkspaceRoleSchema.safeParse((data as { role?: unknown }).role)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Who may put content on a real, public account.
 *
 * Approvers approve and viewers read; neither sends. This mirrors the role set
 * `ensure_zernio_profile` enforces in Postgres for connecting an account — the same
 * two roles that can attach an Instagram account are the two that can post to it.
 */
const MAY_PUBLISH: ReadonlySet<WorkspaceRole> = new Set<WorkspaceRole>(['owner', 'editor'])

export function canPublish(role: WorkspaceRole | null): boolean {
  return role !== null && MAY_PUBLISH.has(role)
}
