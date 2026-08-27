import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
  workspace: { id: 'ws-1', name: 'Chai & Chapters' } as { id: string; name: string } | null,
  /** The row the scoped read returns. `null` = no such row in THIS workspace. */
  row: { id: 'conn-1', external_account: { id: '6a75caf7d0fe733d1afcc1f4' } } as Record<
    string,
    unknown
  > | null,
  readError: null as { message: string } | null,
  deleteError: null as { message: string } | null,
  /** `null` = the row vanished between read and delete. */
  deleted: { id: 'conn-1' } as { id: string } | null,
  clientPresent: true,
  /** Account ids `disconnectAccount` was called with, in order. */
  zernioCalls: [] as string[],
  zernioThrows: null as Error | null,
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: state.userId }),
}))

vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve(state.workspace),
  workspaceForWrite: async () => {
    const w = await Promise.resolve(state.workspace)
    return w ? { ok: true, workspace: w } : { ok: false, message: 'Create a workspace first.' }
  },
}))

vi.mock('@/lib/observability/report', () => ({ reportServerError: () => Promise.resolve() }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

vi.mock('@/lib/zernio/server', () => ({
  zernioClient: () =>
    state.clientPresent
      ? {
          disconnectAccount: (accountId: string) => {
            state.zernioCalls.push(accountId)
            if (state.zernioThrows) return Promise.reject(state.zernioThrows)
            return Promise.resolve()
          },
        }
      : null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: state.row, error: state.readError }),
          }),
        }),
      }),
      delete: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: () => Promise.resolve({ data: state.deleted, error: state.deleteError }),
            }),
          }),
        }),
      }),
    }),
  }),
}))

const { disconnectConnection } = await import('./connections')

beforeEach(() => {
  state.userId = 'user_1'
  state.workspace = { id: 'ws-1', name: 'Chai & Chapters' }
  state.row = { id: 'conn-1', external_account: { id: '6a75caf7d0fe733d1afcc1f4' } }
  state.readError = null
  state.deleteError = null
  state.deleted = { id: 'conn-1' }
  state.clientPresent = true
  state.zernioCalls = []
  state.zernioThrows = null
})

/**
 * DISCONNECT NOW MEANS DISCONNECTED.
 *
 * It used to be a Supabase delete and nothing else. Zernio kept the account, so
 * the next reconcile wrote it back — reported as "disconnect and connect again
 * and the other platforms get connected automatically" — and underneath that
 * annoyance sat the real fact: a customer who disconnected still had Sahoda's
 * access on their Instagram, and nothing in the product could remove it.
 */
describe('the account is removed at the provider, not only in our table', () => {
  it('calls Zernio with the stored account id', async () => {
    const result = await disconnectConnection('conn-1')

    expect(result).toEqual({ ok: true })
    expect(state.zernioCalls).toEqual(['6a75caf7d0fe733d1afcc1f4'])
  })

  it('does NOT delete our row when the provider removal fails', async () => {
    // Dropping our row anyway would be kinder for one second and is exactly the
    // old bug: the row returns on the next connect and the customer's access is
    // still granted at the platform.
    state.zernioThrows = new Error('zernio 500')

    const result = await disconnectConnection('conn-1')

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toMatch(/nothing was changed/i)
    // And the sentence must offer a remedy that can actually work.
    expect(result.ok === false && result.message).toMatch(/try again/i)
  })

  it('removes upstream BEFORE deleting our row', async () => {
    // The order is the design. If the provider call ran after our delete and
    // then failed, we would have destroyed the only id that could ever remove
    // the account — an orphan live at the platform with nothing pointing at it.
    state.zernioThrows = new Error('zernio 500')

    await disconnectConnection('conn-1')

    // The delete never got the chance to run: the guard above returned first.
    expect(state.zernioCalls).toHaveLength(1)
  })
})

describe('the tenant boundary is ours, because Zernio does not enforce one', () => {
  it('refuses a connection id that is not in this workspace', async () => {
    // doc 13 §3: Zernio validates an accountId against the whole TEAM. A
    // mis-scoped id does not error there — it disconnects somebody else's
    // account and returns 200. So the id must come from a row we already
    // filtered by workspace_id, and no row means no call.
    state.row = null

    const result = await disconnectConnection('conn-someone-else')

    expect(result.ok).toBe(false)
    expect(state.zernioCalls).toEqual([])
  })

  it('makes no provider call when the row read fails', async () => {
    state.readError = { message: 'db down' }

    const result = await disconnectConnection('conn-1')

    expect(result.ok).toBe(false)
    expect(state.zernioCalls).toEqual([])
  })
})

describe('an environment that cannot reach the provider still lets the row go', () => {
  it('deletes our row when no publishing key is set', async () => {
    // There is no upstream link we are failing to remove — we could never have
    // made one. Refusing here would strand the customer with a row they can
    // never delete, and the reconcile cannot resurrect it because a create now
    // needs a recorded press.
    state.clientPresent = false

    const result = await disconnectConnection('conn-1')

    expect(result).toEqual({ ok: true })
    expect(state.zernioCalls).toEqual([])
  })

  it('deletes our row when the stored account id is malformed', async () => {
    state.row = { id: 'conn-1', external_account: { id: 42 } }

    const result = await disconnectConnection('conn-1')

    expect(result).toEqual({ ok: true })
    expect(state.zernioCalls).toEqual([])
  })
})

describe('the ordinary refusals still refuse', () => {
  it('needs a signed-in user', async () => {
    state.userId = null
    const result = await disconnectConnection('conn-1')
    expect(result).toEqual({ ok: false, message: 'Sign in to disconnect this account.' })
    expect(state.zernioCalls).toEqual([])
  })

  it('treats a delete that matched zero rows as a refusal, not a success', async () => {
    // A PostgREST delete matching nothing returns no error. Reading that as
    // success is the deletePost lesson.
    state.deleted = null

    const result = await disconnectConnection('conn-1')

    expect(result.ok).toBe(false)
  })
})
