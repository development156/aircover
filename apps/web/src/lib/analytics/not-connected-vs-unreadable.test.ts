import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * "No account connected" must never be reported as "we could not read".
 *
 * ── THE BUG THIS PINS ────────────────────────────────────────────────────────
 * `readInstagramAnalytics` used to consult `zernioClientReads()` BEFORE asking
 * which account was connected. In any environment without a publishing key —
 * which includes every local dev machine and every fresh preview — that
 * returned `unreadable`, so /analytics told a brand-new user "couldn't read
 * your account insights just now" when the truth was that they had never
 * connected anything. A failure report where nothing failed, on one of the
 * first screens they open.
 *
 * The fix is an ORDERING, which is exactly the kind of thing that reverts
 * silently during a refactor: both orders compile, both typecheck, and the
 * wrong one only shows itself to a user with no connection. So the order is
 * pinned here rather than left to review.
 */

vi.mock('server-only', () => ({}))

const activeWorkspace = vi.fn()
const scopeForWorkspace = vi.fn()
const zernioClientReads = vi.fn()
const supabaseFrom = vi.fn()

vi.mock('@/lib/workspaces', () => ({ getActiveWorkspace: () => activeWorkspace() }))
vi.mock('@/lib/zernio/scope', () => ({
  scopeForWorkspace: (...a: unknown[]) => scopeForWorkspace(...a),
}))
vi.mock('@/lib/zernio/server', () => ({ zernioClientReads: () => zernioClientReads() }))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => ({ from: supabaseFrom }) }))

/**
 * Load the subject and the ScopeError class from the SAME module graph.
 *
 * `vi.resetModules()` gives each dynamic import a fresh copy of
 * `@sahoda/publishing`, so a `ScopeError` imported at the top of this file is a
 * DIFFERENT class object from the one `account-insights` checks with
 * `instanceof`. Resolving both here keeps the identity consistent — otherwise
 * every rejection falls through the `instanceof` branch and the test measures
 * module identity instead of the behaviour it claims to.
 */
async function load() {
  const [subject, publishing] = await Promise.all([
    import('@/lib/analytics/account-insights'),
    import('@sahoda/publishing'),
  ])
  return {
    readInstagramAnalytics: subject.readInstagramAnalytics,
    ScopeError: publishing.ScopeError,
  }
}

/** The real chain: .from().select().eq().eq().neq().limit() */
function connectionsRows(rows: unknown[]) {
  const result = Promise.resolve({ data: rows, error: null })
  supabaseFrom.mockReturnValue({
    select: () => ({
      eq: () => ({ eq: () => ({ neq: () => ({ limit: () => result }) }) }),
    }),
  })
}

const AT = new Date('2026-08-16T00:00:00Z')

describe('a missing connection is not a failed read', () => {
  beforeEach(() => {
    vi.resetModules()
    activeWorkspace.mockResolvedValue({ id: 'ws_1', name: 'Test', slug: 'test' })
    scopeForWorkspace.mockReset()
    zernioClientReads.mockReset()
    supabaseFrom.mockReset()
  })

  test('reports not-connected when nothing is connected AND the client is unconfigured', async () => {
    // Both true at once — the exact shape of a fresh local/preview environment.
    // The OLD order answered `unreadable` here purely because of the second fact.
    const { readInstagramAnalytics, ScopeError } = await load()
    zernioClientReads.mockReturnValue(null)
    scopeForWorkspace.mockRejectedValue(new ScopeError('no active instagram connection'))
    connectionsRows([]) // never connected

    expect((await readInstagramAnalytics(AT)).kind).toBe('not-connected')
  })

  test('does not consult the transport at all before it knows there is an account', async () => {
    // The stronger claim: asking the client first is what caused the bug, so the
    // client must not be reached on a path where the answer cannot depend on it.
    const { readInstagramAnalytics, ScopeError } = await load()
    zernioClientReads.mockReturnValue(null)
    scopeForWorkspace.mockRejectedValue(new ScopeError('no active instagram connection'))
    connectionsRows([])

    await readInstagramAnalytics(AT)
    expect(zernioClientReads).not.toHaveBeenCalled()
  })

  test('says reconnect, not not-connected, when a dead connection exists', async () => {
    // "Connect Instagram" is useless advice to someone already connected.
    const { readInstagramAnalytics, ScopeError } = await load()
    zernioClientReads.mockReturnValue(null)
    scopeForWorkspace.mockRejectedValue(new ScopeError('no active instagram connection'))
    connectionsRows([{ status: 'expired' }])

    expect((await readInstagramAnalytics(AT)).kind).toBe('reconnect')
  })

  test('still reports a problem when an account EXISTS and the client is unconfigured', async () => {
    // The other side of the same ordering: once there is something to read,
    // being unable to reach it must still say so, and must never send the owner
    // to connect an account they already connected.
    //
    // This asserted `unreadable` while that was the only failure state. It is
    // now `not-configured`, which is the same guarantee stated more precisely:
    // no call went out, so nothing "failed", and the copy must not promise that
    // retrying will help. The GUARANTEE — never not-connected, never reconnect —
    // is asserted below rather than left implied by the one discriminant.
    const { readInstagramAnalytics } = await load()
    scopeForWorkspace.mockResolvedValue({ account: { id: 'acc_1' } })
    zernioClientReads.mockReturnValue(null)

    const { kind } = await readInstagramAnalytics(AT)
    expect(kind).toBe('not-configured')
    expect(kind).not.toBe('not-connected')
    expect(kind).not.toBe('reconnect')
  })

  test('separates "no key in this environment" from "the call failed"', async () => {
    // The distinction this state exists for. `unreadable` says "try again in a
    // moment", which is true of a timed-out call and false of an absent
    // environment variable — retrying cannot conjure a key. Collapsing the two
    // is how a connected workspace reads a transient-failure message forever.
    // lib/inbox/surface.ts draws the same line as `no_reader` vs `call_failed`.
    const { readInstagramAnalytics } = await load()
    scopeForWorkspace.mockResolvedValue({ account: { id: 'acc_1' } })

    zernioClientReads.mockReturnValue(null)
    expect((await readInstagramAnalytics(AT)).kind).toBe('not-configured')

    // A configured client whose calls reject IS a genuine read failure.
    vi.resetModules()
    const again = await load()
    scopeForWorkspace.mockResolvedValue({ account: { id: 'acc_1' } })
    zernioClientReads.mockReturnValue({
      instagramFollowerHistory: () => Promise.reject(new Error('boom')),
      instagramAccountInsights: () => Promise.reject(new Error('boom')),
    })
    expect((await again.readInstagramAnalytics(AT)).kind).toBe('unreadable')
  })
})
