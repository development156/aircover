import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasRlsEnv, hasLedgerEnv } from './helpers/env'
import { serviceClient, userClient, anonClient, pgPool } from './helpers/db'

/**
 * The HUMAN write path (doc 13 §10, §15) — who may call it, and what it can reach.
 *
 * Two separate claims are proved here and they fail for different reasons:
 *
 *   1. AUTHORISATION. anon and a signed-in stranger cannot call these RPCs at
 *      all; a REVOKED admin cannot; a VIEWER cannot, because doc 13 §2 makes
 *      viewer read-only and `app.is_ops_admin()` alone would let them through;
 *      an owner/admin can, and the row actually changes — without that positive
 *      control every denial above is vacuous.
 *
 *   2. THE CREDITS BOUNDARY. No function on the human write path may read or
 *      write ops_credit_requests, credit_ledger or credit_balances, or call
 *      app.apply_ledger_entry. This is asserted against pg_get_functiondef()
 *      rather than trusted to review, so a future edit that reaches for the
 *      ledger from a board function fails the suite instead of shipping.
 */
describe.skipIf(!hasRlsEnv)('ops human write path', () => {
  let svcMemo: SupabaseClient | undefined
  const svc = () => (svcMemo ??= serviceClient())

  const run = Date.now()
  const ownerSub = `user_ops_owner_${run}`
  const viewerSub = `user_ops_viewer_${run}`
  const revokedSub = `user_ops_revoked_w_${run}`
  const strangerSub = `user_ops_stranger_w_${run}`
  const code = `SL-TEST-${run}`

  /**
   * A refusal, and specifically not a MISSING function.
   *
   * `expect(error).not.toBeNull()` passed on every negative case here while the
   * migration was unapplied, because PostgREST answered PGRST202 (no such
   * function) — the suite was green about an authorisation rule that did not
   * exist yet. A denial must be a denial: 42501 from app.ops_writer(), or
   * PostgREST refusing an anon/unknown caller (PGRST301/401/403).
   */
  function expectDenied(error: { code?: string } | null) {
    expect(error).not.toBeNull()
    expect(error?.code).not.toBe('PGRST202')
  }

  beforeAll(async () => {
    await svc()
      .from('ops_admins')
      .insert([
        { user_id: ownerSub, email: `owner_${run}@test.invalid`, role: 'owner', status: 'active' },
        {
          user_id: viewerSub,
          email: `viewer_${run}@test.invalid`,
          role: 'viewer',
          status: 'active',
        },
        {
          user_id: revokedSub,
          email: `revoked_${run}@test.invalid`,
          role: 'admin',
          status: 'revoked',
        },
      ])

    await svc().from('ops_tasks').insert({ code, title: 'write-path fixture' })
  })

  afterAll(async () => {
    await svc().from('ops_tasks').delete().eq('code', code)
    await svc().from('ops_admins').delete().in('user_id', [ownerSub, viewerSub, revokedSub])
    await svc().from('ops_copy_watermarks').delete().in('user_id', [ownerSub, viewerSub])
  })

  describe('who may move a card', () => {
    it('lets an active owner move it, and the row really changes', async () => {
      const { error } = await userClient(ownerSub).rpc('ops_task_move', {
        p_code: code,
        p_column: 'in_progress',
        p_note: 'picked up',
      })
      expect(error).toBeNull()

      const { data } = await svc()
        .from('ops_tasks')
        .select('board_column, moved_by, started_at')
        .eq('code', code)
        .single()

      expect(data?.board_column).toBe('in_progress')
      // The whole point of a human path: the board can say who moved it.
      expect(data?.moved_by).toBe('human')
      expect(data?.started_at).not.toBeNull()
    })

    it('refuses a VIEWER — read-only means read-only', async () => {
      // is_ops_admin() is true for a viewer, so this is the assertion that keeps
      // the read gate from doubling as the write gate.
      const { error } = await userClient(viewerSub).rpc('ops_task_move', {
        p_code: code,
        p_column: 'done',
      })
      expectDenied(error)
    })

    it.each([
      ['a revoked admin', () => userClient(revokedSub)],
      ['an authenticated stranger', () => userClient(strangerSub)],
      ['anon', () => anonClient()],
    ])('refuses %s', async (_who, client) => {
      const { error } = await client().rpc('ops_task_move', {
        p_code: code,
        p_column: 'done',
      })
      expectDenied(error)
    })

    it('raises rather than silently doing nothing', async () => {
      // A write that no-ops is worse than one that fails: the UI would report
      // success over an unchanged row.
      const { error } = await userClient(viewerSub).rpc('ops_task_move', {
        p_code: code,
        p_column: 'done',
      })
      const { data } = await svc()
        .from('ops_tasks')
        .select('board_column')
        .eq('code', code)
        .single()

      expectDenied(error)
      expect(data?.board_column).toBe('in_progress')
    })
  })

  describe('lifecycle stamps', () => {
    it('CLEARS a stamp the new column does not justify (SL-036)', async () => {
      const admin = userClient(ownerSub)
      await admin.rpc('ops_task_move', { p_code: code, p_column: 'done' })

      const { data: done } = await svc()
        .from('ops_tasks')
        .select('done_at, review_at')
        .eq('code', code)
        .single()
      expect(done?.done_at).not.toBeNull()

      // Backward. The old coalescing behaviour left done_at in place, and the
      // board's "age in column" then read a stamp for a column the card had
      // left — proven on 2026-07-26 when two wrongly-closed cards were reverted.
      await admin.rpc('ops_task_move', { p_code: code, p_column: 'todo' })

      const { data: back } = await svc()
        .from('ops_tasks')
        .select('started_at, review_at, done_at')
        .eq('code', code)
        .single()

      expect(back?.done_at).toBeNull()
      expect(back?.review_at).toBeNull()
      expect(back?.started_at).toBeNull()
    })
  })

  describe('editing and creating', () => {
    it('refuses to block a card without a reason', async () => {
      const { error } = await userClient(ownerSub).rpc('ops_task_edit', {
        p_code: code,
        p_blocked: true,
      })
      expect(error).not.toBeNull()
    })

    it('leaves untouched fields alone when only one is edited', async () => {
      const admin = userClient(ownerSub)
      await admin.rpc('ops_task_edit', { p_code: code, p_detail: 'a detail' })
      await admin.rpc('ops_task_edit', { p_code: code, p_sort: 42 })

      const { data } = await svc()
        .from('ops_tasks')
        .select('title, detail, sort')
        .eq('code', code)
        .single()

      expect(data?.title).toBe('write-path fixture')
      expect(data?.detail).toBe('a detail')
      expect(data?.sort).toBe(42)
    })

    it('assigns the next code itself rather than trusting the caller', async () => {
      const { data: created, error } = await userClient(ownerSub).rpc('ops_task_create', {
        p_title: 'created by a human',
      })
      expect(error).toBeNull()
      expect(created).toMatch(/^SL-\d{3,}$/)

      const { data } = await svc()
        .from('ops_tasks')
        .select('moved_by, assignee')
        .eq('code', created as string)
        .single()
      expect(data?.moved_by).toBe('human')

      await svc()
        .from('ops_tasks')
        .delete()
        .eq('code', created as string)
    })

    it('archives rather than deletes', async () => {
      await userClient(ownerSub).rpc('ops_task_archive', { p_code: code, p_archived: true })
      const { data } = await svc().from('ops_tasks').select('archived').eq('code', code).single()

      expect(data?.archived).toBe(true)
      await userClient(ownerSub).rpc('ops_task_archive', { p_code: code, p_archived: false })
    })
  })

  describe('changelog copy watermark', () => {
    it('never rewinds — a re-copy of an older day cannot resurface entries', async () => {
      const admin = userClient(ownerSub)
      await admin.rpc('ops_changelog_mark_copied', { p_seq: 58 })
      const { data } = await admin.rpc('ops_changelog_mark_copied', { p_seq: 12 })

      expect(Number(data)).toBe(58)
    })

    it('is private to its own admin', async () => {
      const { data } = await userClient(viewerSub).from('ops_copy_watermarks').select('*')
      expect(data ?? []).toHaveLength(0)
    })
  })

  describe('nobody writes these tables directly', () => {
    it('refuses an active owner INSERTing into ops_tasks', async () => {
      const { error } = await userClient(ownerSub)
        .from('ops_tasks')
        .insert({ code: `SL-DIRECT-${run}`, title: 'should not land' })
      expect(error).not.toBeNull()
    })

    it('lets an active owner UPDATE ops_tasks change NOTHING', async () => {
      // Asserting on `error` here was wrong, and the way it was wrong matters.
      // With no UPDATE policy the row is simply not visible to update, so
      // PostgREST affects zero rows and returns NO ERROR — a denied write and a
      // successful one are indistinguishable from the response alone. The
      // guarantee is about the row, not the status code, so that is what is
      // asserted. (INSERT does raise, because its WITH CHECK fails; that is the
      // sibling case in ops_rls.test.ts.)
      const before = await svc().from('ops_tasks').select('title').eq('code', code).single()

      await userClient(ownerSub)
        .from('ops_tasks')
        .update({ title: 'should not change' })
        .eq('code', code)

      const after = await svc().from('ops_tasks').select('title').eq('code', code).single()

      expect(after.data?.title).toBe(before.data?.title)
      expect(after.data?.title).not.toBe('should not change')
    })
  })
})

