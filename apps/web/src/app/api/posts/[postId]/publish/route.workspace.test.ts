import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * WHAT THE PUBLISH ROUTE SAYS WHEN THE WORKSPACE READ BREAKS.
 *
 * `readWorkspaces` already distinguishes the two facts — `none` ("you have no
 * workspace; create one") from `unreadable` ("we could not find out") — and
 * lib/workspaces.ts documents why: creating a workspace is acting on a fact
 * nobody established. Three routes converted to `readActiveWorkspace` for
 * exactly this. The publish route still called `getActiveWorkspace`, the lossy
 * view, which returns `null` for both.
 *
 * So a failed `workspaces` SELECT answered **400 "Create a workspace first."** —
 * a client-error status and a false instruction, told to a customer who has a
 * workspace and is watching a scheduled post fail to go out. It is also the
 * shape that hides an outage: every 5xx alert filter misses it.
 *
 * These tests drive the dependency failure, not the happy path, because the
 * happy path was never the thing that lied.
 */

const WS = { id: '22222222-2222-4222-8222-222222222222', name: 'Bakery', slug: 'bakery' }

const state = vi.hoisted(() => ({
  userId: 'user_abc' as string | null,
  workspaceRead: { status: 'ok' } as
    { status: 'ok'; workspace: typeof WS } | { status: 'none' } | { status: 'unreadable' },
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: state.userId }),
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/workspaces', () => ({
  readActiveWorkspace: () => Promise.resolve(state.workspaceRead),
  getActiveWorkspace: () =>
    Promise.resolve(state.workspaceRead.status === 'ok' ? state.workspaceRead.workspace : null),
}))
// Everything past the workspace read is stubbed to refuse, so nothing here can
// reach a model, a token or an adapter no matter which branch is taken.
vi.mock('@/lib/workspace-role', () => ({
  getWorkspaceRole: () => Promise.resolve(null),
  canPublish: () => false,
}))
vi.mock('@/lib/posts/read', () => ({
  getPost: () => Promise.resolve(null),
  listVariants: () => Promise.resolve([]),
}))

const { POST } = await import('./route')

const call = () =>
  POST(
    new Request('https://app.example/api/posts/p1/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'x' }),
    }),
    { params: Promise.resolve({ postId: '11111111-1111-4111-8111-111111111111' }) },
  )

beforeEach(() => {
  state.userId = 'user_abc'
  state.workspaceRead = { status: 'ok', workspace: WS }
})

describe('publish route, when the workspace read does not answer', () => {
  test('says it could not check, with a 503 — not "create a workspace"', async () => {
    state.workspaceRead = { status: 'unreadable' }
    const res = await call()

    expect(res.status).toBe(503)
    const body = (await res.json()) as { error?: string; message?: string }
    const said = `${body.error ?? ''} ${body.message ?? ''}`
    expect(said).not.toMatch(/create a workspace/i)
  })

  test('still tells an account with no workspace to create one, with a 400', async () => {
    state.workspaceRead = { status: 'none' }
    const res = await call()

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error?: string; message?: string }
    expect(`${body.error ?? ''} ${body.message ?? ''}`).toMatch(/create a workspace/i)
  })
})
