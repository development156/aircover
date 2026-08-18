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
  /** The workspace READ failed — distinct from having none. */
  workspaceUnreadable: false,
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
  // The THREE-way read the handlers now branch on. `state.workspace` null is the
  // `none` arm; the `unreadable` arm has its own test rather than a shared flag,
  // because it is the arm that used to be indistinguishable.
  readActiveWorkspace: async () => {
    if (state.workspaceUnreadable) return { status: 'unreadable' }
    const w = await Promise.resolve(state.workspace)
    return w ? { status: 'ok', workspace: w } : { status: 'none' }
  },
  // Derived from the SAME value the two-way mock returns, so every assertion in
  // this file still means what it meant. `workspaceForWrite` carries the REFUSAL
  // SENTENCE as well as the workspace — the split run 24 made, because "Create a
  // workspace first." was being said to people who had one.
  workspaceForWrite: async () => {
    const w = await Promise.resolve(state.workspace)
    return w ? { ok: true, workspace: w } : { ok: false, message: 'Create a workspace first.' }
  },
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
  state.workspaceUnreadable = false
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

/**
 * A 4xx SAYING "CREATE A WORKSPACE FIRST" FOR A READ THAT BROKE.
 *
 * Run 23 split the workspace read into three arms and stated plainly that the
 * route handlers were NOT audited — "a gap, not a clean bill". This is what the
 * gap held: the handler took the two-way lookup, so a Supabase hiccup arrived as
 * `null` and left as a 400 telling a customer who HAS a workspace to make
 * another. Twice wrong — the remedy cannot work, and a 4xx blames the caller for
 * a fault on our side, so the outage is invisible to a 5xx log filter.
 *
 * The pair is the claim: two different facts, two different statuses, two
 * different sentences.
 */
describe('the workspace read tells "none" apart from "could not tell"', () => {
  it('refuses with 400 and the real remedy when the account has no workspace', async () => {
    state.workspace = null

    const res = await call()

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ message: 'Create a workspace first.' })
  })

  it('refuses with 503 and never says "create a workspace" when the read failed', async () => {
    state.workspaceUnreadable = true

    const res = await call()

    // 5xx, because it is our fault and a log filter has to see it.
    expect(res.status).toBe(503)
    const body = (await res.json()) as { message: string }
    // THE WHOLE CLAIM: it must not send someone to create a second workspace.
    expect(body.message).not.toMatch(/create a workspace/i)
    expect(body.message).toMatch(/try again/i)
  })

  it('does not provision a Zernio profile for a workspace it could not read', async () => {
    state.workspaceUnreadable = true

    await call()

    // `ensureZernioProfile` CREATES a profile at Zernio. Doing that off a read
    // that failed would leave an orphan for a workspace we never identified.
    expect(state.profileEnsured).toBe(0)
    expect(state.connectUrlCalls).toBe(0)
  })
})
