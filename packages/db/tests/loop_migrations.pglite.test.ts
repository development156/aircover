import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'

import { bootSchema, CONTENT_FOUNDATION } from './helpers/pglite-schema'

/**
 * THE LOOP'S THREE MIGRATIONS, APPLIED AND EXERCISED, on a real Postgres.
 *
 * ── WHAT THIS SUITE IS FOR ───────────────────────────────────────────────────
 * These files go to the database that serves production, applied by hand, one at
 * a time. Everything checkable before that happens is checked here: that they
 * apply in order, and that the four guarantees the Loop makes about safety are
 * guarantees the DATABASE holds rather than promises the application makes.
 *
 * Each of those four is tested by BREAKING it and watching the break be refused:
 *
 *   · L3 cannot be stored — `insert … level = 3` must raise
 *   · a cycle cannot reach `creating` without an approval — the RPC must refuse
 *   · a rejected learning must leave the Brand Brain byte-identical — the version
 *     AND `updated_at` are compared, not merely the absence of an error
 *   · a brief cannot point at another tenant's post — the trigger must raise
 *
 * ── WHAT THIS SUITE CANNOT PROVE ─────────────────────────────────────────────
 * PGlite connects as a superuser, so ROW-LEVEL SECURITY IS BYPASSED here. Nothing
 * below may be read as evidence that a policy is enforced. The structural fact
 * that RLS is enabled is checkable and is checked; enforcement is proven against
 * the live database with an anon client, separately.
 */

const LOOP_BATCH = [
  '20260820000200_loop_autonomy.sql',
  '20260820000300_loop_cycles.sql',
  '20260820000400_loop_rpcs.sql',
  '20260820000500_loop_brief_channel_set.sql',
  '20260820000600_loop_kill_switch_reported.sql',
] as const

/** Everything the Loop files reference. `billing_ledger` is here for the kill switch's hold read. */
const FOUNDATION = [...CONTENT_FOUNDATION, '20260718000006_billing_ledger.sql'] as const

const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'
const USER_A = 'user_alpha'
const USER_B = 'user_beta'
const VIEWER = 'user_viewer'

/** A minimally valid brand payload — the six sections resolve_brand_memory pins. */
const BRAIN = {
  voice: { descriptor: 'warm', formality_label: 'casual', signature_phrases: ['a', 'b', 'c'], banned_phrases: [] },
  brand_persona: { archetype: 'sage', one_liner: 'we know books', core_values: ['x', 'y', 'z'] },
  customer_persona: { one_liner: 'readers', primary_pain_point: 'time', primary_fear: 'boredom', desired_identity: 'well-read' },
  hook: { core_promise: 'a better shelf', primary_emotion: 'calm', sample_hooks: ['h1', 'h2', 'h3'] },
  taboo: { red_lines: [] },
  alignment: { signal_lock: 'strong', note: '' },
}

/** Run as a given Clerk user — the claim `auth.jwt()` reads. */
async function asUser(db: PGlite, userId: string | null): Promise<void> {
  const claims = userId === null ? '{}' : JSON.stringify({ sub: userId })
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims])
}

/** The error message a raise carries, or '' when the call unexpectedly succeeded. */
async function raises(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn()
    return ''
  } catch (e) {
    return (e as Error).message
  }
}

