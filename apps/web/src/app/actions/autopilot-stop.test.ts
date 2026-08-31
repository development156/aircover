import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/workspaces', () => ({ workspaceForWrite: vi.fn() }))
vi.mock('@/lib/loop/autopilot/store', () => ({ cancelAnnouncement: vi.fn() }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { cancelAnnouncement } from '@/lib/loop/autopilot/store'
import { reportServerError } from '@/lib/observability/report'
import { workspaceForWrite } from '@/lib/workspaces'
import { stopAutopilotPost } from './autopilot-stop'

/**
 * ── WHAT THIS FILE CANNOT SEE ────────────────────────────────────────────────
 * The store is mocked, so this proves the action's OWN behaviour: who may call
 * it, and that its answer never claims more than the store told it. Whether the
 * cancel actually lands is the pglite suite's to prove.
 */

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ userId: 'user_1' } as never)
  vi.mocked(workspaceForWrite).mockResolvedValue({
    ok: true,
    workspace: { id: 'ws-1' },
  } as never)
  vi.mocked(cancelAnnouncement).mockResolvedValue(true)
})

describe('who may stop a post', () => {
  it('refuses a signed-out caller and never touches the store', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never)
    const r = await stopAutopilotPost('post-1', 'variant-1')
    expect(r.ok).toBe(false)
    expect(cancelAnnouncement).not.toHaveBeenCalled()
  })

  it('refuses when no workspace resolves, passing the resolver’s own message on', async () => {
    vi.mocked(workspaceForWrite).mockResolvedValue({
      ok: false,
      message: 'Create a workspace first.',
    } as never)
    const r = await stopAutopilotPost('post-1', 'variant-1')
    expect(r).toMatchObject({ ok: false, message: 'Create a workspace first.' })
    expect(cancelAnnouncement).not.toHaveBeenCalled()
  })

  it('refuses ids that are not strings rather than passing them to a query', async () => {
    const r = await stopAutopilotPost({ evil: true }, 'variant-1')
    expect(r.ok).toBe(false)
    expect(cancelAnnouncement).not.toHaveBeenCalled()
  })

  it('scopes the cancel to the resolved workspace, never to anything the caller sent', async () => {
    await stopAutopilotPost('post-1', 'variant-1')
    expect(cancelAnnouncement).toHaveBeenCalledWith('ws-1', 'post-1', 'variant-1')
  })
})

describe('the answer never claims more than the store told it', () => {
  it('says stopped, and that nothing went out, when the cancel took', async () => {
    const r = await stopAutopilotPost('post-1', 'variant-1')
    expect(r).toMatchObject({ ok: true, outcome: 'stopped' })
    expect(r.message).toMatch(/nothing went out/i)
  })

  it('does NOT claim the post was stopped when the cancel did not take', async () => {
    // The distinction this action exists to keep. A post that already
    // dispatched may be on a customer's account right now; saying "stopped"
    // over it is the false claim this product spends its precision on.
    vi.mocked(cancelAnnouncement).mockResolvedValue(false)
    const r = await stopAutopilotPost('post-1', 'variant-1')
    expect(r.outcome).toBe('already')
    expect(r.message).not.toMatch(/nothing went out/i)
  })

  it('does not guess WHICH settled outcome happened, because it cannot know', async () => {
    vi.mocked(cancelAnnouncement).mockResolvedValue(false)
    const r = await stopAutopilotPost('post-1', 'variant-1')
    // It went out, or somebody stopped it first. From here those are
    // indistinguishable, and naming one would be a guess.
    expect(r.message).toMatch(/either/i)
  })
})

describe('when the database is unreachable', () => {
  it('reports the error and says so without claiming an outcome', async () => {
    vi.mocked(cancelAnnouncement).mockRejectedValue(new Error('ECONNREFUSED'))
    const r = await stopAutopilotPost('post-1', 'variant-1')
    expect(r.ok).toBe(false)
    expect(r.outcome).toBeUndefined()
    expect(reportServerError).toHaveBeenCalled()
  })
})
