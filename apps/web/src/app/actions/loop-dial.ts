'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import {
  AutonomyLevelSchema,
  ChannelSchema,
  DEFAULT_WEEKLY_BUDGET_CREDITS,
  MAX_AUTOPILOT_CANCEL_MINUTES,
  MAX_AUTOPILOT_DAILY_CAP,
  MAX_WEEKLY_BUDGET_CREDITS,
  MIN_AUTOPILOT_CANCEL_MINUTES,
  MIN_AUTOPILOT_DAILY_CAP,
} from '@sahoda/shared'

import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { autopilotRefusalMessage } from '@/lib/loop/autopilot-refusal-copy'
import { workspaceForWrite } from '@/lib/workspaces'
import { credits } from '@/lib/credit-words'

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
 * ── L3 IS ACCEPTED HERE AND ADJUDICATED BY THE DATABASE ──────────────────────
 * `AutonomyLevelSchema` now admits 3, and the trigger in
 * `20260828120000_loop_autopilot_l3.sql` is what decides whether this workspace
 * may have it. That split is deliberate: the preconditions are facts about rows
 * (a supervised cycle that reached 'reported', a Brand Brain with four fields
 * confirmed) and re-deriving them in TypeScript would be a second opinion that
 * can disagree with the one that actually governs the write.
 *
 * ── SO THE THREE REFUSALS MUST BECOME SENTENCES SOMEBODY WROTE ───────────────
 * The trigger raises AUTOPILOT_NEEDS_SUPERVISED_CYCLE, AUTOPILOT_NEEDS_BRAIN
 * and AUTOPILOT_BRAIN_UNCONFIRMED. `AutonomyLevelSchema`'s own header warns
 * that letting a value reach the database and surface as a raw constraint
 * violation is the defect to avoid, and opening the union is exactly what would
 * have caused it. `autopilotRefusalMessage` below is the other half of that
 * change: every named refusal gets a sentence that says what is missing and
 * what to do, and an unrecognised one falls back to a sentence that does not
 * pretend to know which.
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
      return { ok: false, message: 'Pick a level between suggest and autopilot.' }
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
    if (error) {
      // A named refusal is an answer, not a fault. It must reach the person
      // ahead of the generic sentence, which would otherwise tell somebody to
      // "try again" at a write the database will refuse every time.
      const named = autopilotRefusalMessage(`${error.message} ${error.details ?? ''}`)
      if (named) return { ok: false, message: named }
      return { ok: false, message: 'Could not save that. Try again.' }
    }

    revalidatePath('/loop')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'setChannelAutonomy', workspaceId })
    return { ok: false, message: 'Could not save that. Try again.' }
  }
}

export async function setLoopSettings(input: {
  paused?: unknown
  weeklyBudgetCredits?: unknown
  autopilotDailyCap?: unknown
  autopilotCancelMinutes?: unknown
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
          message: `Pick a weekly budget between 0 and ${credits(MAX_WEEKLY_BUDGET_CREDITS)}.`,
        }
      }
      patch.weekly_budget_credits = n
    }

    // ── THE TWO AUTOPILOT PROMISES ──────────────────────────────────────────
    // Bounded here as well as in their columns, for the same reason as the
    // budget above: a value past the end must read as a sentence rather than as
    // a constraint violation. The bounds come from @sahoda/shared, so the form,
    // this check and the column cannot drift apart.
    //
    // A cap of 0 is a real choice, not an empty field — it means autopilot may
    // announce nothing today — so `Number()` and an integer check are used
    // rather than any truthiness test.
    if (input.autopilotDailyCap !== undefined) {
      const n = Number(input.autopilotDailyCap)
      if (!Number.isInteger(n) || n < MIN_AUTOPILOT_DAILY_CAP || n > MAX_AUTOPILOT_DAILY_CAP) {
        return {
          ok: false,
          message: `Pick how many posts a day, between ${MIN_AUTOPILOT_DAILY_CAP} and ${MAX_AUTOPILOT_DAILY_CAP}.`,
        }
      }
      patch.autopilot_daily_cap = n
    }
    if (input.autopilotCancelMinutes !== undefined) {
      const n = Number(input.autopilotCancelMinutes)
      if (
        !Number.isInteger(n) ||
        n < MIN_AUTOPILOT_CANCEL_MINUTES ||
        n > MAX_AUTOPILOT_CANCEL_MINUTES
      ) {
        return {
          ok: false,
          message: `Pick how long you get to stop a post, between ${MIN_AUTOPILOT_CANCEL_MINUTES} minutes and ${MAX_AUTOPILOT_CANCEL_MINUTES / 60} hours.`,
        }
      }
      patch.autopilot_cancel_minutes = n
    }

    const supabase = createServerSupabase()
    const { error } = await supabase
      .from('loop_settings')
      .upsert(patch, { onConflict: 'workspace_id' })
    if (error) return { ok: false, message: 'Could not save that. Try again.' }

    revalidatePath('/loop')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'setLoopSettings', workspaceId })
    return { ok: false, message: 'Could not save that. Try again.' }
  }
}

/** The default a workspace that has never opened this screen is running at. */
export async function defaultLoopSettings(): Promise<{
  paused: boolean
  weeklyBudgetCredits: number
}> {
  return { paused: false, weeklyBudgetCredits: DEFAULT_WEEKLY_BUDGET_CREDITS }
}
