import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  env: { OPS_ALLOW_SELF_APPROVE: 'false' as string | undefined },
  me: { email: 'maker@sahodalabs.com', role: 'admin', status: 'active' },
  rpc: { data: null as unknown, error: null as { code?: string; message?: string } | null },
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  mail: { ok: true } as { ok: true } | { ok: false; reason: 'not_configured' | 'failed' },
  mailed: [] as { to: string; code: string }[],
}))

vi.mock('@/lib/env', () => ({ env: state.env }))
vi.mock('@/lib/ops/guard', () => ({ requireOpsAdmin: () => Promise.resolve(state.me) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: () => {} }))
vi.mock('@/lib/ops/email', () => ({
  sendApprovalCode: (input: { to: string; code: string }) => {
    state.mailed.push({ to: input.to, code: input.code })
    return Promise.resolve(state.mail)
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.calls.push({ fn, args })
      return Promise.resolve(state.rpc)
    },
  }),
}))

const { createCreditRequest, verifyCreditOtp } = await import('./ops-credits')

/** A real uuid: the verify schema parses request_id as one. */
const REQ_ID = '00000000-0000-4000-8000-0000000000aa'

const GOOD = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  amount: 250,
  reason: 'Make-good for the failed publish',
  approverEmail: 'checker@sahodalabs.com',
}

afterEach(() => {
  state.env.OPS_ALLOW_SELF_APPROVE = 'false'
  state.rpc = { data: null, error: null }
  state.calls.length = 0
  state.mail = { ok: true }
  state.mailed.length = 0
})

describe('the code never reaches the requester', () => {
  it('returns no code, hash or anything code-shaped', async () => {
    state.rpc = { data: { id: 'req-1', approver_email: GOOD.approverEmail }, error: null }

    const result = await createCreditRequest(GOOD)

    // 'req-1' is what the mocked RPC returned; the action passes it through.
    expect(result).toEqual({
      ok: true,
      requestId: 'req-1',
      approverEmail: 'checker@sahodalabs.com',
    })
    // The plaintext went to exactly one place.
    expect(state.mailed).toHaveLength(1)
    const sentCode = state.mailed[0]!.code
    expect(sentCode).toMatch(/^\d{6}$/)
    expect(JSON.stringify(result)).not.toContain(sentCode)
  })

  it('sends only the hash to the database, never the digits', async () => {
    state.rpc = { data: { id: 'req-1' }, error: null }

    await createCreditRequest(GOOD)

    const args = state.calls[0]!.args
    const code = state.mailed[0]!.code
    expect(String(args.p_otp_hash)).toHaveLength(64)
    expect(String(args.p_otp_hash)).not.toContain(code)
  })

  it('generates a different code each time', async () => {
    state.rpc = { data: { id: 'req-1' }, error: null }

    await createCreditRequest(GOOD)
    await createCreditRequest(GOOD)

    expect(state.mailed[0]!.code).not.toBe(state.mailed[1]!.code)
  })
})

describe('an undeliverable code is not reported as a sent one', () => {
  it.each([
    ['email is not configured', 'not_configured' as const],
    ['the send failed', 'failed' as const],
  ])('says so plainly when %s', async (_label, reason) => {
    // The request row exists but nobody can approve it. Reporting success would
    // leave a row that looks like it is waiting on a person.
    state.rpc = { data: { id: 'req-1' }, error: null }
    state.mail = { ok: false, reason }

    const result = await createCreditRequest(GOOD)

    expect(result.ok).toBe(false)
    expect((result as { message: string }).message).toContain('nobody can approve it')
  })
})

describe('self-approval', () => {
  it('is refused before anything is written or sent', async () => {
    const result = await createCreditRequest({ ...GOOD, approverEmail: state.me.email })

    expect(result.ok).toBe(false)
    expect(state.calls).toEqual([])
    expect(state.mailed).toEqual([])
  })

  it('is refused case-insensitively', async () => {
    const result = await createCreditRequest({ ...GOOD, approverEmail: 'MAKER@SahodaLabs.com' })

    expect(result.ok).toBe(false)
    expect(state.calls).toEqual([])
  })

  it('sends NO self-approval flag, whatever the environment says', async () => {
    // This test used to assert the opposite — that OPS_ALLOW_SELF_APPROVE was
    // faithfully forwarded as p_allow_self. It passed, and it was pinning a
    // vulnerability: the parameter was on a function granted to `authenticated`,
    // so forwarding it correctly was irrelevant. Anyone could send their own.
    //
    // The property now is that the app has no say in it at all. If a
    // p_allow_self ever reappears in this call, the parameter is back on the
    // client-callable signature and the approver check is optional again.
    state.rpc = { data: { ok: true, amount: 5 }, error: null }

    for (const value of ['false', undefined, 'true']) {
      state.env.OPS_ALLOW_SELF_APPROVE = value
      await verifyCreditOtp({ requestId: REQ_ID, code: '123456' })

      const args = state.calls.at(-1)!.args
      expect(args).not.toHaveProperty('p_allow_self')
      expect(Object.keys(args).sort()).toEqual(['p_otp_hash', 'p_request_id'])
    }
  })
})

describe('verifying', () => {
  it('rejects a malformed code without spending an attempt', async () => {
    for (const code of ['', '12345', '1234567', 'abcdef', '12 34 56']) {
      const result = await verifyCreditOtp({ requestId: REQ_ID, code })
      expect(result.ok).toBe(false)
    }
    expect(state.calls).toEqual([])
  })

  it('reports a replay as already-approved rather than as a fresh grant', async () => {
    state.rpc = { data: { ok: true, amount: 250, replayed: true }, error: null }

    const result = await verifyCreditOtp({ requestId: REQ_ID, code: '123456' })

    expect(result).toMatchObject({ ok: true, replayed: true, amount: 250 })
  })

  it('names the reason a refusal happened', async () => {
    const cases: [string, string][] = [
      ['not_the_approver', 'different admin'],
      ['self_approval_blocked', 'cannot approve'],
      ['expired', 'expired'],
      ['too_many_attempts', 'closed'],
    ]

    for (const [reason, expected] of cases) {
      state.rpc = { data: { ok: false, reason }, error: null }
      const result = await verifyCreditOtp({ requestId: REQ_ID, code: '123456' })
      expect((result as { message: string }).message.toLowerCase()).toContain(expected)
    }
  })

  it('counts down the attempts left', async () => {
    state.rpc = { data: { ok: false, reason: 'wrong_code', attempts_left: 2 }, error: null }

    const result = await verifyCreditOtp({ requestId: REQ_ID, code: '123456' })

    expect((result as { message: string }).message).toContain('2 attempts left')
  })

  it('never leaks a Postgres message', async () => {
    state.rpc = {
      data: null,
      error: { code: 'P0001', message: 'ops_credit_requests constraint x' },
    }

    const result = await verifyCreditOtp({ requestId: REQ_ID, code: '123456' })

    expect(JSON.stringify(result)).not.toContain('ops_credit_requests')
    expect((result as { message: string }).message).toContain('No credits were moved')
  })
})
