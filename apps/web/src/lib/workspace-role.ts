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

/**
 * Who may approve a post — the gate between a draft and something publishing can send.
 *
 * A VIEWER COULD APPROVE. Measured 2026-09-03: neither `approvePost` nor the bulk
 * `approvePosts` read a role, and the database does not close it either — `posts` gets
 * `app.apply_tenant_policies`, which grants full CRUD to any member with no role
 * predicate. So the one role named for this job meant nothing, and the role named for
 * reading could approve. The button was shown to them too.
 *
 * The trio matches the playbook policy in Postgres (`20260822030200_playbooks_policy_roles.sql`)
 * rather than `MAY_PUBLISH`'s pair: approving is not sending. An approver approves and
 * someone who may publish then sends, which is the separation the role set exists for.
 *
 * This is the application half. The durable fix is a role-aware RLS policy on `posts`,
 * which needs a migration and belongs to the db lane — until it lands, this is the only
 * wall, so it is checked before the update is issued rather than after.
 */
const MAY_APPROVE: ReadonlySet<WorkspaceRole> = new Set<WorkspaceRole>([
  'owner',
  'editor',
  'approver',
])

export function canApproveAsRole(role: WorkspaceRole | null): boolean {
  return role !== null && MAY_APPROVE.has(role)
}

/** Refused because the role is known and not allowed. */
export const APPROVE_ROLE_REFUSAL = 'Only an owner, editor or approver can approve a post.'

/**
 * Refused because the role could not be established, which is NOT the same claim.
 * "You may not" tells someone to ask for access; this tells them to try again.
 */
export const APPROVE_ROLE_UNKNOWN =
  'Sahoda could not confirm your role in this workspace, so nothing was approved. Try again in a moment.'
