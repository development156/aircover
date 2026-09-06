import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `emptyTrash` — in batches, with a cursor, and honest about what it reached.
 *
 * ── THE DEFECT THIS FILE WAS FIRST WRITTEN FOR ───────────────────────────────
 * One pass read at most 200 rows and dropped the read's `capped` on the floor,
 * so a person with 500 files in the trash pressed once, lost 200, and read
 * "Deleted 200 files for good." with no mention of the 300 still sitting there.
 *
 * ── AND THE ONE IT GREW INTO ─────────────────────────────────────────────────
 * Two hundred locked transactions plus two storage sweeps each, inside ONE
 * server action, with nothing reported until the end. The pass now deletes
 * `TRASH_BATCH` rows, says what it did, and hands back where it stopped; the
 * client loops. `more` and `cursor` are the READ's answers, never a guess from
 * the count, and a file the gate KEEPS still advances the cursor so the next
 * pass does not meet it and refuse it again.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'

const state = vi.hoisted(() => ({
  /** What `readTrashedBatch` hands back, and what it was asked. */
  batch: {
    status: 'ok' as 'ok' | 'unreadable' | 'no-workspace',
    rows: [] as { id: string; deletedAt: string }[],
    more: false,
  },
  asked: [] as unknown[],
  /** Ids the gate refuses (a scheduled post uses them). */
  locked: new Set<string>(),
  /** Every asset id the delete RPC was actually asked to remove. */
  deleted: [] as string[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: WORKSPACE } }),
}))
vi.mock('@/lib/assets/read', () => ({
  readTrashedBatch: (after: unknown) => {
    state.asked.push(after)
    return Promise.resolve(state.batch)
  },
  readAsset: (id: string) =>
    Promise.resolve({
      status: 'ok',
      asset: {
        asset: { id, deleted_at: '2026-09-01T00:00:00.000Z' },
        usage: state.locked.has(id)
          ? [{ postId: 'p1', postTitle: 'Diwali', postStatus: 'scheduled', variantStatuses: [] }]
          : [],
        thumbPath: null,
      },
    }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    rpc: (_fn: string, args: { p_asset_id: string }) => {
      state.deleted.push(args.p_asset_id)
      // `null` storage path: the row went, there are no bytes to chase.
      return Promise.resolve({ data: null, error: null })
    },
    storage: {
      from: () => ({
        remove: () => Promise.resolve({ error: null }),
        list: () => Promise.resolve({ data: [], error: null }),
      }),
    },
  }),
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))

const { emptyTrash } = await import('./assets')

const rows = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({
    id: `asset-${from + i}`,
    deletedAt: `2026-09-0${1 + ((from + i) % 9)}T00:00:00.000Z`,
  }))

beforeEach(() => {
  state.batch = { status: 'ok', rows: rows(3), more: false }
  state.asked = []
  state.locked = new Set()
  state.deleted = []
})

describe('emptyTrash reports what it could not reach', () => {
  test('a trash that fitted in one batch says nothing extra', async () => {
    const result = await emptyTrash()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result).toMatchObject({ deleted: 3, kept: 0, more: false })
    expect(state.deleted).toHaveLength(3)
  })

  test('a fuller trash carries `more` out of the action, with where it stopped', async () => {
    state.batch = { status: 'ok', rows: rows(20), more: true }

    const result = await emptyTrash()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.deleted).toBe(20)
    expect(result.more).toBe(true)
    // The cursor is the LAST row of the batch, so the next pass starts after it.
    expect(result.cursor).toEqual(rows(20)[19])
  })

  test('the flag is the READ’s answer, not a count the action guessed', async () => {
    state.batch = { status: 'ok', rows: rows(20), more: false }

    const result = await emptyTrash()

    expect(result.ok && result.more).toBe(false)
  })

  test('the cursor it was given is passed to the read, so a second pass carries on', async () => {
    const cursor = { deletedAt: '2026-09-03T00:00:00.000Z', id: 'asset-19' }

    await emptyTrash(cursor)

    expect(state.asked).toEqual([cursor])
  })

  test('a KEPT file still advances the cursor, so the next pass does not meet it again', async () => {
    state.batch = { status: 'ok', rows: rows(2), more: false }
    state.locked = new Set(['asset-1'])

    const result = await emptyTrash()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result).toMatchObject({ deleted: 1, kept: 1 })
    expect(result.cursor).toEqual({ id: 'asset-1', deletedAt: rows(2)[1]?.deletedAt })
    expect(state.deleted).toEqual(['asset-0'])
  })

  /**
   * An unreadable trash is not an empty one. Deleting nothing and reporting
   * success would tell a person their trash is clear when it may be full, which
   * is the same claim this file exists to stop, arriving by a different door.
   */
  test('a trash that could not be read is a refusal, not a quiet success', async () => {
    state.batch = { status: 'unreadable', rows: [], more: false }

    const result = await emptyTrash()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/could not read/i)
    expect(state.deleted).toHaveLength(0)
  })
})
