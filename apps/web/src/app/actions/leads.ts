'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import { LeadStatusSchema } from '@sahoda/shared'

import { isBoardStatus } from '@/lib/leads/stages'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * MOVING A LEAD, AND OPENING THE SECOND DOOR.
 *
 * ── THE STATUS WRITE GOES STRAIGHT THROUGH RLS ───────────────────────────────
 * `leads` has a member UPDATE policy, so this is a plain PostgREST update under
 * the caller's own JWT. The workspace filter beside it is a correctness filter,
 * not the boundary: the policy already refuses another tenant's row, and
 * `rls.test.ts` proves that from an anon client with a real member token.
 *
 * ── THE INBOX DOOR IS AN RPC, AND HAS TO BE ──────────────────────────────────
 * `leads` has no INSERT policy for anyone, deliberately: an open one would let a
 * member fabricate an enquiry that never happened. So promoting a conversation
 * goes through `public.lead_from_inbox`, which is `SECURITY DEFINER` and checks
 * membership INSIDE — because definer rights have already bypassed the policy
 * that would have checked it.
 */

export interface LeadActionState {
  ok: boolean
  message?: string
}

/** Move a lead along the pipeline. */
export async function setLeadStatus(leadId: string, status: unknown): Promise<LeadActionState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to update this lead.' }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const parsed = LeadStatusSchema.safeParse(status)
    // A status the column allows but the board does not show is refused here.
    // Writing `qualified` would put a lead in a stage with nowhere to appear.
    if (!parsed.success || !isBoardStatus(parsed.data)) {
      return { ok: false, message: 'That is not a stage a lead can be in.' }
    }

    const supabase = createServerSupabase()
    const { error } = await supabase
      .from('leads')
      .update({ status: parsed.data, read_at: new Date().toISOString() })
      .eq('id', leadId)
      .eq('workspace_id', workspaceId)

    if (error) return { ok: false, message: 'Could not move that lead — try again.' }
    revalidatePath('/leads')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'setLeadStatus', workspaceId })
    return { ok: false, message: 'Could not move that lead — try again.' }
  }
}

export interface PromoteState {
  ok: boolean
  leadId?: string
  /** True when this conversation was already a lead. Not an error. */
  existing?: boolean
  message?: string
}

/**
 * DOOR TWO — an enquiry that arrived in the inbox becomes a lead.
 *
 * Idempotent in the database rather than here: two people pressing at once must
 * not produce two leads for one conversation, and a duplicated person in a
 * pipeline is worse than a missing one because both get chased.
 */
export async function promoteThreadToLead(threadId: string): Promise<PromoteState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to save this as a lead.' }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('lead_from_inbox', { p_thread_id: threadId })
    if (error) return { ok: false, message: 'Could not save that as a lead — try again.' }

    const row = (data ?? {}) as { ok?: boolean; id?: string; existing?: boolean; reason?: string }
    if (row.ok !== true || !row.id) {
      // The function's refusals do not distinguish "no such thread" from "not
      // your thread" to the caller, and neither does this: telling somebody a
      // thread exists but is not theirs is a fact about another workspace.
      return { ok: false, message: 'That conversation is not here any more.' }
    }

    revalidatePath('/leads')
    revalidatePath('/inbox')
    return { ok: true, leadId: row.id, existing: Boolean(row.existing) }
  } catch (error) {
    reportServerError(error, { action: 'promoteThreadToLead', workspaceId })
    return { ok: false, message: 'Could not save that as a lead — try again.' }
  }
}
