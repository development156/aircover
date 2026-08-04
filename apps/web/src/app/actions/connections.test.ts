import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `disconnectConnection` deletes the row (the sealed tokens cascade with it).
 * Pinned: zero matched rows is a refusal (PostgREST returns no error for an
 * empty delete — the deletePost lesson), and the delete is workspace-scoped.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'
const CONN_ID = '88888888-8888-4888-8888-888888888888'

const state = vi.hoisted(() => ({
  userId: 'user_abc' as string | null,
  result: { data: null as { id: string } | null, error: null as { code: string } | null },
  calls: { eq: [] as Array<[string, string]>, select: [] as string[] },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: state.userId }),
}))

vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve({ id: WS_ID }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      delete: () => {
        const chain = {
          eq: (col: string, val: string) => {
            state.calls.eq.push([col, val])
            return chain
          },
          select: (columns: string) => {
            state.calls.select.push(columns)
            return { maybeSingle: () => Promise.resolve(state.result) }
          },
        }
        return chain
      },
    }),
  }),
}))

const { disconnectConnection } = await import('./connections')

beforeEach(() => {
  state.userId = 'user_abc'
  state.result = { data: null, error: null }
  state.calls = { eq: [], select: [] }
})

describe('disconnectConnection', () => {
  test('reports success only when a row actually came back', async () => {
    state.result = { data: { id: CONN_ID }, error: null }

    await expect(disconnectConnection(CONN_ID)).resolves.toEqual({ ok: true })
    expect(state.calls.select).toEqual(['id'])
  })

  test('scopes the delete to the active workspace', async () => {
    state.result = { data: { id: CONN_ID }, error: null }

    await disconnectConnection(CONN_ID)

    expect(state.calls.eq).toEqual(
      expect.arrayContaining([
        ['id', CONN_ID],
        ['workspace_id', WS_ID],
      ]),
    )
  })

  test('zero matched rows is a refusal, not a success', async () => {
    state.result = { data: null, error: null }

    const result = await disconnectConnection(CONN_ID)

    expect(result.ok).toBe(false)
  })

  test('a database error is a refusal', async () => {
    state.result = { data: null, error: { code: '42501' } }

    await expect(disconnectConnection(CONN_ID)).resolves.toMatchObject({ ok: false })
  })

  test('signed out cannot disconnect', async () => {
    state.userId = null

    const result = await disconnectConnection(CONN_ID)

    expect(result.ok).toBe(false)
    expect(state.calls.eq).toHaveLength(0)
  })
})
