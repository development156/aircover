'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createInvitation, revokeInvitation } from '@/lib/ops/clerk-invitations'
import { requireOpsAdmin } from '@/lib/ops/guard'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import type { OpsWriteState } from '@/lib/ops/action-state'

/**
 * A2 · The applications inbox (doc 13 §4).
 *
 * Approving is TWO external effects — an invitation at Clerk and a status in
 * our database — and they cannot be made atomic. The order is chosen so the
 * failure that can happen is the harmless one:
 *
 *   invitation first, then the row.
 *
 * If the row write fails after the invitation went out, the applicant has an
 * invitation and our inbox still says "new"; an admin clicks Approve again,
 * Clerk resends (ignore_existing), and the row catches up. The reverse order
 * would mark someone invited who never received anything, and nothing would
 * ever notice.
 */

const IdSchema = z.uuid()

function refusal(error: { code?: string | null }): string {
  return error.code === '42501'
    ? 'Your account cannot change applications.'
    : 'That change was not applied.'
}

async function setStatus(
  id: string,
  status: string,
  note?: string | null,
  invitationId?: string | null,
): Promise<OpsWriteState> {
  const supabase = createServerSupabase()
  const { error } = await supabase.rpc('ops_application_set_status', {
    p_id: id,
    p_status: status,
    p_note: note ?? null,
    p_clerk_invitation_id: invitationId ?? null,
  })
  if (error) return { ok: false, message: refusal(error) }

  revalidatePath('/admin/applications')
  return { ok: true }
}

export async function approveApplication(id: string, email: string): Promise<OpsWriteState> {
  try {
    await requireOpsAdmin()
    if (!IdSchema.safeParse(id).success) {
      return { ok: false, message: 'That application could not be found.' }
    }

    const invited = await createInvitation(email)
    if (!invited.ok) {
      // Nothing is marked invited, because nothing was. An "already invited"
      // is still not something to record as this admin's doing.
      return { ok: false, message: invited.message }
    }

    return setStatus(id, 'invited', null, invited.invitationId)
  } catch (error) {
    reportServerError(error, { action: 'approveApplication' })
    return { ok: false, message: 'That change was not applied.' }
  }
}

export async function rejectApplication(id: string, note: string): Promise<OpsWriteState> {
  try {
    await requireOpsAdmin()
    if (!IdSchema.safeParse(id).success) {
      return { ok: false, message: 'That application could not be found.' }
    }
    return setStatus(id, 'rejected', note.trim() || null)
  } catch (error) {
    reportServerError(error, { action: 'rejectApplication' })
    return { ok: false, message: 'That change was not applied.' }
  }
}

export async function revokeApplicationInvite(
  id: string,
  invitationId: string | null,
): Promise<OpsWriteState> {
  try {
    await requireOpsAdmin()
    if (!IdSchema.safeParse(id).success) {
      return { ok: false, message: 'That application could not be found.' }
    }

    // Revoke at Clerk FIRST. Moving the row back to `contacted` while a live
    // invitation is still out there is the state that lies.
    if (invitationId) {
      const revoked = await revokeInvitation(invitationId)
      if (!revoked) {
        return {
          ok: false,
          message: 'Clerk would not revoke that invitation, so nothing was changed here either.',
        }
      }
    }

    return setStatus(id, 'contacted')
  } catch (error) {
    reportServerError(error, { action: 'revokeApplicationInvite' })
    return { ok: false, message: 'That change was not applied.' }
  }
}

export async function noteOnApplication(id: string, note: string): Promise<OpsWriteState> {
  try {
    const me = await requireOpsAdmin()
    if (!IdSchema.safeParse(id).success) {
      return { ok: false, message: 'That application could not be found.' }
    }
    if (note.trim().length === 0) return { ok: false, message: 'Write something first.' }

    const supabase = createServerSupabase()
    // Status unchanged: a note is a note. `ops_application_set_status` needs one,
    // so the current value is re-sent rather than inventing a transition.
    const { data: current, error: readError } = await supabase
      .from('ops_beta_applications')
      .select('status')
      .eq('id', id)
      .maybeSingle()
    if (readError || !current) return { ok: false, message: 'That application could not be found.' }

    return setStatus(id, (current as { status: string }).status, `${me.email}: ${note.trim()}`)
  } catch (error) {
    reportServerError(error, { action: 'noteOnApplication' })
    return { ok: false, message: 'That change was not applied.' }
  }
}
