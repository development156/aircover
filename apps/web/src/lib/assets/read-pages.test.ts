import { beforeEach, describe, expect, test, vi } from 'vitest'

import { fakeSupabase, freshState } from '@/lib/assets/fake-supabase.test-helper'

/**
 * The reads behind "Show older photos", the server search and the batched
 * trash. What is pinned is the QUESTION each one asks the database: the keyset
 * it seeks on, the pattern it quotes, the batch size it stops at. A fake cannot
 * evaluate a filter, so the assertion is on the filter, which is the part a
 * wrong edit would change.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'

const state = vi.hoisted(() => ({ supabase: null as unknown }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/workspaces', () => ({
  activeWorkspaceRead: () =>
    Promise.resolve({ status: 'ok', workspace: { id: WORKSPACE, name: 'W', slug: 'w' } }),
}))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => state.supabase }))

const { ASSET_LIST_LIMIT, TRASH_BATCH, readOlderAssets, readTrashedBatch, searchAssetsByText } =
  await import('./read')

let fake = freshState()

beforeEach(() => {
  fake = freshState()
  state.supabase = fakeSupabase(fake)
})

const orArgs = (table: string) =>
  fake.calls.filter((c) => c.table === table && c.method === 'or').map((c) => c.args[0])
const limitArgs = (table: string) =>
  fake.calls.filter((c) => c.table === table && c.method === 'limit').map((c) => c.args[0])

describe('readOlderAssets', () => {
  test('seeks on (created_at, id), so a shared timestamp neither skips nor repeats a row', async () => {
    const result = await readOlderAssets({ createdAt: '2026-09-01T00:00:00.000Z', id: 'abc' })

    expect(result.status).toBe('ok')
    expect(orArgs('assets')).toEqual([
      'created_at.lt.2026-09-01T00:00:00.000Z,and(created_at.eq.2026-09-01T00:00:00.000Z,id.lt.abc)',
    ])
    expect(limitArgs('assets')).toEqual([ASSET_LIST_LIMIT])
  })

  test('says it is capped only when a full page came back', async () => {
    fake.answers.assets = [{ data: [] }]
    const short = await readOlderAssets({ createdAt: '2026-09-01T00:00:00.000Z', id: 'abc' })
    expect(short.status === 'ok' && short.capped).toBe(false)
  })
})

describe('searchAssetsByText', () => {
  test('matches the name OR the description, quoted so a comma is a character', async () => {
    await searchAssetsByText('menu, board')

    expect(orArgs('assets')).toEqual(['title.ilike."%menu, board%",alt.ilike."%menu, board%"'])
  })

  test('escapes a double quote inside the words rather than breaking the grammar', async () => {
    await searchAssetsByText('say "hi"')

    expect(orArgs('assets')).toEqual(['title.ilike."%say \\"hi\\"%",alt.ilike."%say \\"hi\\"%"'])
  })

  test('an empty question asks nothing', async () => {
    const result = await searchAssetsByText('   ')

    expect(result).toEqual({ status: 'ok', assets: [], capped: false })
    expect(fake.calls).toEqual([])
  })
})

describe('readTrashedBatch', () => {
  test('reads TRASH_BATCH rows from the top when there is no cursor', async () => {
    fake.answers.assets = [{ data: [{ id: 'a', deleted_at: '2026-09-02T00:00:00.000Z' }] }]

    const result = await readTrashedBatch(null)

    expect(result).toEqual({
      status: 'ok',
      rows: [{ id: 'a', deletedAt: '2026-09-02T00:00:00.000Z' }],
      more: false,
    })
    expect(orArgs('assets')).toEqual([])
    expect(limitArgs('assets')).toEqual([TRASH_BATCH])
  })

  test('seeks past the cursor on (deleted_at, id), which a bulk trash shares', async () => {
    await readTrashedBatch({ deletedAt: '2026-09-02T00:00:00.000Z', id: 'k' })

    expect(orArgs('assets')).toEqual([
      'deleted_at.lt.2026-09-02T00:00:00.000Z,and(deleted_at.eq.2026-09-02T00:00:00.000Z,id.lt.k)',
    ])
  })

  test('a full batch says there may be more', async () => {
    fake.answers.assets = [
      {
        data: Array.from({ length: TRASH_BATCH }, (_, i) => ({
          id: `a${i}`,
          deleted_at: '2026-09-02T00:00:00.000Z',
        })),
      },
    ]

    const result = await readTrashedBatch(null)

    expect(result.status === 'ok' && result.more).toBe(true)
  })
})
