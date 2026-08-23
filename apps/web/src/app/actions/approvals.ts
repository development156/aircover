'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'

import { reportServerError } from '@/lib/observability/report'
import { APPROVABLE_FROM } from '@/lib/planner/transitions'
import type { BulkApproveState } from '@/lib/approvals/state'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * How many posts one bulk approve may touch.
 *
 * The queue is capped at `LIST_LIMIT` (100) upstream, so this can never bite in
 * normal use. It is here because the ids arrive from a client component and a
 * server action must not accept an unbounded list from one — the cap belongs on
 * the server side of the boundary, not in the checkbox that produced it.
 */
const MAX_BULK = 100

/**
 * Approve several posts at once.
 *
 * ── ONE STATEMENT, NOT A LOOP, AND THAT IS THE WHOLE DESIGN ──────────────────
 * The obvious implementation is `for (const id of ids) await approvePost(id)`.
 * It is wrong three ways: N round trips, N chances to half-finish, and — worst —
 * it forces the caller to collapse N results into one boolean, which is how
 * "Approved" ends up printed over a post that never moved.
 *
 * A single `update … in ('id', …)` filtered by the SAME allowlist the single
 * action uses does the whole set atomically and RETURNS THE ROWS IT CHANGED. The
 * three counts then come from evidence rather than from optimism: `approved` is
 * `data.length`, `moved` is the difference, and neither is inferred from the
 * absence of an error.
 *
 * ── WHY `moved` IS NOT A FAILURE ─────────────────────────────────────────────
 * PostgREST returns NO error for an update that matches zero rows (the
 * `deletePost` lesson). A selected id that is not in `data` was not refused by
 * the database; it simply was not in an approvable state when the statement ran
 * — already approved, already scheduled, already claimed by the publisher. The
 * screen was stale. Telling somebody that "1 could not be saved" would send them
 * to retry a thing that needs a reload, so the two are counted apart and said
 * apart.
 *
 * The allowlist stays in the SQL, exactly as `approvePost` puts it there, so a
 * concurrent transition loses the row rather than clobbering a pipeline state.
 */
export async function approvePosts(postIds: readonly string[]): Promise<BulkApproveState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to approve these posts.' }

    // Deduped before it is counted. The same id twice would make `moved` report
    // a phantom stale row — the post approves once and the second copy has
    // nothing left to match, which is arithmetic, not a state change.
    const ids = [...new Set(postIds)].slice(0, MAX_BULK)
    if (ids.length === 0) return { ok: true, approved: 0, moved: 0, failed: 0 }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('posts')
      .update({ status: 'approved' })
      .in('id', ids)
      .eq('workspace_id', ws.workspace.id)
      .in('status', [...APPROVABLE_FROM])
      .select('id')

    if (error) {
      reportServerError(error, { action: 'approvePosts', workspaceId })
      // Every selected row is unaccounted for, so every one is reported as
      // unsaved. Reporting 0 of each would say "nothing was selected".
      return { ok: true, approved: 0, moved: 0, failed: ids.length }
    }

    const approved = data?.length ?? 0

    revalidatePath('/approvals')
    revalidatePath('/planner')
    revalidatePath('/posts')
    revalidatePath('/home')

    return { ok: true, approved, moved: ids.length - approved, failed: 0 }
  } catch (error) {
    reportServerError(error, { action: 'approvePosts', workspaceId })
    return { ok: false, message: 'Could not approve these posts. Try again.' }
  }
}
