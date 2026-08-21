'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import {
  AutonomyLevelSchema,
  ChannelSchema,
  DEFAULT_WEEKLY_BUDGET_CREDITS,
  MAX_WEEKLY_BUDGET_CREDITS,
} from '@sahoda/shared'

import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * THE AUTONOMY DIAL'S WRITE PATH.
 *
 * `loop_channel_autonomy` and `loop_settings` carry FULL member CRUD policies,
 * unlike the cycle tables, so these go through the RLS-scoped Supabase client
 * and no owner connection is involved. That is deliberate: these rows are a
 * choice the customer typed, RLS is the right boundary for them, and routing
 * them through an owner connection would make a settings form one of the few
 * places in this app that bypasses the security model.
 *
 * ── L3 IS REFUSED THREE TIMES OVER ───────────────────────────────────────────
 * `AutonomyLevelSchema` accepts 0, 1 and 2 — a 3 fails here, before a request is
 * made. The column's check constraint refuses it if it somehow arrives. And the
 * screen renders L3 as text rather than as a control. Three refusals because
 * they fail in different places: this one gives a readable message, the
 * constraint catches anything that skips this function entirely, and the screen
 * stops anyone trying.
 */

export interface DialState {
  ok: boolean
  message?: string
}

export async function setChannelAutonomy(channel: unknown, level: unknown): Promise<DialState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to change this.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const parsedChannel = ChannelSchema.safeParse(channel)
    if (!parsedChannel.success) return { ok: false, message: 'Pick a channel Sahoda supports.' }

    const parsedLevel = AutonomyLevelSchema.safeParse(level)
    if (!parsedLevel.success) {
      // The specific copy matters: someone who tried to select autopilot should
      // be told it is not built, not that their input was malformed.
      return {
        ok: false,
        message:
          level === 3
            ? 'Autopilot is not built yet. Sahoda will not publish without asking.'
            : 'Pick a level between suggest and approve-to-publish.',
      }
    }

    const supabase = createServerSupabase()
    const { error } = await supabase.from('loop_channel_autonomy').upsert(
      {
        workspace_id: workspaceId,
        channel: parsedChannel.data,
        level: parsedLevel.data,
        created_by: userId,
      },
      { onConflict: 'workspace_id,channel' },
    )
    if (error) return { ok: false, message: 'Could not save that — try again.' }

    revalidatePath('/loop')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'setChannelAutonomy', workspaceId })
    return { ok: false, message: 'Could not save that — try again.' }
  }
}

export async function setLoopSettings(input: {
  paused?: unknown
  weeklyBudgetCredits?: unknown
}): Promise<DialState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to change this.' }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const patch: Record<string, unknown> = { workspace_id: workspaceId }
    if (input.paused !== undefined) {
      if (typeof input.paused !== 'boolean') return { ok: false, message: 'Could not read that.' }
      patch.paused = input.paused
    }
    if (input.weeklyBudgetCredits !== undefined) {
      const n = Number(input.weeklyBudgetCredits)
      // Bounded HERE as well as in the column, so someone dragging the slider
      // past the end reads a sentence instead of a constraint violation.
      if (!Number.isInteger(n) || n < 0 || n > MAX_WEEKLY_BUDGET_CREDITS) {
        return {
          ok: false,
          message: `Pick a weekly budget between 0 and ${MAX_WEEKLY_BUDGET_CREDITS} credits.`,
        }
      }
      patch.weekly_budget_credits = n
    }

    const supabase = createServerSupabase()
    const { error } = await supabase
      .from('loop_settings')
      .upsert(patch, { onConflict: 'workspace_id' })
    if (error) return { ok: false, message: 'Could not save that — try again.' }

    revalidatePath('/loop')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'setLoopSettings', workspaceId })
    return { ok: false, message: 'Could not save that — try again.' }
  }
}

/** The default a workspace that has never opened this screen is running at. */
export async function defaultLoopSettings(): Promise<{
  paused: boolean
  weeklyBudgetCredits: number
}> {
  return { paused: false, weeklyBudgetCredits: DEFAULT_WEEKLY_BUDGET_CREDITS }
}
