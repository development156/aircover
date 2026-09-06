'use server'

import { auth } from '@clerk/nextjs/server'

import { reportServerError } from '@/lib/observability/report'
import { revalidatePostSurfaces } from '@/lib/posts/revalidate-surfaces'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'
import { reviewRefusalFor } from '@/lib/posts/post-error'
import { APPROVE_ROLE_REFUSAL } from '@/lib/workspace-role'

/**
 * The return half of the approval workflow. Founder's ruling, 2026-09-06:
 * approval is a recorded gate, so a post can be SENT for review and SENT BACK,
 * and both leave a row in `post_approvals`. Each call is one SECURITY DEFINER
 * RPC (`send_post_for_review`, `return_post_to_draft`); the role check, the
 * status allowlist and the history row live in the database, not here.
 *
 * Refusals the RPCs raise, by message token:
 *   NOT_SIGNED_IN · FORBIDDEN_ROLE · POST_NOT_SUBMITTABLE ·
 *   POST_NOT_RETURNABLE · POST_ALREADY_GOING_OUT · REASON_REQUIRED
 */
export type ReviewActionState =
  { ok: true; status: 'review' | 'draft' } | { ok: false; message: string }

const SIGNED_OUT = 'Sign in again to do that.'
const GENERIC = 'Sahoda could not save that just now. Try again in a moment.'

/**
 * The review-gate sentences live in `lib/posts/post-error.ts` (`REVIEW_REFUSALS`),
 * one table for this file, the queue and the composer. Only the two refusals
 * that are not about the post itself are added here.
 */
function refusalFor(raised: string): string | null {
  if (raised.includes('FORBIDDEN_ROLE')) return APPROVE_ROLE_REFUSAL
  if (raised.includes('NOT_SIGNED_IN')) return SIGNED_OUT
  return reviewRefusalFor(raised)
}

/** Draft or idea → review. Records a `submitted` row. */
export async function sendForReview(postId: string): Promise<ReviewActionState> {
  return runReviewRpc('send_post_for_review', { p_post_id: postId }, 'review', 'sendForReview')
}

/**
 * Review, approved or scheduled → draft, keeping the time so the plan survives
 * the round trip. Records a `returned` row carrying the reason.
 */
export async function returnToDraft(postId: string, reason: string): Promise<ReviewActionState> {
  const trimmed = reason.trim()
  if (trimmed.length === 0) return { ok: false, message: refusalFor('REASON_REQUIRED') ?? GENERIC }
  return runReviewRpc(
    'return_post_to_draft',
    { p_post_id: postId, p_reason: trimmed.slice(0, 500) },
    'draft',
    'returnToDraft',
  )
}

async function runReviewRpc(
  fn: 'send_post_for_review' | 'return_post_to_draft',
  args: Record<string, string>,
  landed: 'review' | 'draft',
  action: string,
): Promise<ReviewActionState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: SIGNED_OUT }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const supabase = createServerSupabase()
    const { error } = await supabase.rpc(fn, args)
    if (error) {
      const known = refusalFor(error.message ?? '')
      if (known) return { ok: false, message: known }
      reportServerError(error, { action, workspaceId })
      return { ok: false, message: GENERIC }
    }
    revalidatePostSurfaces(args.p_post_id)
    return { ok: true, status: landed }
  } catch (error) {
    reportServerError(error, { action, workspaceId })
    return { ok: false, message: GENERIC }
  }
}
