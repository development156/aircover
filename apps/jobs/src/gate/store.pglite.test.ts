import { PGlite } from '@electric-sql/pglite'
import type { Pool } from 'pg'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { createGateStore } from './store'

/**
 * The gate's two statements, EXECUTED against a real Postgres.
 *
 * ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────
 * Every other gate test injects `loadGateContext` and `writeGateAudit` as
 * functions, which is right for testing the layers and proves nothing about the
 * SQL underneath them. `lease.pglite.test.ts` states the reason next door: the
 * claim predicate "was right-looking the whole time it was wrong".
 *
 * ── AND THE FAILURE HERE IS THE SILENT ONE ───────────────────────────────────
 * A subtly wrong lateral join — the correlation misplaced, the `status` filter
 * wrong — does not error. It returns no row, which `loadGateContext` reports as
 * `brandVersion: null, payload: null`, and `createPublishGate` treats that as a
 * legitimate workspace that has written no red lines. The floor pack still
 * applies, so posts still get gated and nothing looks broken; the OWNER tier
 * just quietly never fires. `gate.test.ts` has a passing test asserting that
 * exact shape is valid, so nothing in the suite would notice.
 *
 * The columns below are the ones these two statements touch and nothing else.
 * Schema drift against the real DDL is still the live suite's job.
 */

const DDL = `
  create table posts (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null
  );
  create table brand_memory (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    version int not null,
    status text not null,
    payload jsonb not null
  );
  create table audit_logs (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null,
    actor text not null,
    action text not null,
    target jsonb,
    meta jsonb,
    trace_id text,
    created_at timestamptz not null default now()
  );
`

const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '99999999-9999-4999-8999-999999999999'
const POST = '22222222-2222-4222-8222-222222222222'

function poolOver(db: PGlite): Pool {
  return {
    query: async (text: string, params?: unknown[]) => {
      const r = await db.query(text, params as unknown[])
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
    },
  } as unknown as Pool
}

describe('the gate store (real Postgres, in-process)', () => {
  let db: PGlite
  let store: ReturnType<typeof createGateStore>

  const insertBrain = (
    workspaceId: string,
    version: number,
    status: string,
    payload: unknown,
  ): Promise<unknown> =>
    db.query(
      'insert into brand_memory (workspace_id, version, status, payload) values ($1,$2,$3,$4)',
      [workspaceId, version, status, JSON.stringify(payload)],
    )

  beforeEach(async () => {
    db = new PGlite()
    await db.exec(DDL)
    await db.query('insert into posts (id, workspace_id) values ($1, $2)', [POST, WS])
    store = createGateStore({ pool: poolOver(db) })
  })

  afterEach(async () => {
    await db.close()
  })

  describe('loadGateContext', () => {
    it('returns the ACTIVE brain, not the superseded one it replaced', async () => {
      await insertBrain(WS, 1, 'superseded', { taboo: { red_lines: ['old rule'] } })
      await insertBrain(WS, 2, 'active', { taboo: { red_lines: ['current rule'] } })

      const context = await store.loadGateContext(POST)

      expect(context).toMatchObject({
        workspaceId: WS,
        brandVersion: 2,
        payload: { taboo: { red_lines: ['current rule'] } },
      })
    })

    it('ignores a draft — nobody agreed to it', async () => {
      await insertBrain(WS, 1, 'draft', { taboo: { red_lines: ['not agreed'] } })

      const context = await store.loadGateContext(POST)

      // Null, not the draft. A rule someone was still writing is not a rule they
      // are held to, and gating against it would refuse posts on an unsaved edit.
      expect(context).toMatchObject({ workspaceId: WS, brandVersion: null, payload: null })
    })

    it('derives the workspace from the POST, so another tenant’s brain is unreachable', async () => {
      // The reason the join starts at `posts`: the payload's workspaceId crosses
      // a queue and nothing re-checks it. A brain belonging to someone else must
      // not be selectable no matter what the caller passes, and the caller here
      // passes nothing but a post id.
      await insertBrain(OTHER_WS, 1, 'active', { taboo: { red_lines: ['their rule'] } })

      const context = await store.loadGateContext(POST)

      expect(context).toMatchObject({ workspaceId: WS, brandVersion: null, payload: null })
    })

    it('still returns a context for a workspace that has no brain at all', async () => {
      // A new workspace. NOT null — null means "no post", which holds. This must
      // reach the floor pack instead.
      expect(await store.loadGateContext(POST)).toEqual({
        workspaceId: WS,
        brandVersion: null,
        payload: null,
      })
    })

    it('returns null for a post that does not exist', async () => {
      expect(await store.loadGateContext('33333333-3333-4333-8333-333333333333')).toBeNull()
    })

    it('takes the highest active version when more than one is active', async () => {
      // `brand_memory` is unique on (workspace_id, version) but nothing in the
      // schema enforces a single active row, so the order-by is load-bearing
      // rather than decorative.
      await insertBrain(WS, 5, 'active', { taboo: { red_lines: ['five'] } })
      await insertBrain(WS, 6, 'active', { taboo: { red_lines: ['six'] } })

      expect((await store.loadGateContext(POST))?.brandVersion).toBe(6)
    })
  })

  describe('writeGateAudit', () => {
    it('inserts the row a later auditor reads', async () => {
      await store.writeGateAudit({
        workspaceId: WS,
        actor: 'web:run-1',
        action: 'publish_gate.pass',
        target: { postId: POST, variantId: 'v1', channel: 'x' },
        meta: { ruleSetVersion: 'regime-_floor@2026.08', approver: null },
        traceId: 'web:run-1',
      })

      const r = await db.query<{
        workspace_id: string
        actor: string
        action: string
        target: unknown
        meta: unknown
        trace_id: string
      }>('select workspace_id, actor, action, target, meta, trace_id from audit_logs')

      expect(r.rows).toHaveLength(1)
      expect(r.rows[0]).toMatchObject({
        workspace_id: WS,
        actor: 'web:run-1',
        action: 'publish_gate.pass',
        target: { postId: POST, variantId: 'v1', channel: 'x' },
        meta: { ruleSetVersion: 'regime-_floor@2026.08', approver: null },
        trace_id: 'web:run-1',
      })
    })

    it('round-trips a whole verdict through jsonb without losing a field', async () => {
      // `meta` is the audit record. A field that serialises to nothing here is a
      // question nobody can answer later, and the shape is nested enough that
      // "it is jsonb, it will be fine" is worth executing once.
      const meta = {
        ruleSetVersion: 'regime-_floor@2026.08+regime-healthcare@2026.08',
        packs: [{ id: 'regime-healthcare', version: '2026.08' }],
        regime: { value: 'healthcare', locale: 'IN', basis: 'declared' },
        brandVersion: 4,
        checks: { hard: 'ran', classifier: 'ran' },
        findings: [{ ruleId: 'health.no-cure-claim', tier: 'mandated', quote: 'cure' }],
        approver: null,
      }

      await store.writeGateAudit({
        workspaceId: WS,
        actor: 'cron:post-1',
        action: 'publish_gate.block',
        target: { postId: POST, variantId: 'v1', channel: 'instagram' },
        meta,
        traceId: 'cron:post-1',
      })

      const r = await db.query<{ meta: unknown }>('select meta from audit_logs')
      expect(r.rows[0]?.meta).toEqual(meta)
    })
  })
})
