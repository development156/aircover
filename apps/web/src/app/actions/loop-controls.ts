'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { createPgLedgerPort, loadBillingEnv } from '@sahoda/billing'

import { revalidateBalance } from '@/lib/actions/revalidate-balance'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * THE THREE CONTROLS A PERSON HAS OVER A RUNNING CYCLE.
 *
 * Each is a thin wrapper over one SECURITY DEFINER function. The membership
 * check, the role check and the state machine all live in the database, so this
 * layer translates a Postgres exception into a sentence and does no deciding of
 * its own — which is what keeps the two from drifting apart.
 */

/** Turn a raised Postgres error into copy. Unknown causes get the generic line. */
function messageFor(raw: string, fallback: string): string {
  const known: Record<string, string> = {
    AUTH_REQUIRED: 'Sign in first.',
    NOT_A_MEMBER: "You don't have access to that workspace.",
    FORBIDDEN_ROLE: 'Your role cannot approve spending.',
    INVALID_CYCLE: 'That cycle no longer exists.',
    WRONG_STATUS: 'That cycle is not waiting for approval.',
    NOTHING_INCLUDED: 'Keep at least one post, or cancel the week instead.',
    ESTIMATE_CHANGED: 'The plan changed while you were looking. Check the new total.',
    ALREADY_RESOLVED: 'Someone already answered that one.',
    INVALID_DIFF: 'That suggestion is malformed and cannot be applied.',
    NO_ACTIVE_BRAIN: 'Finish your Brand Brain before accepting a learning.',
  }
  for (const [code, copy] of Object.entries(known)) if (raw.includes(code)) return copy
  return fallback
}

export interface ApproveState {
  ok: boolean
  approvedCredits?: number
  includedBriefs?: number
  excludedBriefs?: number
  message?: string
}

/**
 * APPROVE THE COST PREVIEW — the gate between a plan and a bill.
 *
 * `expectedCredits` is the total the SCREEN SHOWED. The function recomputes from
 * the rows and refuses if the two disagree, so approving is agreeing to a number
 * that was true at the moment of the click rather than one that was on screen a
 * minute ago. That is what makes the preview a contract instead of a picture.
 */
export async function approveCycleCost(
  cycleId: string,
  excludedBriefIds: readonly string[],
  expectedCredits: number,
): Promise<ApproveState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in first.' }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('loop_approve_cost', {
      p_cycle_id: cycleId,
      p_excluded_briefs: [...excludedBriefIds],
      p_expected_credits: expectedCredits,
    })
    if (error) {
      return {
        ok: false,
        message: messageFor(error.message, 'Could not approve that. Try again.'),
      }
    }

    revalidatePath('/loop')
    const out = data as {
      approved_credits: number
      included_briefs: number
      excluded_briefs: number
    }
    return {
      ok: true,
      approvedCredits: out.approved_credits,
      includedBriefs: out.included_briefs,
      excludedBriefs: out.excluded_briefs,
    }
  } catch (error) {
    reportServerError(error, { action: 'approveCycleCost', workspaceId })
    return { ok: false, message: 'Could not approve that. Try again.' }
  }
}

export interface KillState {
  ok: boolean
  cyclesCancelled?: number
  postsUnscheduled?: number
  variantsUnscheduled?: number
  briefsSkipped?: number
  /** How many reserved credits were handed back, and how many could not be. */
  holdsReleased?: number
  holdsFound?: number
  paused?: boolean
  message?: string
}

/**
 * THE KILL SWITCH — cancel everything the Loop has scheduled, at once.
 *
 * ── TWO STEPS, ON PURPOSE, IN THIS ORDER ─────────────────────────────────────
 * The RPC cancels the rows and RETURNS any outstanding Loop holds; this function
 * then releases each one through the credit ledger. They are separate because a
 * content cancellation and a ledger write in one transaction means a fault in
 * either rolls back both — and of the two, the cancellation is the one that must
 * survive. A hold that outlives this call is swept by the expired-hold job; a
 * post left on the calendar is not swept by anything.
 *
 * ── AN HONEST NOTE ABOUT THE HOLDS ───────────────────────────────────────────
 * In normal operation the list comes back EMPTY, and that is not a bug in either
 * half. `withCredits` takes its hold and settles it inside one invocation, so a
 * Loop hold only exists during the milliseconds a create stage is mid-flight.
 * The release path is here for exactly that instant — which is, of course, when
 * someone presses this button — and the counts are reported separately so
 * "nothing to release" and "released three" are distinguishable in the result.
 */
