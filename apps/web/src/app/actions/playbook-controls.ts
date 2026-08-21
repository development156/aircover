'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'

import { revalidateBalance } from '@/lib/actions/revalidate-balance'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * THE TWO CONTROLS A PERSON HAS OVER A PLAYBOOK: approve a cost, stop everything.
 *
 * Each is a thin wrapper over one SECURITY DEFINER function. The membership
 * check, the role check and the state machine all live in the database, so this
 * layer turns a Postgres exception into a sentence and does no deciding of its
 * own — which is what keeps the two from drifting apart.
 */

/** Turn a raised Postgres error into copy. Unknown causes get the generic line. */
function messageFor(raw: string, fallback: string): string {
  const known: Record<string, string> = {
    AUTH_REQUIRED: 'Sign in first.',
    NOT_A_MEMBER: "You don't have access to that workspace.",
    FORBIDDEN_ROLE: 'Your role cannot approve spending.',
    INVALID_RUN: 'That run no longer exists.',
    INVALID_WORKSPACE: 'That workspace no longer exists.',
    WRONG_STATUS: 'That run is not waiting for approval.',
    NOTHING_INCLUDED: 'Keep at least one draft, or stop the run instead.',
    ESTIMATE_CHANGED: 'The list changed while you were looking — check the new total.',
  }
  for (const [code, copy] of Object.entries(known)) if (raw.includes(code)) return copy
  return fallback
}

export interface ApproveRunState {
  ok: boolean
  approvedCredits?: number
  includedItems?: number
  excludedItems?: number
  message?: string
}

/**
 * APPROVE THE COST PREVIEW — the gate between a proposal and a bill.
 *
 * `expectedCredits` is the OUTPUT total the screen showed, recomputed by the
 * function from the rows. The per-run charge is deliberately NOT part of that
 * comparison: it is a fixed price out of pricing.config.json that no trim can
 * change, so including it would make the contract about a number the customer
 * cannot influence. What they are agreeing to is the sum of the lines.
 */
export async function approveRunCost(
  runId: string,
  excludedItemIds: readonly string[],
  expectedCredits: number,
): Promise<ApproveRunState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in first.' }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('playbook_approve_cost', {
      p_run_id: runId,
      p_excluded_items: [...excludedItemIds],
      p_expected_credits: expectedCredits,
    })
    if (error) {
      return {
        ok: false,
        message: messageFor(error.message, 'Could not approve that — try again.'),
      }
    }

    const result = data as {
      approved_credits: number
      included_items: number
      excluded_items: number
    }
    revalidatePath('/playbooks')
    return {
      ok: true,
      approvedCredits: result.approved_credits,
      includedItems: result.included_items,
      excludedItems: result.excluded_items,
    }
  } catch (error) {
    reportServerError(error, { action: 'approveRunCost', workspaceId })
    return { ok: false, message: 'Could not approve that — try again.' }
  }
}

export interface KillSwitchState {
  ok: boolean
  runsCancelled?: number
  postsUnscheduled?: number
  playbooksDisabled?: number
  /** Holds the switch found and did NOT release. Reported, never hidden. */
  outstandingHolds?: number
  message?: string
}

/**
 * STOP EVERYTHING.
 *
 * The function cancels live runs, takes every post a playbook scheduled back off
 * the calendar, and switches the playbooks off. It does NOT move money: it
 * REPORTS outstanding holds rather than releasing them, because a ledger write in
 * the same transaction would mean a fault in either half rolls back both, and of
 * the two the cancellation is the one that must survive.
 */
export async function killPlaybooks(alsoDisable = true): Promise<KillSwitchState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in first.' }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('playbook_kill_switch', {
      p_workspace_id: workspaceId,
      p_also_disable: alsoDisable,
    })
    if (error) {
      return { ok: false, message: messageFor(error.message, 'Could not stop them — try again.') }
    }

    const result = data as {
      runs_cancelled: number
      posts_unscheduled: number
      playbooks_disabled: number
      outstanding_holds: unknown[]
    }
    revalidatePath('/playbooks')
    revalidatePath('/planner')
    revalidatePath('/posts')
    await revalidateBalance()
    return {
      ok: true,
      runsCancelled: result.runs_cancelled,
      postsUnscheduled: result.posts_unscheduled,
      playbooksDisabled: result.playbooks_disabled,
      outstandingHolds: result.outstanding_holds.length,
    }
  } catch (error) {
    reportServerError(error, { action: 'killPlaybooks', workspaceId })
    return { ok: false, message: 'Could not stop them — try again.' }
  }
}
