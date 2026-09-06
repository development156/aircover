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

/**
 * What a write says when it changed nothing.
 *
 * A PostgREST update that matches no row is `{ error: null }` — a success with
 * an empty result set. Both writes below therefore used to answer `{ok: true}`
 * for a lead that had been deleted, that belongs to another workspace, or whose
 * id the board is holding from before a workspace switch. The card then redrew
 * itself in the stage it was never moved to and stayed there until a reload.
 *
 * The remedy is the one that works: a reload is what re-reads the board.
 */
const GONE = 'This lead is no longer here. Reload the board.'

/**
 * Mark a lead as looked at, and ONLY the first time.
 *
 * `read_at` is the moment somebody first saw this enquiry, which is the figure a
 * response time is measured from. Every stage move used to overwrite it with
 * `now()`, so a lead answered within a minute and dragged through the board a
 * week later recorded a week-old first look — and the one number that could have
 * said "nobody has opened this" could never be older than the last click.
 *
 * ── WHY THIS IS A SECOND STATEMENT AND NOT A SECOND COLUMN IN THE FIRST ──────
 * `read_at = coalesce(read_at, now())` cannot be expressed through PostgREST,
 * and putting `.is('read_at', null)` on the status update instead would make
 * every ALREADY-READ lead match zero rows — which the caller now correctly
 * treats as "this lead is gone". A healthy second move would report the board
 * as stale. So the filter lives on its own statement, and ITS zero rows are the
 * normal case: they mean the lead had already been read.
 */
async function markFirstLook(
  supabase: ReturnType<typeof createServerSupabase>,
  leadId: string,
  workspaceId: string,
): Promise<void> {
  await supabase
    .from('leads')
    .update({ read_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('workspace_id', workspaceId)
    .is('read_at', null)
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
    const { data, error } = await supabase
      .from('leads')
      .update({ status: parsed.data })
      .eq('id', leadId)
      .eq('workspace_id', workspaceId)
      // The ROW COUNT is the answer, not the absent error. See `GONE`.
      .select('id')

    if (error) return { ok: false, message: 'Could not move that lead. Try again.' }
    if (!Array.isArray(data) || data.length !== 1) return { ok: false, message: GONE }

    await markFirstLook(supabase, leadId, workspaceId)

    revalidatePath('/leads')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'setLeadStatus', workspaceId })
    return { ok: false, message: 'Could not move that lead. Try again.' }
  }
}

export interface PromoteState {
  ok: boolean
  leadId?: string
  /** True when this conversation was already a lead. Not an error. */
  existing?: boolean
  message?: string
}

export interface PromoteInput {
  /** Zernio's own id for the conversation. The dedupe key, per workspace. */
  conversationRef: string
  channel: string
  authorName: string | null
  authorHandle: string | null
  message: string | null
}

/**
 * DOOR TWO — an enquiry that arrived in the inbox becomes a lead.
 *
 * ── WHY THIS CALLS `lead_from_conversation` AND NOT `lead_from_inbox` ────────
 * Both exist and both are correct. `lead_from_inbox` derives every field from an
 * `inbox_threads` row, which is the better function — and NOTHING WRITES THAT
 * TABLE. It shipped deliberately empty on 2026-08-04 and the inbox a customer
 * opens reads Zernio live instead, so a button wired to it would be a button
 * with nothing to press it on.
 *
 * So this calls the sibling, which takes the details from the screen and records
 * that it did. The workspace id is the one thing that does NOT come from the
 * caller's screen unchecked: the function compares it against the caller's own
 * memberships, so the only tenants a member can name are ones they belong to.
 *
 * Idempotent in the database rather than here: two people pressing at once must
 * not produce two leads for one conversation, and a duplicated person in a
 * pipeline is worse than a missing one because both get chased.
 */
export async function promoteThreadToLead(input: PromoteInput): Promise<PromoteState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to save this as a lead.' }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    if (input.conversationRef.trim() === '') {
      return { ok: false, message: 'That conversation has no id, so it cannot be saved.' }
    }

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('lead_from_conversation', {
      p_workspace_id: workspaceId,
      p_conversation_ref: input.conversationRef,
      p_channel: input.channel,
      p_author_name: input.authorName,
      p_author_handle: input.authorHandle,
      p_message: input.message,
      p_permalink: null,
    })
    if (error) return { ok: false, message: 'Could not save that as a lead. Try again.' }

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
    return { ok: false, message: 'Could not save that as a lead. Try again.' }
  }
}

/** What a person may correct on a lead. */
export interface LeadContactEdit {
  name: string
  email: string
  phone: string
}

/**
 * Correct a lead's contact details.
 *
 * ── WHY THESE THREE AND NOT `message` OR `source` ────────────────────────────
 * These are the fields a person KNOWS BETTER than the row does: a name typed
 * into a form wrong, a number with a digit missing, an email a customer gave
 * over the phone. Correcting them is bookkeeping.
 *
 * `message` and `source` are RECORDS OF WHAT HAPPENED — what the person actually
 * wrote, and which door they came through. Editing either turns the lead from a
 * record into a note, and the inbox conversation it was promoted from would then
 * disagree with the lead beside it. Neither is editable here, deliberately.
 *
 * `status` has its own action above, because moving a lead is a pipeline event
 * and not a correction.
 *
 * ── EMPTY MEANS EMPTY, AND THAT IS A REAL EDIT ───────────────────────────────
 * A blank field writes NULL rather than being skipped. Clearing a wrong phone
 * number is a correction a person is entitled to make, and treating blank as
 * "no change" would make the one edit they cannot perform the one that removes
 * bad data. `''` and `null` are collapsed to null so the column never carries an
 * empty string that reads as a value in every `lead.phone ? …` check.
 */
export async function updateLeadContact(
  leadId: string,
  edit: LeadContactEdit,
): Promise<LeadActionState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to edit this lead.' }
    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const trim = (value: unknown): string | null => {
      if (typeof value !== 'string') return null
      const clean = value.trim()
      return clean === '' ? null : clean
    }

    // Bounded before it reaches the column. These are `text`, so a paste of a
    // whole document would otherwise be stored and then rendered back into every
    // card on the board.
    const cap = (value: string | null, max: number): string | null =>
      value === null ? null : value.slice(0, max)

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('leads')
      .update({
        name: cap(trim(edit.name), 200),
        email: cap(trim(edit.email), 320),
        phone: cap(trim(edit.phone), 40),
      })
      .eq('id', leadId)
      .eq('workspace_id', workspaceId)
      // Same reason as the move above: an update that matched nothing is not an
      // error, and reporting a correction as saved when it was not is worse than
      // refusing it. See `GONE`.
      .select('id')

    if (error) return { ok: false, message: 'Could not save those details. Try again.' }
    if (!Array.isArray(data) || data.length !== 1) return { ok: false, message: GONE }

    revalidatePath('/leads')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'updateLeadContact', workspaceId })
    return { ok: false, message: 'Could not save those details. Try again.' }
  }
}