describe('The Loop · migrations 20260820000200 / 000300 / 000400', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await bootSchema([...FOUNDATION, ...LOOP_BATCH])

    // Two tenants, three people. USER_A owns A, USER_B owns B, VIEWER can only look.
    await db.exec(`
      insert into workspaces (id, name, slug, created_by) values
        ('${WS_A}', 'Alpha', 'alpha', '${USER_A}'), ('${WS_B}', 'Beta', 'beta', '${USER_B}');
      insert into workspace_members (workspace_id, user_id, role) values
        ('${WS_A}', '${USER_A}', 'owner'),
        ('${WS_B}', '${USER_B}', 'owner'),
        ('${WS_A}', '${VIEWER}', 'viewer');
    `)
  })

  afterAll(async () => {
    await db.close()
  })

  // ───────────────────────────────────────────────────────────────────────────
  it('applies all three files in order on top of the schema production has', async () => {
    const r = await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public'`,
    )
    const live = new Set(r.rows.map((x) => x.tablename))
    expect(['loop_settings', 'loop_channel_autonomy', 'loop_cycles', 'loop_briefs']
      .filter((t) => !live.has(t))).toEqual([])
  })

  it('enables row-level security on all four tables (structural fact only)', async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
        where relname in ('loop_settings','loop_channel_autonomy','loop_cycles','loop_briefs')`,
    )
    expect(r.rows.filter((x) => !x.relrowsecurity).map((x) => x.relname)).toEqual([])
    expect(r.rows).toHaveLength(4)
  })

  it('gives the cycle tables READ-ONLY policies and the settings tables full CRUD', async () => {
    const r = await db.query<{ tablename: string; cmd: string }>(
      `select tablename, cmd from pg_policies where schemaname = 'public'
         and tablename in ('loop_settings','loop_channel_autonomy','loop_cycles','loop_briefs')`,
    )
    const byTable = (t: string) => r.rows.filter((x) => x.tablename === t).map((x) => x.cmd).sort()
    // A member may not write the record of what they were charged for.
    expect(byTable('loop_cycles')).toEqual(['SELECT'])
    expect(byTable('loop_briefs')).toEqual(['SELECT'])
    // A member writes their own settings directly.
    expect(byTable('loop_settings')).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE'])
    expect(byTable('loop_channel_autonomy')).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE'])
  })

  // ── GUARANTEE 1: L3 IS UNSTORABLE ─────────────────────────────────────────
  describe('the Autonomy Dial', () => {
    it('stores L0, L1 and L2', async () => {
      for (const [channel, level] of [['x', 0], ['gbp', 1], ['linkedin', 2]] as const) {
        await db.query(
          `insert into loop_channel_autonomy (workspace_id, channel, level) values ($1, $2, $3)`,
          [WS_A, channel, level],
        )
      }
      const r = await db.query<{ n: number }>(
        `select count(*)::int as n from loop_channel_autonomy where workspace_id = $1`, [WS_A])
      expect(r.rows[0].n).toBe(3)
    })

    it('REFUSES L3 — autopilot cannot be turned on by any route into this column', async () => {
      const msg = await raises(() =>
        db.query(`insert into loop_channel_autonomy (workspace_id, channel, level) values ($1,$2,$3)`,
          [WS_A, 'instagram', 3]))
      expect(msg).toMatch(/loop_channel_autonomy_level_check|violates check constraint/i)

      // And an UPDATE cannot smuggle it in either — the check is on the column,
      // not on the insert path, and this is the route a "just bump it" would take.
      const upd = await raises(() =>
        db.query(`update loop_channel_autonomy set level = 3 where workspace_id = $1 and channel = 'x'`, [WS_A]))
      expect(upd).toMatch(/violates check constraint/i)

      const still = await db.query<{ level: number }>(
        `select level from loop_channel_autonomy where workspace_id = $1 and channel = 'x'`, [WS_A])
      expect(still.rows[0].level).toBe(0)
    })

    it('defaults to L1 — drafts only, nothing reaches anyone', async () => {
      await db.query(`insert into loop_channel_autonomy (workspace_id, channel) values ($1,'instagram')`, [WS_A])
      const r = await db.query<{ level: number }>(
        `select level from loop_channel_autonomy where workspace_id=$1 and channel='instagram'`, [WS_A])
      expect(r.rows[0].level).toBe(1)
    })

    it('refuses a second dial for the same channel', async () => {
      const msg = await raises(() =>
        db.query(`insert into loop_channel_autonomy (workspace_id, channel, level) values ($1,'x',1)`, [WS_A]))
      expect(msg).toMatch(/duplicate key|unique/i)
    })

    it('defaults the weekly budget to 150 credits (FSD M2)', async () => {
      await db.query(`insert into loop_settings (workspace_id) values ($1)`, [WS_A])
      const r = await db.query<{ weekly_budget_credits: number; paused: boolean }>(
        `select weekly_budget_credits, paused from loop_settings where workspace_id=$1`, [WS_A])
      expect(r.rows[0].weekly_budget_credits).toBe(150)
      expect(r.rows[0].paused).toBe(false)
    })
  })

  // ── GUARANTEE 4: NO CROSS-TENANT BRIEF→POST LINK ──────────────────────────
  describe('brief-to-post tenancy', () => {
    it("refuses a brief in one workspace pointing at another workspace's post", async () => {
      await db.exec(`
        insert into loop_cycles (id, workspace_id, iso_year, iso_week)
          values ('33333333-3333-4333-8333-333333333333', '${WS_A}', 2026, 34);
        insert into posts (id, workspace_id, title, body)
          values ('44444444-4444-4444-8444-444444444444', '${WS_B}', 'beta post', 'b');
      `)
      const msg = await raises(() => db.query(
        `insert into loop_briefs (workspace_id, cycle_id, title, body, post_id)
         values ($1, '33333333-3333-4333-8333-333333333333', 't', 'b', '44444444-4444-4444-8444-444444444444')`,
        [WS_A]))
      expect(msg).toMatch(/LOOP_BRIEF_CROSS_TENANT/)
    })

    it('allows a brief pointing at its own workspace post, and nulls it if that post is deleted', async () => {
      await db.exec(`
        insert into posts (id, workspace_id, title, body)
          values ('55555555-5555-4555-8555-555555555555', '${WS_A}', 'alpha post', 'a');
        insert into loop_briefs (id, workspace_id, cycle_id, title, body, post_id, priority)
          values ('66666666-6666-4666-8666-666666666666', '${WS_A}',
                  '33333333-3333-4333-8333-333333333333', 't', 'b',
                  '55555555-5555-4555-8555-555555555555', 9);
        delete from posts where id = '55555555-5555-4555-8555-555555555555';
      `)
      const r = await db.query<{ post_id: string | null }>(
        `select post_id from loop_briefs where id = '66666666-6666-4666-8666-666666666666'`)
      // The brief SURVIVES the post's deletion — the record of what the Loop
      // planned is not erased by a customer tidying their Planner.
      expect(r.rows).toHaveLength(1)
      expect(r.rows[0].post_id).toBeNull()
    })
  })

  // ── GUARANTEE 2: NO CREATE WITHOUT AN APPROVED PREVIEW ────────────────────
  describe('loop_approve_cost — the gate between a plan and a bill', () => {
    const CYCLE = '77777777-7777-4777-8777-777777777777'
    const B1 = '77777777-0001-4777-8777-777777777777'
    const B2 = '77777777-0002-4777-8777-777777777777'

    beforeAll(async () => {
      await db.exec(`
        insert into loop_cycles (id, workspace_id, iso_year, iso_week, status, estimated_credits, budget_credits)
          values ('${CYCLE}', '${WS_A}', 2026, 35, 'awaiting_cost_approval', 21, 150);
        insert into loop_briefs (id, workspace_id, cycle_id, title, body, estimated_credits, priority) values
          ('${B1}', '${WS_A}', '${CYCLE}', 'one', 'b', 12, 1),
          ('${B2}', '${WS_A}', '${CYCLE}', 'two', 'b',  9, 2);
      `)
    })

    it('refuses without a signed-in user', async () => {
      await asUser(db, null)
      expect(await raises(() => db.query(`select public.loop_approve_cost($1)`, [CYCLE])))
        .toMatch(/AUTH_REQUIRED/)
    })

    it("refuses a member of another workspace, with no existence oracle", async () => {
      await asUser(db, USER_B)
      expect(await raises(() => db.query(`select public.loop_approve_cost($1)`, [CYCLE])))
        .toMatch(/NOT_A_MEMBER/)
      // A cycle id that does not exist at all gives a DIFFERENT error than
      // "not yours" would need to, and the same one a stranger's cycle gives.
      expect(await raises(() => db.query(
        `select public.loop_approve_cost('88888888-8888-4888-8888-888888888888')`)))
        .toMatch(/INVALID_CYCLE/)
    })

    it('refuses a viewer — approving a cost is spending money', async () => {
      await asUser(db, VIEWER)
      expect(await raises(() => db.query(`select public.loop_approve_cost($1)`, [CYCLE])))
        .toMatch(/FORBIDDEN_ROLE/)
    })

    it('refuses when the caller\'s shown total is not what the rows say', async () => {
      await asUser(db, USER_A)
      // The screen showed 21; caller claims 12. Nothing is approved.
      expect(await raises(() => db.query(
        `select public.loop_approve_cost($1, '{}', 12)`, [CYCLE])))
        .toMatch(/ESTIMATE_CHANGED/)
      const r = await db.query<{ cost_approved_at: string | null; status: string }>(
        `select cost_approved_at, status from loop_cycles where id = $1`, [CYCLE])
      expect(r.rows[0].cost_approved_at).toBeNull()
      expect(r.rows[0].status).toBe('awaiting_cost_approval')
    })

    it('refuses to approve a plan with every brief trimmed out', async () => {
      await asUser(db, USER_A)
      expect(await raises(() => db.query(
        `select public.loop_approve_cost($1, $2::uuid[])`, [CYCLE, `{${B1},${B2}}`])))
        .toMatch(/NOTHING_INCLUDED/)
    })

    it('trims and approves in one statement, recomputing the total from the rows', async () => {
      await asUser(db, USER_A)
      const r = await db.query<{ loop_approve_cost: Record<string, unknown> }>(
        `select public.loop_approve_cost($1, $2::uuid[], 12) as loop_approve_cost`,
        [CYCLE, `{${B2}}`],
      )
      const out = r.rows[0].loop_approve_cost
      expect(out.approved_credits).toBe(12)     // 21 proposed, 9 trimmed away
      expect(out.included_briefs).toBe(1)
      expect(out.excluded_briefs).toBe(1)
      expect(out.replayed).toBe(false)

      const c = await db.query<{ status: string; approved_credits: number; estimated_credits: number; cost_approved_by: string }>(
        `select status, approved_credits, estimated_credits, cost_approved_by from loop_cycles where id=$1`, [CYCLE])
      expect(c.rows[0].status).toBe('creating')
      // What was PROPOSED and what was APPROVED are both kept — the difference
      // is the record that the customer trimmed it.
      expect(c.rows[0].estimated_credits).toBe(21)
      expect(c.rows[0].approved_credits).toBe(12)
      expect(c.rows[0].cost_approved_by).toBe(USER_A)

      const trimmed = await db.query<{ included: boolean; stage_outcome: string }>(
        `select included, stage_outcome from loop_briefs where id=$1`, [B2])
      expect(trimmed.rows[0].included).toBe(false)
      expect(trimmed.rows[0].stage_outcome).toBe('skipped')
    })

    it('treats a second click as success, not as a failure', async () => {
      await asUser(db, USER_A)
      const r = await db.query<{ o: Record<string, unknown> }>(
        `select public.loop_approve_cost($1) as o`, [CYCLE])
      expect(r.rows[0].o.replayed).toBe(true)
      expect(r.rows[0].o.approved_credits).toBe(12)
    })

    it('refuses to approve a cycle that is not at the halt', async () => {
      await asUser(db, USER_A)
      await db.exec(`
        insert into loop_cycles (id, workspace_id, iso_year, iso_week, status)
          values ('99999999-9999-4999-8999-999999999999', '${WS_A}', 2026, 36, 'planning');
      `)
      expect(await raises(() => db.query(
        `select public.loop_approve_cost('99999999-9999-4999-8999-999999999999')`)))
        .toMatch(/WRONG_STATUS/)
    })
  })

  // ── GUARANTEE 3: A REJECTED LEARNING LEAVES THE BRAIN BYTE-IDENTICAL ──────
  describe('resolve_memory_event — learnings are proposed, never applied', () => {
    let brainBefore: { version: number; updated_at: string; payload: unknown }

    beforeAll(async () => {
      await db.query(
        `insert into brand_memory (workspace_id, version, status, payload, source)
         values ($1, 1, 'active', $2::jsonb, 'resolved')`,
        [WS_A, JSON.stringify(BRAIN)],
      )
      const r = await db.query<typeof brainBefore>(
        `select version, updated_at::text as updated_at, payload from brand_memory
          where workspace_id=$1 and status='active'`, [WS_A])
      brainBefore = r.rows[0]
    })

    it('REJECTING touches nothing — same version, same updated_at, same payload', async () => {
      const ev = await db.query<{ id: string }>(
        `insert into memory_events (workspace_id, source, diff, status)
         values ($1, 'insight', $2::jsonb, 'pending') returning id`,
        [WS_A, JSON.stringify({
          kind: 'brand_memory_patch',
          summary: 'Your calm posts outperform your urgent ones.',
          patch: { voice: { descriptor: 'calm and unhurried' } },
        })],
      )
      const id = ev.rows[0].id

      await asUser(db, USER_A)
      const out = await db.query<{ o: Record<string, unknown> }>(
        `select public.resolve_memory_event($1, 'rejected') as o`, [id])
      expect(out.rows[0].o.status).toBe('rejected')
      expect(out.rows[0].o.brand_memory_changed).toBe(false)

      // The assertion that matters: the BRAIN, compared field by field against
      // what it was. Not "no error was raised" — a silent write raises nothing.
      const after = await db.query<typeof brainBefore>(
        `select version, updated_at::text as updated_at, payload from brand_memory
          where workspace_id=$1 and status='active'`, [WS_A])
      expect(after.rows).toHaveLength(1)
      expect(after.rows[0].version).toBe(brainBefore.version)
      expect(after.rows[0].updated_at).toBe(brainBefore.updated_at)
      expect(after.rows[0].payload).toEqual(brainBefore.payload)

      // And no new version was inserted anywhere in the history.
      const n = await db.query<{ n: number }>(
        `select count(*)::int as n from brand_memory where workspace_id=$1`, [WS_A])
      expect(n.rows[0].n).toBe(1)

      // The event itself records the refusal, with no version attached.
      const e = await db.query<{ status: string; applied_memory_version: number | null; resolved_at: string | null }>(
        `select status, applied_memory_version, resolved_at from memory_events where id=$1`, [id])
      expect(e.rows[0].status).toBe('rejected')
      expect(e.rows[0].applied_memory_version).toBeNull()
      expect(e.rows[0].resolved_at).not.toBeNull()
    })

    it('refuses to overturn a rejection from a stale tab', async () => {
      const ev = await db.query<{ id: string }>(
        `insert into memory_events (workspace_id, source, diff, status, resolved_at)
         values ($1, 'insight', '{"patch":{"voice":{"descriptor":"x"}}}'::jsonb, 'rejected', now())
         returning id`, [WS_A])
      await asUser(db, USER_A)
      expect(await raises(() => db.query(
        `select public.resolve_memory_event($1, 'accepted')`, [ev.rows[0].id])))
        .toMatch(/ALREADY_RESOLVED/)
    })

    it('ACCEPTING bumps the version and keeps every sibling field', async () => {
      const ev = await db.query<{ id: string }>(
        `insert into memory_events (workspace_id, source, diff, status)
         values ($1, 'insight', $2::jsonb, 'pending') returning id`,
        [WS_A, JSON.stringify({ patch: { voice: { descriptor: 'calm and unhurried' } } })],
      )
      await asUser(db, USER_A)
      const out = await db.query<{ o: Record<string, unknown> }>(
        `select public.resolve_memory_event($1, 'accepted') as o`, [ev.rows[0].id])
      expect(out.rows[0].o.brand_memory_changed).toBe(true)
      expect(out.rows[0].o.brand_memory_version).toBe(2)

      const after = await db.query<{ payload: Record<string, Record<string, unknown>> }>(
        `select payload from brand_memory where workspace_id=$1 and status='active'`, [WS_A])
      const voice = after.rows[0].payload.voice
      expect(voice.descriptor).toBe('calm and unhurried')
      // THE WHOLE POINT OF THE DEEP MERGE. Postgres's own `||` would have
      // replaced `voice` wholesale and silently dropped these three.
      expect(voice.formality_label).toBe('casual')
      expect(voice.signature_phrases).toEqual(['a', 'b', 'c'])
      expect(voice.banned_phrases).toEqual([])
      // And nothing outside `voice` moved.
      expect(after.rows[0].payload.hook).toEqual(BRAIN.hook)

      // Exactly one active row — the old one is superseded, not deleted.
      const rows = await db.query<{ status: string; version: number }>(
        `select status, version from brand_memory where workspace_id=$1 order by version`, [WS_A])
      expect(rows.rows.map((r) => `${r.version}:${r.status}`)).toEqual(['1:superseded', '2:active'])
    })

    it('refuses a diff with no patch object', async () => {
      const ev = await db.query<{ id: string }>(
        `insert into memory_events (workspace_id, source, diff, status)
         values ($1, 'insight', '{"summary":"no patch here"}'::jsonb, 'pending') returning id`, [WS_A])
      await asUser(db, USER_A)
      expect(await raises(() => db.query(
        `select public.resolve_memory_event($1, 'accepted')`, [ev.rows[0].id])))
        .toMatch(/INVALID_DIFF/)
    })

    it("refuses another tenant's learning", async () => {
      const ev = await db.query<{ id: string }>(
        `insert into memory_events (workspace_id, source, diff, status)
         values ($1, 'insight', '{"patch":{"voice":{"descriptor":"x"}}}'::jsonb, 'pending') returning id`, [WS_A])
      await asUser(db, USER_B)
      expect(await raises(() => db.query(
        `select public.resolve_memory_event($1, 'rejected')`, [ev.rows[0].id])))
        .toMatch(/NOT_A_MEMBER/)
    })
  })

  // ── channels IS A SET, enforced by the database ──────────────────────────
  describe('loop_briefs.channels', () => {
    const C = 'bbbbbbbb-0001-4bbb-8bbb-bbbbbbbbbbbb'
    beforeAll(async () => {
      await db.query(
        `insert into loop_cycles (id, workspace_id, iso_year, iso_week) values ($1, $2, 2026, 40)`,
        [C, WS_A])
    })

    it('accepts a set of real channels, and an empty one', async () => {
      await db.query(
        `insert into loop_briefs (workspace_id, cycle_id, title, body, channels, priority)
         values ($1, $2, 't', 'b', '{x,linkedin}', 1)`, [WS_A, C])
      await db.query(
        `insert into loop_briefs (workspace_id, cycle_id, title, body, channels, priority)
         values ($1, $2, 't', 'b', '{}', 2)`, [WS_A, C])
      const r = await db.query<{ n: number }>(
        `select count(*)::int as n from loop_briefs where cycle_id = $1`, [C])
      expect(r.rows[0].n).toBe(2)
    })

    it('REFUSES the same channel twice — the defect that has shipped three times here', async () => {
      const msg = await raises(() => db.query(
        `insert into loop_briefs (workspace_id, cycle_id, title, body, channels, priority)
         values ($1, $2, 't', 'b', '{x,x}', 3)`, [WS_A, C]))
      expect(msg).toMatch(/loop_briefs_channels_is_set/)
    })

    it('REFUSES a channel this product does not have', async () => {
      const msg = await raises(() => db.query(
        `insert into loop_briefs (workspace_id, cycle_id, title, body, channels, priority)
         values ($1, $2, 't', 'b', '{tiktok}', 4)`, [WS_A, C]))
      expect(msg).toMatch(/loop_briefs_channels_is_set/)
    })

    it('refuses a duplicate arriving by UPDATE, not only by INSERT', async () => {
      const msg = await raises(() => db.query(
        `update loop_briefs set channels = '{gbp,gbp}' where cycle_id = $1 and priority = 1`, [C]))
      expect(msg).toMatch(/loop_briefs_channels_is_set/)
    })
  })

  // ── THE CREATE-STAGE GATE, WHICH IS A WHERE CLAUSE ───────────────────────
  describe('the orchestrator\'s own approval gate', () => {
    // apps/web lib/loop/store.ts readApprovedCycleForCreate, character for
    // character. The RPC's refusal protects the SCREEN; this protects the
    // ORCHESTRATOR, which writes over an owner connection and could set
    // status='creating' itself. Pinned here because it is the statement, and a
    // TypeScript test would only prove the function called something.
    const GATE = `select * from loop_cycles
      where id = $1 and workspace_id = $2
        and cost_approved_at is not null
        and approved_credits is not null
        and status = 'creating'`

    const G = 'cccccccc-0001-4ccc-8ccc-cccccccccccc'

    it('matches the statement the orchestrator actually runs', () => {
      const src = readFileSync(
        resolve(import.meta.dirname, '../../../apps/web/src/lib/loop/store.ts'),
        'utf8',
      )
      // Whitespace-normalised so formatting cannot break the link, but every
      // clause compared. Rename a column on either side and this goes red.
      const flat = (x: string) => x.replace(/\s+/g, ' ').trim()
      expect(flat(src)).toContain(flat(GATE))
    })

    it('REFUSES a cycle parked at the halt — nothing may be spent', async () => {
      await db.query(
        `insert into loop_cycles (id, workspace_id, iso_year, iso_week, status, estimated_credits)
         values ($1, $2, 2026, 41, 'awaiting_cost_approval', 30)`, [G, WS_A])
      const r = await db.query(GATE, [G, WS_A])
      expect(r.rows).toHaveLength(0)
    })

    it('still refuses when the status was forced to creating without an approval', async () => {
      // THE ACTUAL ATTACK THIS GUARDS: an owner connection bypassing the RPC.
      await db.query(`update loop_cycles set status = 'creating' where id = $1`, [G])
      const r = await db.query(GATE, [G, WS_A])
      // Three conditions, and the status is only one of them.
      expect(r.rows).toHaveLength(0)
    })

    it('cannot even STORE a half-written approval', async () => {
      // Stronger than the gate refusing it: the state is unreachable. A write
      // that stamps the timestamp without the amount is rejected by the row
      // check, so the gate never has to consider a cycle that claims approval
      // and cannot say what was approved. Discovered by writing this test
      // expecting the gate to do the work and watching the SETUP raise.
      const msg = await raises(() => db.query(
        `update loop_cycles set cost_approved_at = now(), cost_approved_by = 'u' where id = $1`,
        [G]))
      expect(msg).toMatch(/violates check constraint/i)

      // And the reverse half — an amount with no timestamp — is not approval,
      // so the gate refuses it on the cost_approved_at clause.
      await db.query(`update loop_cycles set approved_credits = 30 where id = $1`, [G])
      const r = await db.query(GATE, [G, WS_A])
      expect(r.rows).toHaveLength(0)
    })

    it('ADMITS a properly approved cycle', async () => {
      await db.query(
        `update loop_cycles
            set cost_approved_at = now(), cost_approved_by = 'u',
                approved_credits = 30, status = 'creating'
          where id = $1`, [G])
      const r = await db.query<{ id: string }>(GATE, [G, WS_A])
      expect(r.rows).toHaveLength(1)
      expect(r.rows[0].id).toBe(G)
    })

    it("refuses another tenant's approved cycle", async () => {
      const r = await db.query(GATE, [G, WS_B])
      expect(r.rows).toHaveLength(0)
    })
  })

  describe('app.jsonb_deep_merge', () => {
    it('merges nested objects key by key, where `||` would discard siblings', async () => {
      const r = await db.query<{ merged: unknown; shallow: unknown }>(
        `select app.jsonb_deep_merge('{"a":{"x":1,"y":2}}'::jsonb, '{"a":{"y":9}}'::jsonb) as merged,
                ('{"a":{"x":1,"y":2}}'::jsonb || '{"a":{"y":9}}'::jsonb) as shallow`)
      expect(r.rows[0].merged).toEqual({ a: { x: 1, y: 9 } })
      // Pinned so the reason this function exists stays visible: the operator
      // it replaces really does lose `x`.
      expect(r.rows[0].shallow).toEqual({ a: { y: 9 } })
    })

    it('replaces arrays wholesale rather than appending', async () => {
      const r = await db.query<{ m: unknown }>(
        `select app.jsonb_deep_merge('{"l":[1,2,3]}'::jsonb, '{"l":[9]}'::jsonb) as m`)
      expect(r.rows[0].m).toEqual({ l: [9] })
    })

    it('keeps an explicit null as a null rather than deleting the key', async () => {
      const r = await db.query<{ m: Record<string, unknown> }>(
        `select app.jsonb_deep_merge('{"a":1,"b":2}'::jsonb, '{"a":null}'::jsonb) as m`)
      expect(r.rows[0].m).toEqual({ a: null, b: 2 })
    })
  })

  // ── THE KILL SWITCH ───────────────────────────────────────────────────────
  describe('loop_kill_switch', () => {
    const KC = 'aaaaaaaa-0001-4aaa-8aaa-aaaaaaaaaaaa'
    const P_SCHED = 'aaaaaaaa-0002-4aaa-8aaa-aaaaaaaaaaaa'
    const P_PUBLISHED = 'aaaaaaaa-0003-4aaa-8aaa-aaaaaaaaaaaa'
    const P_MANUAL = 'aaaaaaaa-0004-4aaa-8aaa-aaaaaaaaaaaa'

    beforeAll(async () => {
      await db.exec(`
        insert into loop_cycles (id, workspace_id, iso_year, iso_week, status)
          values ('${KC}', '${WS_A}', 2026, 37, 'staging');

        -- one Loop post on the calendar, one Loop post already published,
        -- and one post the CUSTOMER scheduled by hand that the Loop never touched.
        insert into posts (id, workspace_id, title, body, status, scheduled_at, origin, channels) values
          ('${P_SCHED}',     '${WS_A}', 'loop scheduled', 'b', 'scheduled', now() + interval '3 days', 'plan_week', '{x}'),
          ('${P_PUBLISHED}', '${WS_A}', 'loop published', 'b', 'published', now() - interval '1 day',  'plan_week', '{x}'),
          ('${P_MANUAL}',    '${WS_A}', 'hand scheduled', 'b', 'scheduled', now() + interval '2 days', 'plan_week', '{x}');

        insert into post_variants (workspace_id, post_id, channel, body, publish_status) values
          ('${WS_A}', '${P_SCHED}', 'x', 'v', 'scheduled'),
          ('${WS_A}', '${P_PUBLISHED}', 'x', 'v', 'published');

        -- Only the first two are the LOOP's. The hand-scheduled one has the same
        -- origin and is deliberately NOT linked to a brief.
        insert into loop_briefs (workspace_id, cycle_id, title, body, priority, post_id, stage_outcome) values
          ('${WS_A}', '${KC}', 'b1', 'x', 1, '${P_SCHED}', 'awaiting_approval'),
          ('${WS_A}', '${KC}', 'b2', 'x', 2, '${P_PUBLISHED}', 'drafted');
      `)
    })

    it('refuses a non-member and a viewer', async () => {
      await asUser(db, USER_B)
      expect(await raises(() => db.query(`select public.loop_kill_switch($1)`, [WS_A])))
        .toMatch(/NOT_A_MEMBER/)
      await asUser(db, VIEWER)
      expect(await raises(() => db.query(`select public.loop_kill_switch($1)`, [WS_A])))
        .toMatch(/FORBIDDEN_ROLE/)
    })

    it('cancels the cycle, takes its posts off the calendar, and pauses', async () => {
      await asUser(db, USER_A)
      const r = await db.query<{ o: Record<string, unknown> }>(
        `select public.loop_kill_switch($1) as o`, [WS_A])
      const o = r.rows[0].o
      expect(o.posts_unscheduled).toBe(1)      // the scheduled one only
      expect(o.variants_unscheduled).toBe(1)
      expect(o.paused).toBe(true)

      const p = await db.query<{ id: string; status: string; scheduled_at: string | null }>(
        `select id, status, scheduled_at from posts where workspace_id=$1 order by title`, [WS_A])
      const byId = Object.fromEntries(p.rows.map((x) => [x.id, x]))

      // BOTH halves of the dispatcher's gate are broken, not one.
      expect(byId[P_SCHED].status).toBe('draft')
      expect(byId[P_SCHED].scheduled_at).toBeNull()

      // A published post is past recall and is NOT rewritten to look like a draft.
      expect(byId[P_PUBLISHED].status).toBe('published')

      // THE ONE THAT MATTERS MOST: the customer's own hand-scheduled post has the
      // same `origin` as the Loop's and is untouched, because the scoping runs
      // through the brief link and not through `origin`.
      expect(byId[P_MANUAL].status).toBe('scheduled')
      expect(byId[P_MANUAL].scheduled_at).not.toBeNull()

      const paused = await db.query<{ paused: boolean }>(
        `select paused from loop_settings where workspace_id=$1`, [WS_A])
      expect(paused.rows[0].paused).toBe(true)
    })

    it('reports outstanding Loop holds without releasing them — money is not moved here', async () => {
      await db.exec(`
        insert into credit_balances (workspace_id, balance_total, balance_held) values ('${WS_A}', 100, 20)
          on conflict (workspace_id) do update set balance_held = 20;
        insert into credit_ledger (workspace_id, entry_type, amount, balance_after,
                                   action_type, object_ref, idempotency_key)
        values ('${WS_A}', 'HOLD', 20, 80, 'loop_cycle', 'loop:cycle:${KC}', 'k-loop-hold-1');
      `)
      await asUser(db, USER_A)
      const r = await db.query<{ o: { outstanding_holds: Array<Record<string, unknown>> } }>(
        `select public.loop_kill_switch($1) as o`, [WS_A])
      const holds = r.rows[0].o.outstanding_holds
      expect(holds).toHaveLength(1)
      expect(holds[0].action_type).toBe('loop_cycle')
      expect(holds[0].amount).toBe(20)

      // The ledger is UNTOUCHED by this call: no RELEASE was written.
      const led = await db.query<{ n: number }>(
        `select count(*)::int as n from credit_ledger where workspace_id=$1 and entry_type='RELEASE'`, [WS_A])
      expect(led.rows[0].n).toBe(0)
    })

    // ── THE DEFECT THE FIRST VERSION HAD ───────────────────────────────────
    it('unschedules the posts of a REPORTED cycle too', async () => {
      // A cycle whose orchestration finished keeps its posts on the calendar —
      // their slots are days away by design. The first version scoped the post
      // update through `c.status = 'cancelled'`, so it walked straight past
      // them: the commonest reason to press this button ("the Loop planned my
      // week and I want it stopped") did nothing at all.
      //
      // Found on a live run by asking which rows still satisfied the
      // dispatcher's gate after a completed cycle. Four did. Every unit test
      // passed, because every one of them cancelled a LIVE cycle — the fixture
      // shared the blind spot with the code.
      const RC = 'dddddddd-0001-4ddd-8ddd-dddddddddddd'
      const RP = 'dddddddd-0002-4ddd-8ddd-dddddddddddd'
      const RHAND = 'dddddddd-0003-4ddd-8ddd-dddddddddddd'
      await db.exec(`
        insert into loop_cycles (id, workspace_id, iso_year, iso_week, status, reported_at)
          values ('${RC}', '${WS_A}', 2026, 45, 'reported', now());
        insert into posts (id, workspace_id, title, body, status, scheduled_at, origin, channels) values
          ('${RP}',    '${WS_A}', 'reported cycle post', 'b', 'approved',  now() + interval '4 days', 'plan_week', '{x}'),
          ('${RHAND}', '${WS_A}', 'hand scheduled two',  'b', 'scheduled', now() + interval '5 days', 'plan_week', '{x}');
        insert into loop_briefs (workspace_id, cycle_id, title, body, priority, post_id, stage_outcome)
          values ('${WS_A}', '${RC}', 'b', 'x', 1, '${RP}', 'awaiting_approval');
      `)

      await asUser(db, USER_A)
      const r = await db.query<{ o: Record<string, number> }>(
        `select public.loop_kill_switch($1, false) as o`, [WS_A])
      expect(r.rows[0].o.posts_unscheduled).toBe(1)

      const after = await db.query<{ id: string; status: string; scheduled_at: string | null }>(
        `select id, status, scheduled_at from posts where id in ($1, $2)`, [RP, RHAND])
      const byId = Object.fromEntries(after.rows.map((x) => [x.id, x]))
      // The reported cycle's post is off the calendar.
      expect(byId[RP].status).toBe('draft')
      expect(byId[RP].scheduled_at).toBeNull()
      // And the customer's own hand-scheduled post, same origin, is untouched.
      expect(byId[RHAND].status).toBe('scheduled')
      expect(byId[RHAND].scheduled_at).not.toBeNull()

      // The reported cycle itself is NOT rewritten — its week happened, and its
      // brief still records that it was drafted rather than skipped.
      const c = await db.query<{ status: string }>(
        `select status from loop_cycles where id = $1`, [RC])
      expect(c.rows[0].status).toBe('reported')
      const b = await db.query<{ stage_outcome: string }>(
        `select stage_outcome from loop_briefs where cycle_id = $1`, [RC])
      expect(b.rows[0].stage_outcome).toBe('awaiting_approval')
    })

    it('lets a new cycle be planned for the same week after a kill', async () => {
      // The partial unique index excludes cancelled rows, so pressing the kill
      // switch does not ban the customer from their own week.
      await db.query(
        `insert into loop_cycles (workspace_id, iso_year, iso_week, status) values ($1, 2026, 37, 'collecting')`,
        [WS_A])
      const r = await db.query<{ n: number }>(
        `select count(*)::int as n from loop_cycles where workspace_id=$1 and iso_week=37`, [WS_A])
      expect(r.rows[0].n).toBe(2)
    })

    it('refuses TWO live cycles for the same week', async () => {
      expect(await raises(() => db.query(
        `insert into loop_cycles (workspace_id, iso_year, iso_week, status) values ($1, 2026, 37, 'collecting')`,
        [WS_A]))).toMatch(/loop_cycles_one_live_per_week|duplicate key/i)
    })
  })
})
