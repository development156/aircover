import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `recordRemixLineage`: ONE UPDATE, HONEST ABOUT THE COLUMN THAT MAY NOT EXIST.
 */

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))

const workspaceForWrite = vi.fn()
vi.mock('@/lib/workspaces', () => ({ workspaceForWrite: () => workspaceForWrite() }))

let updateAnswer: { error: unknown } = { error: null }
const eqSpy = vi.fn()
function chain() {
  const b: Record<string, unknown> = {}
  b.update = () => b
  b.eq = (...args: unknown[]) => {
    eqSpy(...args)
    return b
  }
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(updateAnswer).then(res, rej)
  return b
}
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => ({ from: () => chain() }) }))

const { auth } = await import('@clerk/nextjs/server')
const { recordRemixLineage } = await import('./studio-remix')

const WS = '11111111-1111-4111-8111-111111111111'
const CHILD = '22222222-2222-4222-8222-222222222222'
const PARENT = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  vi.clearAllMocks()
  updateAnswer = { error: null }
  vi.mocked(auth).mockResolvedValue({ userId: 'user_1' } as never)
  workspaceForWrite.mockResolvedValue({ ok: true, workspace: { id: WS } })
})

describe('recordRemixLineage', () => {
  it('links the new picture to the one it was remixed from', async () => {
    const state = await recordRemixLineage(CHILD, PARENT)
    expect(state).toEqual({ ok: true })
    expect(eqSpy).toHaveBeenCalledWith('id', CHILD)
    expect(eqSpy).toHaveBeenCalledWith('workspace_id', WS)
  })

  it('42703: the column is not reachable, and it says so rather than pretending success', async () => {
    updateAnswer = { error: { code: '42703' } }
    const state = await recordRemixLineage(CHILD, PARENT)
    expect(state.ok).toBe(false)
    if (state.ok) return
    expect(state.message).toMatch(/cannot yet record/i)
  })

  it('a malformed id links nothing', async () => {
    const state = await recordRemixLineage('not-a-uuid', PARENT)
    // RETARGETED: a bare `.ok` check passes identically whether the zod parse
    // correctly refused before touching the database, or `recordRemixLineage`
    // threw somewhere else entirely and the outer catch produced a DIFFERENT
    // generic message. Assert the specific "could not tell which pictures"
    // sentence, and that the update never ran.
    expect(state).toEqual({ ok: false, message: 'Sahoda could not tell which pictures to link.' })
    expect(eqSpy).not.toHaveBeenCalled()
  })

  it('signed out: refused before any write', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never)
    const state = await recordRemixLineage(CHILD, PARENT)
    expect(state.ok).toBe(false)
    expect(eqSpy).not.toHaveBeenCalled()
  })
})
