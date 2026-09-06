'use server'

import { auth } from '@clerk/nextjs/server'
import { PostSchema } from '@sahoda/shared'

import { reportServerError } from '@/lib/observability/report'
import type { ApproveState } from '@/lib/planner/state'
import { revalidatePostSurfaces } from '@/lib/posts/revalidate-surfaces'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'
import {
  APPROVE_ROLE_REFUSAL,
  APPROVE_ROLE_UNKNOWN,
  canApproveAsRole,
  getWorkspaceRole,
} from '@/lib/workspace-role'

const SIGNED_OUT = 'Sign in to approve this post.'
const GENERIC = 'Could not approve this post. Try again.'
const CANNOT_APPROVE = "Can't approve this post from its current state. Reload to see where it is."

/**
 * The ONE sanctioned approve in apps/web: `idea|draft|review → approved`, or
 * `→ scheduled` when the post already carries a time.
 *
 * It goes through the `approve_posts` RPC rather than an `update`. `savePost`
 * refuses `status` entirely so the fabricated-publish states stay unreachable,
 * and since the lifecycle trigger landed a direct status write from this role
 * is refused by the database too. The allowlist rides inside the function, so
 * a concurrent transition — publishing picking the post up, another tab
 * approving first — makes the RPC return ZERO rows instead of clobbering a
 * pipeline state. Zero rows is a refusal here, not a success.
 */
export async function approvePost(postId: string): Promise<ApproveState> {
  // Hoisted so the catch can tag the tenant — see lib/observability/report.ts.
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: SIGNED_OUT }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    // The RPC checks the role itself. This read stays as defence in depth, and
    // because its refusal can name the roles BEFORE a round trip is spent.
    const role = await getWorkspaceRole(workspace.id)
    if (role === null) return { ok: false, message: APPROVE_ROLE_UNKNOWN }
    if (!canApproveAsRole(role)) return { ok: false, message: APPROVE_ROLE_REFUSAL }

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('approve_posts', { p_post_ids: [postId] })

    if (error) {
      const raised = error.message ?? ''
      if (raised.includes('FORBIDDEN_ROLE')) return { ok: false, message: APPROVE_ROLE_REFUSAL }
      if (raised.includes('NOT_SIGNED_IN')) return { ok: false, message: SIGNED_OUT }
      reportServerError(error, { action: 'approvePost', workspaceId })
      return { ok: false, message: GENERIC }
    }

    const row = Array.isArray(data) ? data[0] : undefined
    if (!row) return { ok: false, message: CANNOT_APPROVE }

    const parsed = PostSchema.safeParse(row)
    if (!parsed.success) {
      return {
        ok: false,
        message: 'Approved, but the response was unreadable. Reload to confirm.',
      }
    }

    revalidatePostSurfaces()
    return { ok: true, status: parsed.data.status }
  } catch (error) {
    reportServerError(error, { action: 'approvePost', workspaceId })
    return { ok: false, message: GENERIC }
  }
}
