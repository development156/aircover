import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `POST /api/oauth/zernio/start` — the channels plan limit, enforced BEFORE the
 * consent screen.
 *
 * The return route enforces it too and has to: it is the only place that knows what
 * Zernio actually handed back. But enforcing only there means the refusal lands after
 * the customer has approved third-party access to their account on the platform's own
 * screen. That grant is real, external, and not ours to undo — so "your plan is full"
 * afterwards is the failure-after-commitment the whole gate exists to prevent. For a
 * paid action the commitment is a credit hold; for a channel it is the OAuth grant.
 *
 * The disabled buttons on /connections do NOT cover this. A stale page, a second tab
 * or a direct POST all reach this route with no button consulted.
 */

const state = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
  clientPresent: true,
  workspace: { id: 'ws-1', name: 'Chai & Chapters' } as { id: string; name: string } | null,
  slots: { count: 0, keys: new Set<string>() } as { count: number; keys: Set<string> } | null,
  limitVerdict: { kind: 'allowed', limit: 8 } as
    | { kind: 'allowed'; limit: number }
    | { kind: 'blocked'; sentence: string }
    | { kind: 'unknown' },
  /** Side effects that must NOT happen for a refused connect. */
  profileEnsured: 0,
  rpcCalls: 0,
  connectUrlCalls: 0,
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: state.userId }),
}))

vi.mock('@/lib/zernio/server', () => ({
  zernioClient: () =>
    state.clientPresent
      ? {
          connectUrl: () => {
            state.connectUrlCalls += 1
            return Promise.resolve('https://zernio.example/consent')
          },
        }
      : null,
  zernioReturnUrl: () => 'https://app.sahodalabs.com/api/oauth/zernio/return',
}))

vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve(state.workspace),
}))

vi.mock('@sahoda/publishing', () => ({
  ensureZernioProfile: () => {
    state.profileEnsured += 1
    return Promise.resolve('6a75cae32853ee463c6419d6')
  },
}))

vi.mock('@/lib/connections/read', () => ({
  readConnectionSlots: () => Promise.resolve(state.slots),
}))

vi.mock('@/lib/billing/entitlements', () => ({
  checkCountableLimit: () => Promise.resolve(state.limitVerdict),
}))

vi.mock('@/lib/observability/report', () => ({ reportServerError: () => Promise.resolve() }))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    rpc: () => {
      state.rpcCalls += 1
      return Promise.resolve({ error: null })
    },
  }),
}))

const { POST } = await import('./route')

const call = () =>
  POST(
    new Request('https://app.sahodalabs.com/api/oauth/zernio/start', {
      method: 'POST',
      body: JSON.stringify({ platform: 'instagram' }),
    }),
  )

beforeEach(() => {
  state.userId = 'user_1'
  state.clientPresent = true
  state.workspace = { id: 'ws-1', name: 'Chai & Chapters' }
  state.slots = { count: 0, keys: new Set<string>() }
  state.limitVerdict = { kind: 'allowed', limit: 8 }
  state.profileEnsured = 0
  state.rpcCalls = 0
  state.connectUrlCalls = 0
})

describe('the channels plan limit is enforced before the consent screen', () => {
  it('a full plan never sends the customer to Zernio at all', async () => {
    state.slots = { count: 2, keys: new Set() }
    state.limitVerdict = {
      kind: 'blocked',
      sentence: "Your Free plan includes 2 channels and you're using 2. Starter includes 4.",
    }

    const res = await call()
    const body = (await res.json()) as { ok: boolean; message?: string; authUrl?: string }

    // ⚠ MUTATION WITNESS. Delete the `blocked` branch and this fails: the customer
    // is handed a consent URL, grants a third party access to their account, and
    // only learns their plan was full on the way back — with the grant already made.
    expect(state.connectUrlCalls).toBe(0)
    expect(body.authUrl).toBeUndefined()
    expect(res.status).toBe(403)
    expect(body.ok).toBe(false)
    // The plan sentence is rendered verbatim by ConnectButton.
    expect(body.message).toContain('Your Free plan includes 2 channels')
  })

  it('a refused connect provisions no Zernio profile', async () => {
    state.limitVerdict = { kind: 'blocked', sentence: 'Your Free plan includes 2 channels.' }

    await call()

    // The check sits ABOVE ensureZernioProfile, which CREATES a profile at Zernio
    // for a workspace that has none. No reason to provision one for a connect that
    // is about to be refused.
    expect(state.profileEnsured).toBe(0)
    expect(state.rpcCalls).toBe(0)
  })

  it('an unreadable connection count fails closed', async () => {
    state.slots = null

    const res = await call()

    expect(res.status).toBe(500)
    expect(state.connectUrlCalls).toBe(0)
    expect(state.profileEnsured).toBe(0)
  })

  it('an unanswerable plan fails closed, and says it is ours rather than theirs', async () => {
    state.limitVerdict = { kind: 'unknown' }

    const res = await call()
    const body = (await res.json()) as { message?: string }

    expect(res.status).toBe(503)
    expect(state.connectUrlCalls).toBe(0)
    // Never names a plan we did not manage to read.
    expect(body.message).not.toMatch(/free|starter|growth|agency/i)
  })

  it('a plan with room is invisible: the consent URL comes back as before', async () => {
    state.slots = { count: 1, keys: new Set() }
    state.limitVerdict = { kind: 'allowed', limit: 8 }

    const res = await call()
    const body = (await res.json()) as { ok: boolean; authUrl?: string }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.authUrl).toBe('https://zernio.example/consent')
    expect(state.profileEnsured).toBe(1)
  })
})
