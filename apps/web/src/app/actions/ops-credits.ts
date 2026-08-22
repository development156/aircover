'use server'

import { revalidatePath } from 'next/cache'
import { OpsCreditRequestCreateSchema, OpsCreditOtpVerifySchema } from '@sahoda/shared'

import {
  CREDIT_FAILED,
  type CreditCreateState,
  type CreditVerifyState,
  type WorkspaceHit,
} from '@/lib/ops/credit-state'
import { sendApprovalCode } from '@/lib/ops/email'
import { requireOpsAdmin } from '@/lib/ops/guard'
import { generateOtp, hashOtp, isWellFormedOtp, OTP_TTL_SECONDS } from '@/lib/ops/otp'
import { reportServerError } from '@/lib/observability/report'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * The maker-checker credit grant, app side (doc 13 §6).
 *
 * The database does the deciding — `ops_credit_request_verify` holds the row
 * lock, counts the attempts, checks who is asking, and calls
 * `app.apply_ledger_entry` exactly once. These actions carry inputs to it and
 * carry answers back; they do not adjudicate.
 *
 * The plaintext code lives in `createCreditRequest` for the length of one
 * function call. It goes to the mailer and nowhere else — not to the return
 * value, not to a log, not into an error.
 */

/*
 * There is deliberately NO self-approval flag here any more.
 *
 * There used to be: `env.OPS_ALLOW_SELF_APPROVE === 'true'`, passed to the RPC
 * as `p_allow_self`. That read as a server-side gate and was not one — the
 * function is granted to `authenticated`, so the parameter belonged to whoever
 * called it, and a direct supabase.rpc() from any writer-role admin set it
 * themselves and skipped the approver check entirely. An env var cannot gate a
 * decision the client gets to make.
 *
 * The escape hatch now lives in the database as `sahoda.allow_self_approve`,
 * which a PostgREST caller has no way to set. See migration 16.
 */

export async function searchWorkspaces(query: string): Promise<WorkspaceHit[]> {
  try {
    await requireOpsAdmin()
    if (query.trim().length < 2) return []

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('ops_workspace_search', { p_query: query.trim() })
    if (error) return []

    return Array.isArray(data) ? (data as WorkspaceHit[]) : []
  } catch (error) {
    reportServerError(error, { action: 'searchWorkspaces' })
    return []
  }
}

export async function createCreditRequest(input: {
  workspaceId: string
  amount: number
  reason: string
  approverEmail: string
}): Promise<CreditCreateState> {
  try {
    const me = await requireOpsAdmin()

    const parsed = OpsCreditRequestCreateSchema.safeParse({
      workspace_id: input.workspaceId,
      amount: input.amount,
      reason: input.reason,
      approver_email: input.approverEmail,
    })
    if (!parsed.success) {
      return { ok: false, message: 'Check the workspace, amount and reason, then try again.' }
    }

    // Refused here as well as in SQL so the person sees it before anything is
    // written or sent.
    if (parsed.data.approver_email.toLowerCase() === me.email.toLowerCase()) {
      return {
        ok: false,
        message: 'Pick a different admin to approve this — you cannot approve your own request.',
      }
    }

    const code = generateOtp()

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('ops_credit_request_create', {
      p_workspace_id: parsed.data.workspace_id,
      p_amount: parsed.data.amount,
      p_reason: parsed.data.reason,
      p_approver_email: parsed.data.approver_email,
      p_otp_hash: hashOtp(code),
      p_ttl_seconds: OTP_TTL_SECONDS,
    })

    if (error) {
      const message = error.message ?? ''
      if (message.includes('OPS_CREDIT_APPROVER_UNKNOWN')) {
        return { ok: false, message: 'That approver is not an active admin.' }
      }
      if (message.includes('OPS_CREDIT_SELF_APPROVER')) {
        return { ok: false, message: 'You cannot approve your own request.' }
      }
      if (message.includes('OPS_CREDIT_AMOUNT')) {
        return { ok: false, message: 'Amount must be between 1 and 10,000 credits.' }
      }
      if (error.code === '42501') {
        return { ok: false, message: 'Your account cannot request credits.' }
      }
      return { ok: false, message: CREDIT_FAILED }
    }

    const row = (data ?? {}) as { id?: string; approver_email?: string }
    if (!row.id) return { ok: false, message: CREDIT_FAILED }

    const sent = await sendApprovalCode({
      to: row.approver_email ?? parsed.data.approver_email,
      code,
      amount: parsed.data.amount,
      workspace: input.workspaceId,
      requestedBy: me.email,
      reason: parsed.data.reason,
    })

    if (!sent.ok) {
      // The request exists but its code cannot reach anyone. Said plainly rather
      // than leaving a row that looks like it is waiting on a person.
      return {
        ok: false,
        message:
          sent.reason === 'not_configured'
            ? 'Email is not set up, so the approval code could not be sent. The request was created but nobody can approve it — deny it and try again once email works.'
            : 'The approval code could not be sent. The request was created but nobody can approve it yet.',
      }
    }

    revalidatePath('/admin/credits')
    return { ok: true, requestId: row.id, approverEmail: row.approver_email ?? '' }
  } catch (error) {
    reportServerError(error, { action: 'createCreditRequest' })
    return { ok: false, message: CREDIT_FAILED }
  }
}

