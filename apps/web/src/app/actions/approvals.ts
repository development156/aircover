'use server'

import { auth } from '@clerk/nextjs/server'

import { reportServerError } from '@/lib/observability/report'
import type { BulkApproveState } from '@/lib/approvals/state'
import { revalidatePostSurfaces } from '@/lib/posts/revalidate-surfaces'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'
import {
  APPROVE_ROLE_REFUSAL,
  APPROVE_ROLE_UNKNOWN,
  canApproveAsRole,
  getWorkspaceRole,
} from '@/lib/workspace-role'

/**
 * How many posts one bulk approve may touch.
 *
 * The queue is capped at `LIST_LIMIT` (100) upstream, so this can never bite in
 * normal use. It is here because the ids arrive from a client component and a
 * server action must not accept an unbounded list from one — the cap belongs on
 * the server side of the boundary, not in the checkbox that produced it.
 */
const MAX_BULK = 100

const SIGNED_OUT = 'Sign in to approve these posts.'
const GENERIC = 'Could not approve these posts. Try again.'

/**
 * Approve several posts at once.
 *
 * ── ONE RPC, NOT A LOOP, AND THAT IS THE WHOLE DESIGN ────────────────────────
 * The obvious implementation is `for (const id of ids) await approvePost(id)`.
 * It is wrong three ways: N round trips, N chances to half-finish, and — worst —
 * it forces the caller to collapse N results into one boolean, which is how
 * "Approved" ends up printed over a post that never moved.
 *
 * `approve_posts` does the whole set in one statement, inside the database,
 * and RETURNS THE ROWS IT CHANGED. The allowlist (idea / draft / review), the
 * workspace fence and the role check all live in the function, and a BEFORE
 * trigger refuses a direct `status` write from this role anyway, so the SQL
 * this file used to carry could no longer run. The counts come from evidence
 * rather than from optimism: `approved` and `scheduled` are counted from the
 * status each returned row carries, `moved` is the difference, and none is
 * inferred from the absence of an error.
 *
 * ── WHY A DATED POST COMES BACK `scheduled` ──────────────────────────────────
 * Approving is the decision; the date was already made. A post with a
 * `scheduled_at` that gets approved is a post that goes out at that time, so
 * the RPC books it in the same statement. The two are counted apart because
 * they are two different promises to the reader.
 *
 * ── WHY `moved` IS NOT A FAILURE ─────────────────────────────────────────────
 * Zero returned rows is not an error. A selected id that is not in the result
 * was not refused by the database; it simply was not in an approvable state
 * when the statement ran — already approved, already scheduled, already
 * claimed by the publisher. The screen was stale. Telling somebody that "1
 * could not be saved" would send them to retry a thing that needs a reload,
 * so the two are counted apart and said apart.
 */
export async function approvePosts(postIds: readonly string[]): Promise<BulkApproveState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: SIGNED_OUT }

    // Deduped before it is counted. The same id twice would make `moved` report
    // a phantom stale row — the post approves once and the second copy has
    // nothing left to match, which is arithmetic, not a state change.
    const ids = [...new Set(postIds)].slice(0, MAX_BULK)
    if (ids.length === 0) return { ok: true, approved: 0, scheduled: 0, moved: 0, failed: 0 }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    // The RPC checks the role itself. This read stays as defence in depth, and
    // because its refusal can name the roles BEFORE a round trip is spent.
    const role = await getWorkspaceRole(ws.workspace.id)
    if (role === null) return { ok: false, message: APPROVE_ROLE_UNKNOWN }
    if (!canApproveAsRole(role)) return { ok: false, message: APPROVE_ROLE_REFUSAL }

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('approve_posts', { p_post_ids: ids })

    if (error) {
      const raised = error.message ?? ''
      if (raised.includes('FORBIDDEN_ROLE')) return { ok: false, message: APPROVE_ROLE_REFUSAL }
      if (raised.includes('NOT_SIGNED_IN')) return { ok: false, message: SIGNED_OUT }
      reportServerError(error, { action: 'approvePosts', workspaceId })
      // Every selected row is unaccounted for, so every one is reported as
      // unsaved. Reporting 0 of each would say "nothing was selected".
      return { ok: true, approved: 0, scheduled: 0, moved: 0, failed: ids.length }
    }

    const rows = Array.isArray(data) ? (data as Array<{ status?: unknown }>) : []
    const approved = rows.filter((row) => row.status === 'approved').length
    const scheduled = rows.filter((row) => row.status === 'scheduled').length

    revalidatePostSurfaces()

    return { ok: true, approved, scheduled, moved: ids.length - rows.length, failed: 0 }
  } catch (error) {
    reportServerError(error, { action: 'approvePosts', workspaceId })
    return { ok: false, message: GENERIC }
  }
}
