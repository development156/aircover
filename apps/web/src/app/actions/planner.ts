'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { PostSchema } from '@sahoda/shared'

import { reportServerError } from '@/lib/observability/report'
import { APPROVABLE_FROM } from '@/lib/planner/transitions'
import type { ApproveState } from '@/lib/planner/state'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace, workspaceForWrite } from '@/lib/workspaces'

const CANNOT_APPROVE = "Can't approve this post from its current state. Reload to see where it is."

/**
 * The ONE sanctioned status write in apps/web: `idea|draft|review → approved`.
 * `savePost` refuses `status` entirely so the fabricated-publish states stay
 * unreachable; this action is the deliberate exception, and the allowlist rides
 * in the SQL (`.in`) so a concurrent transition — publishing picking the post
 * up, another tab approving first — makes the update match ZERO rows instead of
 * clobbering a pipeline state. Zero matches is a refusal, not a success
 * (PostgREST returns no error for an empty match — the deletePost lesson).
 */
export async function approvePost(postId: string): Promise<ApproveState> {
  // Hoisted so the catch can tag the tenant — see lib/observability/report.ts.
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to approve this post.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('posts')
      .update({ status: 'approved' })
      .eq('id', postId)
      .eq('workspace_id', workspace.id)
      .in('status', [...APPROVABLE_FROM])
      .select('*')
      .maybeSingle()

    if (error || !data) return { ok: false, message: CANNOT_APPROVE }

    const parsed = PostSchema.safeParse(data)
    if (!parsed.success) {
      return {
        ok: false,
        message: 'Approved, but the response was unreadable. Reload to confirm.',
      }
    }

    revalidatePath('/planner')
    revalidatePath('/posts')
    return { ok: true, status: parsed.data.status }
  } catch (error) {
    reportServerError(error, { action: 'approvePost', workspaceId })
    return { ok: false, message: 'Could not approve this post. Try again.' }
  }
}