export async function verifyCreditOtp(input: {
  requestId: string
  code: string
}): Promise<CreditVerifyState> {
  try {
    await requireOpsAdmin()

    if (!isWellFormedOtp(input.code)) {
      // Not a round trip, and not an attempt spent on a typo.
      return { ok: false, message: 'The code is six digits.' }
    }

    const parsed = OpsCreditOtpVerifySchema.safeParse({
      request_id: input.requestId,
      code: input.code.trim(),
    })
    if (!parsed.success) return { ok: false, message: 'That request could not be found.' }

    const supabase = createServerSupabase()
    const { data, error } = await supabase.rpc('ops_credit_request_verify', {
      p_request_id: parsed.data.request_id,
      p_otp_hash: hashOtp(parsed.data.code),
    })

    if (error) {
      if (error.code === '42501') return { ok: false, message: 'Your account cannot approve this.' }
      return { ok: false, message: CREDIT_FAILED }
    }

    const result = (data ?? {}) as {
      ok?: boolean
      reason?: string
      amount?: number
      replayed?: boolean
      balance_after?: number
      attempts_left?: number
    }

    if (result.ok) {
      revalidatePath('/admin/credits')
      return {
        ok: true,
        // Absent, not zero — see CreditOtpState. A grant whose amount did not
        // come back is still a grant; saying it was zero is the invented figure.
        amount: typeof result.amount === 'number' ? result.amount : null,
        balanceAfter: result.balance_after ?? null,
        replayed: Boolean(result.replayed),
      }
    }

    // Each refusal says what happened, because "that didn't work" on a
    // three-attempt code is the least useful sentence available.
    const REASONS: Record<string, string> = {
      wrong_code:
        result.attempts_left === 0
          ? 'That code is wrong, and this request is now closed. Ask for a new one.'
          : `That code is wrong. ${result.attempts_left ?? 0} attempt${result.attempts_left === 1 ? '' : 's'} left.`,
      expired: 'This code has expired. Ask for a new request.',
      too_many_attempts: 'Too many wrong codes. This request is closed — ask for a new one.',
      not_the_approver: 'This code was sent to a different admin. They need to approve it.',
      self_approval_blocked: 'You raised this request, so you cannot approve it.',
      approved: 'This request has already been approved.',
      denied: 'This request was denied.',
    }

    revalidatePath('/admin/credits')
    return { ok: false, message: REASONS[result.reason ?? ''] ?? CREDIT_FAILED }
  } catch (error) {
    reportServerError(error, { action: 'verifyCreditOtp' })
    return { ok: false, message: CREDIT_FAILED }
  }
}

export async function denyCreditRequest(
  requestId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await requireOpsAdmin()
    if (reason.trim().length < 3) {
      return { ok: false, message: 'Say why it is being denied.' }
    }

    const supabase = createServerSupabase()
    const { error } = await supabase.rpc('ops_credit_request_deny', {
      p_request_id: requestId,
      p_reason: reason.trim(),
    })
    if (error) {
      if (error.code === '42501') return { ok: false, message: 'Your account cannot deny this.' }
      return { ok: false, message: 'That request is no longer pending.' }
    }

    revalidatePath('/admin/credits')
    return { ok: true }
  } catch (error) {
    reportServerError(error, { action: 'denyCreditRequest' })
    return { ok: false, message: CREDIT_FAILED }
  }
}
