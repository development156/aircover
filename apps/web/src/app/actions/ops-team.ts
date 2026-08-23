'use server'

import { revalidatePath } from 'next/cache'
import { OpsRoleSchema } from '@sahoda/shared'
import { z } from 'zod'

import { createInvitation } from '@/lib/ops/clerk-invitations'
import { requireOpsAdmin } from '@/lib/ops/guard'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'
import type { OpsWriteState } from '@/lib/ops/action-state'

/**
 * A4 · Team and roles (doc 13 §13).
 *
 * Owner-only, decided by `app.ops_owner()` in the database — these actions do
 * not check the role themselves, so they cannot drift from it.
 *
 * The last active owner cannot be demoted or revoked, by anyone, including
 * themselves. A console with no owner has no way back in short of SQL.
 */

const LAST_OWNER =
  'That is the last owner. Make someone else an owner first, or the console locks everyone out.'

function refusal(error: { code?: string | null; message?: string | null }): string {
  if ((error.message ?? '').includes('OPS_ADMIN_LAST_OWNER')) return LAST_OWNER
  if (error.code === '42501') return 'Only an owner can change the team.'
  return 'That change was not applied.'
}

export async function inviteAdmin(email: string, role: string): Promise<OpsWriteState> {
  try {
    await requireOpsAdmin()

    const parsed = z
      .object({ email: z.email(), role: OpsRoleSchema })
      .safeParse({ email: email.trim().toLowerCase(), role })
    if (!parsed.success) return { ok: false, message: 'Check the address and the role.' }

    // The seat first, then the invitation. A seat with no invitation is a
    // person who cannot sign in yet; an invitation with no seat is someone who
    // signs in and gets a 404 with no record of why they were asked.
    const supabase = createServerSupabase()
    const { error } = await supabase.rpc('ops_admin_upsert', {
      p_email: parsed.data.email,
      p_role: parsed.data.role,
      p_name: null,
    })
    if (error) return { ok: false, message: refusal(error) }

    const invited = await createInvitation(parsed.data.email)
    revalidatePath('/admin/team')

    if (!invited.ok && invited.reason !== 'already_invited') {
      return {
        ok: false,
        message: `The seat was created but the invitation did not send. ${invited.message}`,
      }
    }
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'inviteAdmin' })
    return { ok: false, message: 'That change was not applied.' }
  }
}

export async function setAdminRole(id: string, role: string): Promise<OpsWriteState> {
  try {
    await requireOpsAdmin()
    const parsed = z.object({ id: z.uuid(), role: OpsRoleSchema }).safeParse({ id, role })
    if (!parsed.success) return { ok: false, message: 'That seat could not be changed.' }

    const supabase = createServerSupabase()
    const { error } = await supabase.rpc('ops_admin_set_role', {
      p_id: parsed.data.id,
      p_role: parsed.data.role,
    })
    if (error) return { ok: false, message: refusal(error) }

    revalidatePath('/admin/team')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'setAdminRole' })
    return { ok: false, message: 'That change was not applied.' }
  }
}

export async function revokeAdmin(id: string): Promise<OpsWriteState> {
  try {
    await requireOpsAdmin()
    if (!z.uuid().safeParse(id).success) {
      return { ok: false, message: 'That seat could not be changed.' }
    }

    const supabase = createServerSupabase()
    const { error } = await supabase.rpc('ops_admin_revoke', { p_id: id })
    if (error) return { ok: false, message: refusal(error) }

    revalidatePath('/admin/team')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'revokeAdmin' })
    return { ok: false, message: 'That change was not applied.' }
  }
}
