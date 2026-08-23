'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'

import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace, workspaceForWrite } from '@/lib/workspaces'

/**
 * Arm, move and cancel a scheduled post.
 *
 * ── WHY THESE ARE RPCs AND NOT A `savePost` PATCH ────────────────────────────
 * `savePost` deliberately refuses `posts.status`: the shared schema admits it, and
 * accepting it would let a hand-rolled call set `status: 'published'` — a
 * fabricated success reachable by going around the editor. That guard is right and
 * stays.
 *
 * But scheduling IS a status change. It is the moment a post leaves 'draft' and
 * becomes something the dispatcher may pick up, and until now nothing in apps/web
 * could make that transition at all — every post ever written has sat outside
 * DISPATCHABLE_STATUSES forever. So the transition goes through three Postgres
 * functions that each enforce exactly one intent, with the role check and the
 * "has anything already gone out?" predicate inside the statement.
 *
 * The state a caller cannot reach through any of them is the one that matters:
 * none of them can mark a post published.
 */

export type ScheduleState =
  { ok: true; scheduledAt: string | null } | { ok: false; message: string }

/** Map a Postgres raise into copy a person can act on. */
function messageFor(raw: string | undefined): string {
  const msg = raw ?? ''
  if (msg.includes('FORBIDDEN_ROLE')) return 'Only an owner or editor can schedule a post.'
  if (msg.includes('POST_ALREADY_GOING_OUT')) {
    return 'This post is already going out — you can’t change its time now.'
  }
  if (msg.includes('POST_NOT_RESCHEDULABLE') || msg.includes('POST_NOT_RELEASABLE')) {
    return 'This post has already been published or closed.'
  }
  if (msg.includes('INVALID_POST')) return "You don't have access to this post."
  return 'Could not change the schedule. Try again.'
}

/**
 * Put a post on the calendar for `iso`, or move it if it is already there.
 *
 * `release_post_for_publish` fixes `scheduled_at` with `coalesce` so an in-flight
 * publisher's idempotency key cannot shift underneath it — which means it will not
 * MOVE an existing schedule. `reschedule_post` is the one that overwrites, and it
 * refuses once anything is publishing. Choosing between them by whether a schedule
 * already exists keeps both guarantees intact.
 */
export async function schedulePost(
  postId: string,
  iso: string,
  hasExistingSchedule: boolean,
): Promise<ScheduleState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to schedule this post.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    const when = new Date(iso)
    if (Number.isNaN(when.getTime())) {
      return { ok: false, message: 'Pick a real date and time.' }
    }

    const supabase = createServerSupabase()
    const { data, error } = hasExistingSchedule
      ? await supabase.rpc('reschedule_post', { p_post_id: postId, p_when: when.toISOString() })
      : await supabase.rpc('release_post_for_publish', {
          p_post_id: postId,
          p_when: when.toISOString(),
        })

    if (error) return { ok: false, message: messageFor(error.message) }

    const scheduledAt = (data as { scheduled_at?: unknown } | null)?.scheduled_at
    revalidatePath('/posts')
    revalidatePath('/planner')
    revalidatePath(`/posts/${postId}`)
    return { ok: true, scheduledAt: typeof scheduledAt === 'string' ? scheduledAt : null }
  } catch (error) {
    reportServerError(error, { action: 'schedulePost', workspaceId })
    return { ok: false, message: 'Could not change the schedule. Try again.' }
  }
}

/** Take a post back off the calendar. Refuses once anything has gone out. */
export async function cancelSchedule(postId: string): Promise<ScheduleState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to change this post.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    const workspace = ws.workspace
    workspaceId = workspace.id

    const supabase = createServerSupabase()
    const { error } = await supabase.rpc('cancel_scheduled_post', { p_post_id: postId })
    if (error) return { ok: false, message: messageFor(error.message) }

    revalidatePath('/posts')
    revalidatePath('/planner')
    revalidatePath(`/posts/${postId}`)
    return { ok: true, scheduledAt: null }
  } catch (error) {
    reportServerError(error, { action: 'cancelSchedule', workspaceId })
    return { ok: false, message: 'Could not change the schedule. Try again.' }
  }
}
