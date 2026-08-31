import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The read behind the section, and the two things it must never get wrong.
 *
 * FIRST, it must see a level 3. `readLoop`'s dial is typed with
 * `AutonomyLevel`, which admits only 0-2, so a screen built on that type
 * reports "no channel is set to send on its own" for a workspace that HAS
 * armed one. This read exists because of that asymmetry and the test below is
 * the thing that keeps it honest.
 *
 * SECOND, a failed read must not render as an empty queue. "We asked and the
 * answer was nothing" and "we could not ask" are different claims, and only one
 * of them is about the customer's posts.
 */

const store = vi.hoisted(() => ({
  readDial: vi.fn(),
  readAnnouncedForPerson: vi.fn(),
}))
const workspaces = vi.hoisted(() => ({ activeWorkspaceRead: vi.fn() }))

vi.mock('./store', () => store)
vi.mock('@/lib/workspaces', () => workspaces)

const { readGoingOut } = await import('./going-out')

const WS = { status: 'ok', workspace: { id: 'ws-1' } }

function announced(channel = 'x') {
  return {
    postId: 'p1',
    variantId: 'v1',
    channel,
    postTitle: 'A post someone wrote',
    dispatchAfter: new Date('2030-01-01T00:10:00.000Z'),
    announcedAt: new Date('2030-01-01T00:00:00.000Z'),
  }
}

beforeEach(() => {
  workspaces.activeWorkspaceRead.mockResolvedValue(WS)
  store.readDial.mockResolvedValue(new Map())
  store.readAnnouncedForPerson.mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('seeing an armed channel', () => {
  it('treats level 3 as armed, which the AutonomyLevel type cannot express', async () => {
    store.readDial.mockResolvedValue(new Map([['x', 3]]))

    const out = await readGoingOut()

    expect(out.status).toBe('ready')
    if (out.status !== 'ready') return
    // Not 'not-armed'. This is the whole reason the read exists.
    expect(out.view.state).toBe('armed-idle')
  })

  it('does NOT treat level 2 as armed, because supervised is not unattended', async () => {
    store.readDial.mockResolvedValue(new Map([['x', 2]]))

    const out = await readGoingOut()

    expect(out.status).toBe('ready')
    if (out.status !== 'ready') return
    expect(out.view.state).toBe('not-armed')
  })

  it('reports posts in the window when a channel is armed', async () => {
    store.readDial.mockResolvedValue(new Map([['x', 3]]))
    store.readAnnouncedForPerson.mockResolvedValue([announced(), announced()])

    const out = await readGoingOut()

    expect(out.status).toBe('ready')
    if (out.status !== 'ready') return
    expect(out.view.state).toBe('waiting')
    expect(out.view.count).toBe(2)
    expect(out.waiting).toHaveLength(2)
  })
})

describe('a read that could not answer is not an empty queue', () => {
  it('is unreadable when the dial read throws, never "nothing waiting"', async () => {
    store.readDial.mockRejectedValue(new Error('connection refused'))
    expect((await readGoingOut()).status).toBe('unreadable')
  })

  it('is unreadable when the announcements read throws', async () => {
    store.readDial.mockResolvedValue(new Map([['x', 3]]))
    store.readAnnouncedForPerson.mockRejectedValue(new Error('boom'))
    expect((await readGoingOut()).status).toBe('unreadable')
  })

  it('carries no error text out, because a database message can hold a secret', async () => {
    store.readDial.mockRejectedValue(new Error('postgres://user:hunter2@host/db'))

    const out = await readGoingOut()

    expect(JSON.stringify(out)).not.toContain('hunter2')
    expect(JSON.stringify(out)).not.toContain('postgres://')
  })

  it('separates "no workspace" from "could not read", which have different remedies', async () => {
    workspaces.activeWorkspaceRead.mockResolvedValue({ status: 'none' })
    expect((await readGoingOut()).status).toBe('no-workspace')

    workspaces.activeWorkspaceRead.mockResolvedValue({ status: 'unreadable' })
    expect((await readGoingOut()).status).toBe('unreadable')
  })

  it('never queries when there is no workspace to query for', async () => {
    workspaces.activeWorkspaceRead.mockResolvedValue({ status: 'none' })

    await readGoingOut()

    expect(store.readDial).not.toHaveBeenCalled()
    expect(store.readAnnouncedForPerson).not.toHaveBeenCalled()
  })
})