export async function killLoop(alsoPause = true): Promise<KillState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in first.' }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('loop_kill_switch', {
      p_workspace_id: workspaceId,
      p_also_pause: alsoPause,
    })
    if (error) {
      return {
        ok: false,
        message: messageFor(error.message, 'Could not stop the Loop. Try again.'),
      }
    }

    const out = data as {
      cycles_cancelled: number
      briefs_skipped: number
      posts_unscheduled: number
      variants_unscheduled: number
      paused: boolean
      outstanding_holds: Array<{ entry_id: string; amount: number }>
    }

    // Release each hold through `app.apply_ledger_entry`, which is the only
    // write path to the ledger. A RELEASE keyed on the hold it settles is
    // idempotent, so a second press cannot refund twice.
    //
    // ── THE STOP HAS ALREADY HAPPENED BY THIS LINE ────────────────────────────
    // The RPC committed: cycles cancelled, posts unscheduled, Loop paused. What
    // follows is a refund, and a refund that cannot run must not be reported as
    // a stop that did not. On the wt-core preview, with no SUPABASE_DB_URL in
    // the environment, `loadBillingEnv()` threw here on a workspace with ZERO
    // holds, and the person read "Could not stop the Loop. Try again." over a
    // Loop that a reload showed stopped (MEASURED 2026-09-06). So the pool is
    // opened only when there is a hold to release, every failure in here is
    // reported and counted rather than thrown, and the pool is closed after:
    // the previous version leaked one per press.
    const released = await releaseHolds(workspaceId, out.outstanding_holds)

    revalidateBalance()
    revalidatePath('/loop')
    revalidatePath('/planner')
    revalidatePath('/posts')
    return {
      ok: true,
      cyclesCancelled: out.cycles_cancelled,
      postsUnscheduled: out.posts_unscheduled,
      variantsUnscheduled: out.variants_unscheduled,
      briefsSkipped: out.briefs_skipped,
      holdsFound: out.outstanding_holds.length,
      holdsReleased: released,
      paused: out.paused,
    }
  } catch (error) {
    reportServerError(error, { action: 'killLoop', workspaceId })
    return { ok: false, message: 'Could not stop the Loop. Try again.' }
  }
}

export interface LearningState {
  ok: boolean
  status?: 'accepted' | 'rejected'
  brandMemoryVersion?: number | null
  brandMemoryChanged?: boolean
  message?: string
}

/**
 * ACCEPT OR REJECT A PROPOSED LEARNING.
 *
 * The decision is a string this function passes through unexamined except for
 * the two values the RPC allows — deliberately, because inferring "apply" from
 * anything other than an explicit `'accepted'` is how a rejection becomes a
 * write. `brandMemoryChanged` comes back from the database rather than being
 * assumed here, so a screen can state what actually happened.
 */
export async function resolveLearning(
  eventId: string,
  decision: 'accepted' | 'rejected',
): Promise<LearningState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in first.' }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('resolve_memory_event', {
      p_event_id: eventId,
      p_decision: decision,
    })
    if (error) {
      return { ok: false, message: messageFor(error.message, 'Could not save that. Try again.') }
    }

    const out = data as {
      status: 'accepted' | 'rejected'
      brand_memory_version: number | null
      brand_memory_changed: boolean
    }
    revalidatePath('/loop')
    revalidatePath('/brain')
    revalidatePath('/report')
    return {
      ok: true,
      status: out.status,
      brandMemoryVersion: out.brand_memory_version,
      brandMemoryChanged: out.brand_memory_changed,
    }
  } catch (error) {
    reportServerError(error, { action: 'resolveLearning', workspaceId })
    return { ok: false, message: 'Could not save that. Try again.' }
  }
}

/**
 * Refund every hold the kill switch found. Never throws: the count of what was
 * released is the answer, and the expired-hold sweep is the backstop for the
 * rest. The ledger pool is opened only when there is something to release.
 */
async function releaseHolds(
  workspaceId: string,
  holds: ReadonlyArray<{ entry_id: string; amount: number }>,
): Promise<number> {
  if (holds.length === 0) return 0
  let ledger: ReturnType<typeof createPgLedgerPort> | null = null
  let released = 0
  try {
    const { databaseUrl } = loadBillingEnv()
    ledger = createPgLedgerPort({ connectionString: databaseUrl })
    for (const hold of holds) {
      try {
        await ledger.apply({
          workspaceId,
          entryType: 'RELEASE',
          amount: hold.amount,
          idempotencyKey: `loop-kill:release:${hold.entry_id}`,
          settlesEntryId: hold.entry_id,
        })
        released += 1
      } catch (cause) {
        reportServerError(cause, { action: 'killLoop.release', workspaceId })
      }
    }
  } catch (cause) {
    reportServerError(cause, { action: 'killLoop.releasePort', workspaceId })
  } finally {
    await ledger?.close().catch(() => undefined)
  }
  return released
}
