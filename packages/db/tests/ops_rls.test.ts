import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasRlsEnv } from './helpers/env'
import { serviceClient, userClient, anonClient } from './helpers/db'

/**
 * Platform-scope isolation for the ten `ops_*` tables (doc 13 §3, §16).
 *
 * These tables are the ONLY sanctioned exception to "every table carries
 * workspace_id", so the usual membership proof does not apply. What has to hold
 * instead:
 *
 *   · anon reads nothing, from every table;
 *   · an authenticated stranger reads nothing (being signed in is not enough);
 *   · a REVOKED admin reads nothing (status, not mere presence, is the gate);
 *   · an active ops admin reads rows — the positive control, without which every
 *     denial above is vacuous;
 *   · NOBODY writes directly. There are no write policies at all: every mutation
 *     goes through a `public.ops_*` RPC that re-checks `app.is_ops_admin()`.
 *     So the admin's own INSERT must fail too, and that is the assertion that
 *     keeps the write perimeter where the design put it.
 *
 * Skipped unless the anon + service keys and the JWT secret are set, per the
 * house pattern — a credential-free clone must stay green at the Stop gate.
 */
describe.skipIf(!hasRlsEnv)('ops_* platform isolation', () => {
  // lazy: creating the client at collection time would throw before skipIf applies
  let svcMemo: SupabaseClient | undefined
  const svc = () => (svcMemo ??= serviceClient())

  const run = Date.now()
  const adminSub = `user_ops_admin_${run}`
  const revokedSub = `user_ops_revoked_${run}`
  // Authenticated, but in no ops_admins row at all. Distinct from the revoked
  // subject because they fail for different reasons — absence vs. status — and a
  // single subject cannot separate the two.
  const strangerSub = `user_ops_stranger_${run}`

  /** Every ops table, with a row this run inserts so the admin has something to see. */
  const TABLES = [
    'ops_admins',
    'ops_beta_applications',
    'ops_credit_requests',
    'ops_roadmap_items',
    'ops_tasks',
    'ops_changelog',
    'ops_qa_runs',
    'ops_qa_artifacts',
    'ops_sessions',
    'ops_audit_log',
  ] as const

  /** Ids to sweep in afterAll, keyed by table. */
  const seeded = new Map<string, string[]>()
  const remember = (table: string, id: string) => {
    seeded.set(table, [...(seeded.get(table) ?? []), id])
  }

  let workspaceId = ''
  let qaRunId = ''

  async function insertOne(table: string, row: Record<string, unknown>): Promise<string> {
    const { data, error } = await svc().from(table).insert(row).select('id').single()
    if (error) throw new Error(`seed ${table}: ${error.message}`)
    const id = (data as { id: string }).id
    remember(table, id)
    return id
  }

  beforeAll(async () => {
    // A real workspace, because ops_credit_requests references one.
    const { data: ws, error: wsError } = await svc()
      .from('workspaces')
      .insert({ name: `Ops RLS ${run}`, slug: `ops-rls-${run}`, created_by: adminSub })
      .select('id')
      .single()
    if (wsError) throw new Error(`seed workspace: ${wsError.message}`)
    workspaceId = (ws as { id: string }).id

    await insertOne('ops_admins', {
      user_id: adminSub,
      email: `ops-admin-${run}@example.test`,
      name: 'Ops RLS admin',
      role: 'owner',
      status: 'active',
    })
    await insertOne('ops_admins', {
      user_id: revokedSub,
      email: `ops-revoked-${run}@example.test`,
      name: 'Ops RLS revoked',
      role: 'admin',
      status: 'revoked',
    })
    await insertOne('ops_beta_applications', {
      name: 'Ops RLS applicant',
      business_name: 'Chai & Chapters',
      email: `ops-applicant-${run}@example.test`,
      phone: '9876543210',
      status: 'new',
    })
    await insertOne('ops_credit_requests', {
      workspace_id: workspaceId,
      workspace_label: `Ops RLS ${run}`,
      amount: 100,
      reason: 'RLS fixture — never approved',
      requested_by: adminSub,
      status: 'pending',
    })
    await insertOne('ops_roadmap_items', {
      code: `RLS${run}`,
      stage: `test-${run}`,
      title: 'Ops RLS fixture item',
      weight: 1,
      status: 'todo',
      sort: 1,
    })
    await insertOne('ops_tasks', {
      code: `SL-RLS${run}`,
      title: 'Ops RLS fixture task',
      board_column: 'todo',
      assignee: 'claude',
      moved_by: 'claude',
      sort: 1,
    })
    await insertOne('ops_changelog', {
      title: `Ops RLS fixture ${run}`,
      summary_plain: 'A fixture row. It exists so a denial can be told apart from an empty table.',
      kind: 'docs',
      task_codes: [`SL-RLS${run}`],
    })
    qaRunId = await insertOne('ops_qa_runs', {
      task_code: `SL-RLS${run}`,
      kind: 'auto',
      suite: 'unit',
      status: 'pass',
      summary_plain: 'Fixture run.',
      actor: 'claude',
    })
    await insertOne('ops_qa_artifacts', {
      run_id: qaRunId,
      storage_path: `qa/${qaRunId}/fixture.png`,
      caption: 'fixture',
      bytes: 1,
      mime: 'image/png',
    })
    await insertOne('ops_sessions', {
      session_id: `sess_ops_rls_${run}`,
      label: 'ops rls fixture',
      status: 'working',
      tasks_touched: [`SL-RLS${run}`],
    })
    await insertOne('ops_audit_log', {
      actor: `test:${adminSub}`,
      action: 'ops_rls.fixture',
      target_table: 'ops_tasks',
      target_id: `SL-RLS${run}`,
    })
  })

  afterAll(async () => {
    // ops_audit_log is append-only (app.block_mutations), so its fixture row
    // stays. A log you can tidy up afterwards is not a log — the rows are tiny
    // and carry a `test:` actor prefix so they are identifiable forever.
    for (const table of TABLES) {
      if (table === 'ops_audit_log') continue
      const ids = seeded.get(table) ?? []
      if (ids.length > 0) await svc().from(table).delete().in('id', ids)
    }
    if (workspaceId) await svc().from('workspaces').delete().eq('id', workspaceId)
  })

  describe('token liveness (guards against vacuous denials)', () => {
    it('the stranger token is authenticated, not silently anon', async () => {
      // guide_tours is platform content: `select to authenticated using (active)`.
      // An authenticated stranger sees the seeded tours while seeing no ops row
      // anywhere; anon sees nothing at all. That contrast is what proves the
      // stranger's denials below are about ops_admins membership, not a dead token.
      const stranger = await userClient(strangerSub)
        .from('guide_tours')
        .select('id')
        .eq('active', true)
      expect(stranger.error).toBeNull()
      expect((stranger.data ?? []).length).toBeGreaterThan(0)

      const anon = await anonClient().from('guide_tours').select('id').eq('active', true)
      expect(anon.data ?? []).toHaveLength(0)
    })

    it('the revoked admin token is authenticated too', async () => {
      const revoked = await userClient(revokedSub)
        .from('guide_tours')
        .select('id')
        .eq('active', true)
      expect(revoked.error).toBeNull()
      expect((revoked.data ?? []).length).toBeGreaterThan(0)
    })
  })

  describe.each(TABLES)('%s', (table) => {
    it('an active ops admin reads rows (positive control)', async () => {
      const { data, error } = await userClient(adminSub).from(table).select('id').limit(5)
      expect(error).toBeNull()
      expect((data ?? []).length).toBeGreaterThan(0)
    })

    it('signed-out anon reads nothing', async () => {
      const { data, error } = await anonClient().from(table).select('id').limit(5)
      // RLS filters rows, it does not raise. An error here would mean something
      // else broke and the zero count would be vacuous, so error is asserted null.
      expect({ data, error }).toEqual({ data: [], error: null })
    })

    it('an authenticated stranger reads nothing', async () => {
      const { data, error } = await userClient(strangerSub).from(table).select('id').limit(5)
      expect({ data, error }).toEqual({ data: [], error: null })
    })

    it('a revoked admin reads nothing', async () => {
      const { data, error } = await userClient(revokedSub).from(table).select('id').limit(5)
      expect({ data, error }).toEqual({ data: [], error: null })
    })
  })

  describe('the write perimeter', () => {
    it('anon cannot insert a beta application — there is no anon-insert path', async () => {
      const { error } = await anonClient()
        .from('ops_beta_applications')
        .insert({
          name: 'Anon',
          business_name: 'Anon co',
          email: `anon-${run}@example.test`,
          phone: '9000000000',
          status: 'new',
        })
      expect(error).toBeTruthy()

      const { count } = await svc()
        .from('ops_beta_applications')
        .select('id', { count: 'exact', head: true })
        .eq('email', `anon-${run}@example.test`)
      expect(count).toBe(0)
    })

    it('even an active ops admin cannot INSERT directly — writes go through RPCs', async () => {
      const { error } = await userClient(adminSub)
        .from('ops_tasks')
        .insert({
          code: `SL-DIRECT${run}`,
          title: 'written without an RPC',
          board_column: 'todo',
          assignee: 'claude',
          moved_by: 'human',
          sort: 999,
        })
      expect(error).toBeTruthy()

      const { count } = await svc()
        .from('ops_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('code', `SL-DIRECT${run}`)
      expect(count).toBe(0)
    })

    it('an active ops admin cannot UPDATE directly either', async () => {
      const { error } = await userClient(adminSub)
        .from('ops_tasks')
        .update({ board_column: 'done' })
        .eq('code', `SL-RLS${run}`)
      // An update of an invisible-for-write row is a no-op, not always a raise —
      // so the row is re-read through the service client rather than trusting the
      // absence of an error.
      expect(error === null || Boolean(error)).toBe(true)

      const { data } = await svc()
        .from('ops_tasks')
        .select('board_column')
        .eq('code', `SL-RLS${run}`)
        .single()
      expect((data as { board_column: string }).board_column).toBe('todo')
    })

    // NOTE (P0): ops_ingest does not exist until P1, so these two currently pass
    // because the function is undefined rather than because the grant is right —
    // a green test proving the wrong thing. When the RPC lands they are tightened
    // to assert SQLSTATE 42501 (insufficient_privilege), not merely "some error".
    it('an authenticated admin cannot call the ingest RPC — it is service-role only', async () => {
      const { error } = await userClient(adminSub).rpc('ops_ingest', {
        p_payload: { source: 'forged', tasks: [] },
      })
      expect(error).toBeTruthy()
    })

    it('anon cannot call the ingest RPC', async () => {
      const { error } = await anonClient().rpc('ops_ingest', {
        p_payload: { source: 'forged', tasks: [] },
      })
      expect(error).toBeTruthy()
    })
  })

  describe('qa-artifacts bucket', () => {
    it('is private — anon cannot list it', async () => {
      const { data, error } = await anonClient().storage.from('qa-artifacts').list('qa')
      expect(error !== null || (data ?? []).length === 0).toBe(true)
    })

    it('an authenticated stranger cannot list it', async () => {
      const { data, error } = await userClient(strangerSub).storage.from('qa-artifacts').list('qa')
      expect(error !== null || (data ?? []).length === 0).toBe(true)
    })
  })
})
