import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasRlsEnv } from './helpers/env'
import { serviceClient, userClient } from './helpers/db'

/**
 * The maker-checker credit grant (doc 13 §6).
 *
 * What "two-admin" has to mean, or it means nothing:
 *
 *   · the RIGHT code in the WRONG hands does not grant. This is the assertion
 *     the whole scheme rests on — without it "maker-checker" is just an OTP,
 *     and an OTP that any admin can redeem is one admin approving themselves
 *     through a longer path.
 *   · the requester cannot approve their own request even holding the code.
 *   · three wrong guesses burn the request rather than the approver's patience.
 *   · one approved request grants ONCE, however many times verify is called.
 *
 * Everything here goes through the real RPC with real minted JWTs, because the
 * question is what the database does, not what the app remembers to ask it.
 */
describe.skipIf(!hasRlsEnv)('ops credit maker-checker', () => {
  let svcMemo: SupabaseClient | undefined
  const svc = () => (svcMemo ??= serviceClient())

  const run = Date.now()
  const requesterSub = `user_cred_maker_${run}`
  const approverSub = `user_cred_checker_${run}`
  const strangerSub = `user_cred_other_${run}`
  const viewerSub = `user_cred_viewer_${run}`

  const requesterEmail = `maker-${run}@example.test`
  const approverEmail = `checker-${run}@example.test`
  const strangerEmail = `other-${run}@example.test`
  const viewerEmail = `viewer-${run}@example.test`

  const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
  const GOOD_CODE = '424242'
  const GOOD_HASH = sha256(GOOD_CODE)

  let workspaceId = ''
  const adminIds: string[] = []

  async function seatFor(userId: string, email: string, role: 'admin' | 'viewer') {
    const { data, error } = await svc()
      .from('ops_admins')
      .insert({ user_id: userId, email, name: email, role, status: 'active' })
      .select('id')
      .single()
    if (error) throw new Error(`seat ${email}: ${error.message}`)
    adminIds.push((data as { id: string }).id)
  }

  /** A fresh pending request, so each test starts from a known state. */
  async function newRequest(amount = 250): Promise<string> {
    const { data, error } = await userClient(requesterSub).rpc('ops_credit_request_create', {
      p_workspace_id: workspaceId,
      p_amount: amount,
      p_reason: 'Design-partner make-good',
      p_approver_email: approverEmail,
      p_otp_hash: GOOD_HASH,
      p_ttl_seconds: 600,
    })
    if (error) throw new Error(`create: ${error.message}`)
    return (data as { id: string }).id
  }

  async function available(): Promise<number> {
    const { data } = await svc()
      .from('credit_balances')
      .select('balance_total,balance_held')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    const row = data as { balance_total: number; balance_held: number } | null
    return row ? row.balance_total - row.balance_held : 0
  }

  beforeAll(async () => {
    const { data: ws, error } = await svc()
      .from('workspaces')
      .insert({ name: `Credits ${run}`, slug: `credits-${run}`, created_by: requesterSub })
      .select('id')
      .single()
    if (error) throw new Error(`workspace: ${error.message}`)
    workspaceId = (ws as { id: string }).id

    await seatFor(requesterSub, requesterEmail, 'admin')
    await seatFor(approverSub, approverEmail, 'admin')
    await seatFor(strangerSub, strangerEmail, 'admin')
    await seatFor(viewerSub, viewerEmail, 'viewer')
  })

  afterAll(async () => {
    if (workspaceId) await svc().from('workspaces').delete().eq('id', workspaceId)
    if (adminIds.length > 0) await svc().from('ops_admins').delete().in('id', adminIds)
  })

  it('THE right code in THE WRONG hands grants nothing', async () => {
    // A third active admin, holding the correct six digits, is not the approver
    // this request named. If this passes, "two-admin" is decoration.
    const requestId = await newRequest()
    const before = await available()

    const { data, error } = await userClient(strangerSub).rpc('ops_credit_request_verify', {
      p_request_id: requestId,
      p_otp_hash: GOOD_HASH,
      p_allow_self: false,
    })

    expect(error).toBeNull()
    expect(data).toMatchObject({ ok: false, reason: 'not_the_approver' })
    expect(await available()).toBe(before)

    // And the request is still pending — a wrong-hands attempt must not burn it,
    // or anyone could deny a colleague their approval by racing them to it.
    const { data: row } = await svc()
      .from('ops_credit_requests')
      .select('status,attempts')
      .eq('id', requestId)
      .single()
    expect(row).toMatchObject({ status: 'pending', attempts: 0 })
  })

  it('the requester cannot approve their own request even with the code', async () => {
    const requestId = await newRequest()
    const before = await available()

    const { data } = await userClient(requesterSub).rpc('ops_credit_request_verify', {
      p_request_id: requestId,
      p_otp_hash: GOOD_HASH,
      p_allow_self: false,
    })

    expect(data).toMatchObject({ ok: false, reason: 'self_approval_blocked' })
    expect(await available()).toBe(before)
  })

  it('a viewer cannot reach the verify path at all', async () => {
    const requestId = await newRequest()

    const { error } = await userClient(viewerSub).rpc('ops_credit_request_verify', {
      p_request_id: requestId,
      p_otp_hash: GOOD_HASH,
      p_allow_self: false,
    })

    // app.ops_writer() raises 42501 before any request state is read.
    expect(error).toBeTruthy()
  })

  it('refuses to create a request that names its own author as approver', async () => {
    const { error } = await userClient(requesterSub).rpc('ops_credit_request_create', {
      p_workspace_id: workspaceId,
      p_amount: 100,
      p_reason: 'self',
      p_approver_email: requesterEmail,
      p_otp_hash: GOOD_HASH,
      p_ttl_seconds: 600,
    })

    // Caught at creation so the mistake surfaces before an email goes out.
    expect(error?.message ?? '').toContain('OPS_CREDIT_SELF_APPROVER')
  })

  it('counts wrong guesses and burns the request on the third', async () => {
    const requestId = await newRequest()
    const wrong = sha256('000000')

    const first = await userClient(approverSub).rpc('ops_credit_request_verify', {
      p_request_id: requestId,
      p_otp_hash: wrong,
      p_allow_self: false,
    })
    expect(first.data).toMatchObject({ ok: false, reason: 'wrong_code', attempts_left: 2 })

    await userClient(approverSub).rpc('ops_credit_request_verify', {
      p_request_id: requestId,
      p_otp_hash: wrong,
      p_allow_self: false,
    })
    const third = await userClient(approverSub).rpc('ops_credit_request_verify', {
      p_request_id: requestId,
      p_otp_hash: wrong,
      p_allow_self: false,
    })
    expect(third.data).toMatchObject({ ok: false })

    // Burnt: the correct code no longer works on a request that ran out of tries.
    const after = await userClient(approverSub).rpc('ops_credit_request_verify', {
      p_request_id: requestId,
      p_otp_hash: GOOD_HASH,
      p_allow_self: false,
    })
    expect(after.data).toMatchObject({ ok: false })
    expect((after.data as { reason: string }).reason).not.toBe('wrong_code')
  })

  it('grants once, and a replay grants nothing more', async () => {
    const requestId = await newRequest(250)
    const before = await available()

    const first = await userClient(approverSub).rpc('ops_credit_request_verify', {
      p_request_id: requestId,
      p_otp_hash: GOOD_HASH,
      p_allow_self: false,
    })
    expect(first.error).toBeNull()
    expect(first.data).toMatchObject({ ok: true, amount: 250 })

    const afterGrant = await available()
    expect(afterGrant).toBe(before + 250)

    // The replay. Two independent guards stand behind this: the request is
    // already 'approved' so the ledger is never reached, and the idempotency key
    // admin_grant:<id> would make apply_ledger_entry a no-op if it were.
    const replay = await userClient(approverSub).rpc('ops_credit_request_verify', {
      p_request_id: requestId,
      p_otp_hash: GOOD_HASH,
      p_allow_self: false,
    })
    expect(replay.data).toMatchObject({ ok: true, replayed: true })
    expect(await available()).toBe(afterGrant)

    // Exactly one GRANT row carries this request's key.
    const { data: entries } = await svc()
      .from('credit_ledger')
      .select('id,amount,action_type,idempotency_key')
      .eq('idempotency_key', `admin_grant:${requestId}`)
    expect(entries).toHaveLength(1)
    expect(entries?.[0]).toMatchObject({ amount: 250, action_type: 'admin_grant' })
  })

  it('spends the code — the hash is cleared once decided', async () => {
    const requestId = await newRequest(10)
    await userClient(approverSub).rpc('ops_credit_request_verify', {
      p_request_id: requestId,
      p_otp_hash: GOOD_HASH,
      p_allow_self: false,
    })

    const { data } = await svc()
      .from('ops_credit_requests')
      .select('status,otp_hash,approver_id,ledger_idempotency_key')
      .eq('id', requestId)
      .single()

    expect(data).toMatchObject({
      status: 'approved',
      otp_hash: null,
      approver_id: approverEmail,
      ledger_idempotency_key: `admin_grant:${requestId}`,
    })
  })

  it('caps a single request at 10,000 credits', async () => {
    const { error } = await userClient(requesterSub).rpc('ops_credit_request_create', {
      p_workspace_id: workspaceId,
      p_amount: 10_001,
      p_reason: 'too much',
      p_approver_email: approverEmail,
      p_otp_hash: GOOD_HASH,
      p_ttl_seconds: 600,
    })
    expect(error?.message ?? '').toContain('OPS_CREDIT_AMOUNT')
  })

  it('writes an audit row for the approval', async () => {
    const requestId = await newRequest(5)
    await userClient(approverSub).rpc('ops_credit_request_verify', {
      p_request_id: requestId,
      p_otp_hash: GOOD_HASH,
      p_allow_self: false,
    })

    const { data } = await svc()
      .from('ops_audit_log')
      .select('actor,action,target_id')
      .eq('target_id', requestId)
      .eq('action', 'credit.approved')

    expect(data).toHaveLength(1)
    expect(data?.[0]).toMatchObject({ actor: approverEmail })
  })
})
