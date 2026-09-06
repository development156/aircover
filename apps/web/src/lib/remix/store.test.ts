import { beforeEach, describe, expect, test, vi } from 'vitest'

import { RemixReadError } from './read-error'

/**
 * TWO CONTRACTS THIS FILE PINS.
 *
 * ── A READ THAT FAILS IS NOT AN EMPTY LIST ───────────────────────────────────
 * `listBatches` and `readDerivatives` ignored the `error` half of the reply and
 * returned `data ?? []`, so a refused query and a workspace with no batches gave
 * the same answer. Each is driven with an error and must THROW, with nothing and
 * must return nothing, with rows and must return the ones that parse.
 *
 * ── createBatch GOES THROUGH THE ATOMIC RPC, NOT TWO INSERTS ──────────────────
 * The batch and its derivatives used to be two separate inserts, so a refused
 * second one orphaned the batch. `createBatch` now calls `remix_create_batch`,
 * whose atomicity is proven on real Postgres in
 * `packages/db/tests/remix_migrations.pglite.test.ts`. Here we hold the seam: the
 * store CALLS THE RPC by name with the right args and issues NO direct insert —
 * without that assertion a green test could sit on top of two inserts still.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'
const BATCH_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({
  /** Reply for a `.rpc(...)` call. */
  rpc: { data: null as unknown, error: null as unknown },
  /** Reply for a select on a given table, keyed by table name. */
  replies: {} as Record<string, { data: unknown; error: unknown }>,
  /** Every `.rpc(name, args)` the code under test issued. */
  rpcCalls: [] as Array<{ name: string; args: unknown }>,
  /** Every table that received a `.insert(...)`. Must stay EMPTY for createBatch. */
  inserts: [] as string[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => {
    let table = ''
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit', 'not', 'update']) {
      chain[m] = () => chain
    }
    chain.from = (t: string) => {
      table = t
      return chain
    }
    chain.insert = () => {
      state.inserts.push(table)
      return chain
    }
    chain.rpc = (name: string, args: unknown) => {
      state.rpcCalls.push({ name, args })
      return Promise.resolve(state.rpc)
    }
    const settle = () => Promise.resolve(state.replies[table] ?? { data: null, error: null })
    chain.single = settle
    chain.maybeSingle = settle
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      settle().then(resolve, reject)
    return chain
  },
}))

import { createBatch, listBatches, readDerivatives } from './store'

const BATCH_ROW = {
  id: BATCH_ID,
  workspace_id: WS_ID,
  source_post_id: null,
  source_title: null,
  source_credit: null,
  status: 'planned',
  approved_credits: null,
  approved_at: null,
  approved_by: null,
  created_by: 'user_abc',
  created_at: '2026-08-21T00:00:00Z',
  updated_at: '2026-08-21T00:00:00Z',
}

const DERIVATIVE_ROW = {
  id: '44444444-4444-4444-8444-444444444444',
  workspace_id: WS_ID,
  batch_id: BATCH_ID,
  kind: 'short',
  channel: 'x',
  format: 'text',
  included: true,
  status: 'pending',
  post_id: null,
  failure: null,
  created_at: '2026-08-21T00:00:00Z',
  updated_at: '2026-08-21T00:00:00Z',
}

beforeEach(() => {
  state.rpc = { data: null, error: null }
  state.replies = {}
  state.rpcCalls = []
  state.inserts = []
})

describe('createBatch', () => {
  const INPUT = {
    workspaceId: WS_ID,
    createdBy: 'user_abc',
    sourcePostId: null,
    sourceTitle: null,
    sourceCredit: null,
    derivatives: [{ kind: 'short', channel: 'x', format: 'text' }] as const,
  }

  test('calls remix_create_batch with the derivatives and issues NO direct insert', async () => {
    state.rpc = { data: BATCH_ID, error: null }
    state.replies = {
      remix_batches: { data: BATCH_ROW, error: null },
      remix_derivatives: { data: [DERIVATIVE_ROW], error: null },
    }

    const created = await createBatch({ ...INPUT })

    expect(created).not.toBeNull()
    expect(created!.batch.id).toBe(BATCH_ID)
    expect(created!.derivatives.map((d) => d.id)).toEqual([DERIVATIVE_ROW.id])

    // The seam: one RPC by name, the derivatives passed through, and no insert.
    expect(state.rpcCalls).toHaveLength(1)
    expect(state.rpcCalls[0]!.name).toBe('remix_create_batch')
    expect(state.rpcCalls[0]!.args).toMatchObject({
      p_workspace_id: WS_ID,
      p_derivatives: [{ kind: 'short', channel: 'x', format: 'text' }],
    })
    expect(state.inserts).toEqual([])
  })

  test('a refused RPC returns null and writes nothing else', async () => {
    state.rpc = { data: null, error: { code: 'P0001', message: 'denied' } }
    const created = await createBatch({ ...INPUT })
    expect(created).toBeNull()
    expect(state.inserts).toEqual([])
  })

  test('a batch that cannot be read back after the RPC returns null', async () => {
    state.rpc = { data: BATCH_ID, error: null }
    state.replies = { remix_batches: { data: null, error: { code: '57014', message: 'x' } } }
    expect(await createBatch({ ...INPUT })).toBeNull()
  })
})

describe('listBatches', () => {
  test('a refused read throws, and names its table', async () => {
    state.replies = { remix_batches: { data: null, error: { code: '57014', message: 'x' } } }
    await expect(listBatches(WS_ID, 1)).rejects.toBeInstanceOf(RemixReadError)
    await expect(listBatches(WS_ID, 1)).rejects.toMatchObject({ table: 'remix_batches' })
  })

  test('a read that returns nothing is an empty list, not an error', async () => {
    state.replies = { remix_batches: { data: [], error: null } }
    await expect(listBatches(WS_ID, 1)).resolves.toEqual([])
  })

  test('rows that parse come back; a row that does not is dropped', async () => {
    state.replies = { remix_batches: { data: [BATCH_ROW, { id: 'junk' }], error: null } }
    const batches = await listBatches(WS_ID, 2)
    expect(batches.map((b) => b.id)).toEqual([BATCH_ID])
  })
})

describe('readDerivatives', () => {
  test('a refused read throws, and names its table', async () => {
    state.replies = { remix_derivatives: { data: null, error: { code: '57014', message: 'x' } } }
    await expect(readDerivatives(BATCH_ID, WS_ID)).rejects.toBeInstanceOf(RemixReadError)
    await expect(readDerivatives(BATCH_ID, WS_ID)).rejects.toMatchObject({
      table: 'remix_derivatives',
    })
  })

  test('a read that returns nothing is an empty list, not an error', async () => {
    state.replies = { remix_derivatives: { data: [], error: null } }
    await expect(readDerivatives(BATCH_ID, WS_ID)).resolves.toEqual([])
  })

  test('rows that parse come back; a row that does not is dropped', async () => {
    state.replies = {
      remix_derivatives: {
        data: [DERIVATIVE_ROW, { ...DERIVATIVE_ROW, id: 'not-a-uuid' }],
        error: null,
      },
    }
    const rows = await readDerivatives(BATCH_ID, WS_ID)
    expect(rows.map((d) => d.id)).toEqual([DERIVATIVE_ROW.id])
  })
})
