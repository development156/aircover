import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `deleteAsset` is the PERMANENT delete, and it only works from the trash.
 *
 * MEASURED 2026-09-06 on the preview: "Delete file" in the detail drawer of an
 * unused LIVE file removed it for good in one press; the trash stayed at 0.
 * `file-menu-body.tsx` had already moved the permanent delete "into the trash
 * where the act really is final", but the action itself never checked, so any
 * caller that still reached it could skip the trash entirely.
 *
 * The guard is in the action, not the button: a button can be re-wired, and the
 * only place that can refuse every caller at once is the one they all share.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const ASSET_ID = '33333333-3333-4333-8333-333333333333'

const state = vi.hoisted(() => ({
  deletedAt: null as string | null,
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve({ id: WORKSPACE }),
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: WORKSPACE } }),
}))
vi.mock('@/lib/assets/read', () => ({
  readAsset: (id: string) =>
    Promise.resolve({
      status: 'ok',
      asset: { asset: { id, deleted_at: state.deletedAt }, usage: [] },
    }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args })
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

const { deleteAsset } = await import('./assets')

beforeEach(() => {
  state.deletedAt = null
  state.rpcCalls = []
})

describe('deleteAsset only works from the trash', () => {
  test('a LIVE file is refused, and the delete RPC is never called', async () => {
    state.deletedAt = null

    const result = await deleteAsset(ASSET_ID, false)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('refused')
    expect(result.message).toMatch(/trash/i)
    expect(state.rpcCalls).toEqual([])
  })

  test('the refusal survives `confirmed = true` — confirmation is not a bypass', async () => {
    state.deletedAt = null

    const result = await deleteAsset(ASSET_ID, true)

    expect(result.ok).toBe(false)
    expect(state.rpcCalls).toEqual([])
  })

  test('a TRASHED file goes through', async () => {
    state.deletedAt = '2026-09-01T00:00:00.000Z'

    const result = await deleteAsset(ASSET_ID, false)

    expect(result).toEqual({ ok: true })
    expect(state.rpcCalls.map((call) => call.fn)).toEqual(['delete_asset'])
  })
})

/**
 * The database's own refusals, surfaced rather than replaced.
 *
 * `delete_asset` re-checks the gate inside a transaction with the posts locked,
 * so the answer the SCREEN read a moment ago can be stale by the time the row
 * is touched. Each code the RPC can raise is a different sentence, and every
 * one leaves the row where it was.
 */
describe('deleteAsset surfaces the database’s refusal', () => {
  const rpcError = vi.hoisted(() => ({ current: null as { code: string; message: string } | null }))

  beforeEach(() => {
    state.deletedAt = '2026-09-01T00:00:00.000Z'
    rpcError.current = null
  })

  async function withRpcError(code: string, message: string) {
    const supabase = await import('@/lib/supabase/server')
    vi.spyOn(supabase, 'createServerSupabase').mockReturnValue({
      rpc: () => Promise.resolve({ data: null, error: { code, message } }),
      storage: {
        from: () => ({
          remove: () => Promise.resolve({ error: null }),
          list: () => Promise.resolve({ data: [], error: null }),
        }),
      },
    } as never)
  }

  test('23001 (the guard trigger) is a refusal carrying the trigger’s own sentence', async () => {
    await withRpcError('23001', 'Diwali offer is scheduled to go out and cannot lose it.')

    const result = await deleteAsset(ASSET_ID, false)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('refused')
    expect(result.message).toContain('Diwali offer')
  })

  test('23503 (an attachment the caller did not consent to detach) is a refusal naming the post', async () => {
    await withRpcError('23503', 'violates foreign key')

    const result = await deleteAsset(ASSET_ID, false)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('refused')
    expect(result.message).toMatch(/still on a post/i)
  })

  test('02000 (no such row) is a failure that says the file is not in the library', async () => {
    await withRpcError('02000', 'no data')

    const result = await deleteAsset(ASSET_ID, false)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('failed')
    expect(result.message).toMatch(/not in your library/i)
  })
})
