import { beforeEach, describe, expect, test, vi } from 'vitest'

import { RemixReadError } from './read-error'

/**
 * A READ THAT FAILS IS NOT AN EMPTY LIST.
 *
 * The defect this pins: `listBatches` and `readDerivatives` ignored the
 * `error` half of the supabase reply and returned `data ?? []`, so a refused
 * query and a workspace with no batches produced the same answer. Each read
 * below is driven with an error and must THROW, driven with nothing and must
 * return nothing, and driven with rows and must return the ones that parse.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'
const BATCH_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({
  reply: { data: null as unknown, error: null as unknown },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => {
    // Every builder method returns the same thenable, so any chain the store
    // writes resolves to `state.reply` when awaited.
    const chain: Record<string, unknown> = {}
    for (const m of ['from', 'select', 'eq', 'order', 'limit', 'not', 'update', 'insert']) {
      chain[m] = () => chain
    }
    chain.maybeSingle = () => Promise.resolve(state.reply)
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(state.reply).then(resolve, reject)
    return chain
  },
}))

import { listBatches, readDerivatives } from './store'

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
  state.reply = { data: null, error: null }
})

describe('listBatches', () => {
  test('a refused read throws, and names its table', async () => {
    state.reply = { data: null, error: { code: '57014', message: 'canceling statement' } }
    await expect(listBatches(WS_ID, 1)).rejects.toBeInstanceOf(RemixReadError)
    await expect(listBatches(WS_ID, 1)).rejects.toMatchObject({ table: 'remix_batches' })
  })

  test('a read that returns nothing is an empty list, not an error', async () => {
    state.reply = { data: [], error: null }
    await expect(listBatches(WS_ID, 1)).resolves.toEqual([])
  })

  test('rows that parse come back; a row that does not is dropped', async () => {
    state.reply = { data: [BATCH_ROW, { id: 'junk' }], error: null }
    const batches = await listBatches(WS_ID, 2)
    expect(batches.map((b) => b.id)).toEqual([BATCH_ID])
  })
})

describe('readDerivatives', () => {
  test('a refused read throws, and names its table', async () => {
    state.reply = { data: null, error: { code: '57014', message: 'canceling statement' } }
    await expect(readDerivatives(BATCH_ID, WS_ID)).rejects.toBeInstanceOf(RemixReadError)
    await expect(readDerivatives(BATCH_ID, WS_ID)).rejects.toMatchObject({
      table: 'remix_derivatives',
    })
  })

  test('a read that returns nothing is an empty list, not an error', async () => {
    state.reply = { data: [], error: null }
    await expect(readDerivatives(BATCH_ID, WS_ID)).resolves.toEqual([])
  })

  test('rows that parse come back; a row that does not is dropped', async () => {
    state.reply = { data: [DERIVATIVE_ROW, { ...DERIVATIVE_ROW, id: 'not-a-uuid' }], error: null }
    const rows = await readDerivatives(BATCH_ID, WS_ID)
    expect(rows.map((d) => d.id)).toEqual([DERIVATIVE_ROW.id])
  })
})