/**
 * The credits boundary, read out of the catalog.
 *
 * Needs a direct connection because pg_get_functiondef is not reachable through
 * PostgREST — same reason the ledger tests use one.
 */
describe.skipIf(!hasLedgerEnv)('human write path cannot reach credits', () => {
  const FORBIDDEN = [
    'ops_credit_requests',
    'credit_ledger',
    'credit_balances',
    'apply_ledger_entry',
  ]

  const pool = pgPool()
  afterAll(async () => {
    await pool.end()
  })

  it('mentions no credits identifier in any registered write function', async () => {
    const { rows } = await pool.query<{ name: string; body: string }>(`
      select p.proname as name, pg_get_functiondef(p.oid) as body
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = any (app.ops_human_write_functions())
    `)

    // Non-vacuity, tied to the registry rather than to a number. A literal
    // count was here and went stale the moment the list grew from 5 to 15 —
    // which made a real guard fail for a bookkeeping reason and taught nobody
    // anything. What matters is that EVERY registered function was scanned.
    const { rows: registry } = await pool.query<{ names: string[] }>(
      'select app.ops_human_write_functions() as names',
    )
    expect(rows.map((r) => r.name).sort()).toEqual([...registry[0]!.names].sort())
    expect(rows.length).toBeGreaterThan(10)

    for (const { name, body } of rows) {
      for (const identifier of FORBIDDEN) {
        // If this fails, someone wired the board to the ledger. That is the one
        // thing doc 13 §16 says the agent-reachable surface must never do.
        expect(`${name}:${body.includes(identifier)}`).toBe(`${name}:false`)
      }
    }
  })

  it('registers EVERY public ops_* write function, so none escapes the check', async () => {
    // Without this, the guard above is opt-in: a new function simply omitted
    // from app.ops_human_write_functions() would never be scanned.
    const { rows } = await pool.query<{ name: string }>(`
      select p.proname as name
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname like 'ops\\_%'
        and p.proname <> 'ops_ingest'
        and not (p.proname = any (app.ops_human_write_functions()))
        and not (p.proname = any (app.ops_credit_functions()))
    `)

    expect(rows.map((r) => r.name)).toEqual([])
  })

  it('keeps the credits list short enough that a fifth entry is a decision', async () => {
    // The human-write list is guarded by "mentions no credit table anywhere".
    // This is the list that is allowed to, so it is enumerated rather than
    // described — growing it should be a diff somebody has to justify, not a
    // side effect of adding a function.
    const { rows } = await pool.query<{ names: string[] }>(
      'select app.ops_credit_functions() as names',
    )

    expect([...rows[0]!.names].sort()).toEqual([
      'ops_credit_request_create',
      'ops_credit_request_deny',
      'ops_credit_request_verify',
      'ops_workspace_search',
    ])
  })
})
