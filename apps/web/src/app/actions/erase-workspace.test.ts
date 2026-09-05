import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/workspaces', () => ({ getActiveWorkspace: vi.fn() }))
vi.mock('@/lib/workspace-role', () => ({ getWorkspaceRole: vi.fn() }))
vi.mock('@/lib/privacy/storage', () => ({ sweepWorkspaceStorage: vi.fn() }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { reportServerError } from '@/lib/observability/report'
import { sweepWorkspaceStorage } from '@/lib/privacy/storage'
import { createServerSupabase } from '@/lib/supabase/server'
import { getWorkspaceRole } from '@/lib/workspace-role'
import { getActiveWorkspace } from '@/lib/workspaces'
import { eraseWorkspaceData } from './erase-workspace'

/**
 * THE ORDER IS THE WHOLE DEFECT.
 *
 * The storage sweep is irreversible and runs on the RLS client, whose delete
 * policy admits ANY member of the workspace. The owner check lived only inside
 * `erase_workspace`, which runs AFTER the sweep. So an editor who reached this
 * action wiped every file, was refused by the RPC, and was then told "Nothing
 * was deleted." The role is now read before anything is removed, and the
 * sentence that says nothing was deleted is only ever said when that is true.
 *
 * The sweep and the RPC are mocked: this file proves the action's own ordering
 * and its own sentences. What the RPC refuses is `dpdp_erasure.sql`'s to prove.
 */

const WORKSPACE = { id: '5c1d81a6-d77b-48d5-a57a-a4a6d057cf5b', name: 'Chai & Chapters' }
const OWNER_SENTENCE = 'Only the owner of this workspace can delete it. Nothing was deleted.'

const rpc = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ userId: 'user_1' } as never)
  vi.mocked(getActiveWorkspace).mockResolvedValue(WORKSPACE as never)
  vi.mocked(getWorkspaceRole).mockResolvedValue('owner')
  vi.mocked(sweepWorkspaceStorage).mockResolvedValue({ removed: 3, failed: [], leftUnread: [] })
  rpc.mockResolvedValue({ data: { rowsRemoved: 12, retained: [] }, error: null })
  vi.mocked(createServerSupabase).mockReturnValue({ rpc } as never)
})

describe('who may erase, decided before anything is removed', () => {
  it.each(['editor', 'approver', 'viewer'] as const)(
    'refuses a %s with the owner sentence and never touches storage',
    async (role) => {
      vi.mocked(getWorkspaceRole).mockResolvedValue(role)

      const result = await eraseWorkspaceData(WORKSPACE.name)

      // MUTATION WITNESS. Move the role read below the sweep and the sweep runs
      // for a caller the RPC is about to refuse: every file gone, and a sentence
      // saying nothing was.
      expect(sweepWorkspaceStorage).not.toHaveBeenCalled()
      expect(rpc).not.toHaveBeenCalled()
      expect(result).toEqual({ ok: false, message: OWNER_SENTENCE })
    },
  )

  it('refuses when the role cannot be established, without claiming who the caller is', async () => {
    // `getWorkspaceRole` is null on ANY doubt: no row, an unreadable row, a role
    // the schema does not know. That is not "you are not the owner", it is "we
    // could not tell", and the two get different sentences.
    vi.mocked(getWorkspaceRole).mockResolvedValue(null)

    const result = await eraseWorkspaceData(WORKSPACE.name)

    expect(sweepWorkspaceStorage).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/could not confirm/i)
    expect(result.message).toMatch(/nothing was deleted/i)
    expect(result.message).not.toBe(OWNER_SENTENCE)
  })

  it('reads the role of the workspace the session resolved, not one the caller named', async () => {
    await eraseWorkspaceData(WORKSPACE.name)
    expect(getWorkspaceRole).toHaveBeenCalledWith(WORKSPACE.id)
  })

  it('lets the owner through: the sweep runs, and only then the database', async () => {
    const result = await eraseWorkspaceData(WORKSPACE.name)

    expect(sweepWorkspaceStorage).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledTimes(1)
    // Storage first, database second. See the header of the action for why.
    const sweepOrder = vi.mocked(sweepWorkspaceStorage).mock.invocationCallOrder[0] ?? Infinity
    const rpcOrder = rpc.mock.invocationCallOrder[0] ?? -Infinity
    expect(sweepOrder).toBeLessThan(rpcOrder)
    expect(result).toEqual({ ok: true, rowsRemoved: 12, filesRemoved: 3, retained: [] })
  })

  it('checks the typed name before it reads the role', async () => {
    // A wrong name is the cheaper refusal and needs no database read at all.
    const result = await eraseWorkspaceData('some other name')

    expect(getWorkspaceRole).not.toHaveBeenCalled()
    expect(sweepWorkspaceStorage).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      message: 'The name did not match, so nothing was deleted.',
    })
  })
})

describe('"nothing was deleted" is only said when it is true', () => {
  it('says so when the RPC refuses and the sweep had removed nothing', async () => {
    vi.mocked(sweepWorkspaceStorage).mockResolvedValue({ removed: 0, failed: [], leftUnread: [] })
    rpc.mockResolvedValue({ data: null, error: { message: 'ERASURE_NOT_OWNER' } })

    const result = await eraseWorkspaceData(WORKSPACE.name)

    expect(result).toEqual({ ok: false, message: OWNER_SENTENCE })
  })

  it('counts the files that were already removed when the RPC refuses after the sweep', async () => {
    // The race the role read cannot close: ownership changes between the read
    // and the RPC. Files are gone by then, and the sentence has to say so.
    vi.mocked(sweepWorkspaceStorage).mockResolvedValue({ removed: 3, failed: [], leftUnread: [] })
    rpc.mockResolvedValue({ data: null, error: { message: 'ERASURE_NOT_OWNER' } })

    const result = await eraseWorkspaceData(WORKSPACE.name)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/only the owner/i)
    expect(result.message).toMatch(/3 files were already removed/i)
    expect(result.message).not.toMatch(/nothing was deleted/i)
  })

  it('uses the singular for one file', async () => {
    vi.mocked(sweepWorkspaceStorage).mockResolvedValue({ removed: 1, failed: [], leftUnread: [] })
    rpc.mockResolvedValue({ data: null, error: { message: 'ERASURE_INCOMPLETE' } })

    const result = await eraseWorkspaceData(WORKSPACE.name)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/one file was already removed/i)
    expect(result.message).not.toMatch(/exactly as it was/i)
  })

  it('does not claim nothing was deleted when the RPC threw after the sweep', async () => {
    vi.mocked(sweepWorkspaceStorage).mockResolvedValue({ removed: 2, failed: [], leftUnread: [] })
    rpc.mockRejectedValue(new Error('ECONNRESET'))

    const result = await eraseWorkspaceData(WORKSPACE.name)

    expect(reportServerError).toHaveBeenCalled()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/2 files were already removed/i)
    expect(result.message).not.toMatch(/nothing was deleted/i)
  })

  it('still says nothing was deleted when a failure happened before the sweep', async () => {
    vi.mocked(getActiveWorkspace).mockRejectedValue(new Error('ECONNRESET'))

    const result = await eraseWorkspaceData(WORKSPACE.name)

    expect(result).toEqual({
      ok: false,
      message: 'That deletion was not applied, and nothing was deleted.',
    })
  })
})
