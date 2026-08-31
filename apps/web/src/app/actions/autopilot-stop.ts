'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'

import { cancelAnnouncement } from '@/lib/loop/autopilot/store'
import { reportServerError } from '@/lib/observability/report'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * STOP ONE POST AUTOPILOT IS ABOUT TO SEND.
 *
 * ── WHY THIS ACTION EXISTS BEFORE ANYTHING ARMS A POST ───────────────────────
 * Autopilot's dispatcher is built and nothing calls it, so there is nothing to
 * stop today. Building the stop first is deliberate: the ability to undo has to
 * exist before the ability to act, or the first customer to want it will not
 * have it. Every other order gets this backwards.
 *
 * ── THE ANSWER DISTINGUISHES THREE OUTCOMES, NOT TWO ─────────────────────────
 * `stopped` is a claim that the post did not go out. `already` is a claim that
 * it did, or that somebody else stopped it first. Collapsing them into one
 * "done" would show "stopped" over a post sitting on a customer's Instagram,
 * which is the exact class of false claim this product spends its precision on.
 *
 * The store's boolean carries that distinction because the cancel is one
 * statement that re-checks for a terminal row inside the insert — a dispatch
 * that lands first wins the race and returns false.
 */

export interface StopState {
  ok: boolean
  /** What actually happened, for copy that must not overclaim. */
  outcome?: 'stopped' | 'already'
  message?: string
}

export async function stopAutopilotPost(postId: unknown, variantId: unknown): Promise<StopState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to stop this.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    if (typeof postId !== 'string' || typeof variantId !== 'string') {
      return { ok: false, message: 'Sahoda could not tell which post to stop.' }
    }

    const stopped = await cancelAnnouncement(workspaceId, postId, variantId)

    revalidatePath('/loop')

    return stopped
      ? { ok: true, outcome: 'stopped', message: 'Stopped. Nothing went out.' }
      : {
          ok: true,
          outcome: 'already',
          // Two different things, and this sentence must not pick one. The post
          // either went out or somebody stopped it first, and from here those
          // are indistinguishable — claiming either would be guessing.
          message: 'This one is already settled. It either went out or was stopped already.',
        }
  } catch (error) {
    reportServerError(error, { action: 'stopAutopilotPost', workspaceId })
    return { ok: false, message: 'Sahoda could not reach your posts just now.' }
  }
}
