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
  /** The platform string actually sent to Zernio's connect endpoint, in order. */
  connectUrlPlatforms: [] as string[],
  /** `platform:headless` for every connect start, so the flag cannot be assumed. */
  connectUrlHeadless: [] as string[],
  /** The profile id handed to Zernio's connect endpoint, in order. */
  connectUrlProfileIds: [] as string[],
  /** The return URL handed to Zernio, in order. */
  connectUrlRedirects: [] as string[],
  /**
   * The `zernio_profiles` row for this workspace. Null is a workspace that has
   * never connected, which is the only case that may reach Zernio's profile
   * endpoints; every test written before the stored mapping was read keeps that
   * meaning by default.
   */
  mapping: null as { profile_id: string } | null,
  mappingError: null as { message: string } | null,
  /** The abuse ceiling's verdict. Allowed by default; a test flips it to prove the 429. */
  rateAllowed: true,
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: state.userId }),
}))

vi.mock('@/lib/zernio/server', () => ({
  zernioClient: () =>
    state.clientPresent
      ? {
          connectUrl: (
            platform: string,
            profileId: string,
            redirectUrl: string,
            options?: { headless?: boolean },
          ) => {
            state.connectUrlCalls += 1
            state.connectUrlPlatforms.push(platform)
            state.connectUrlHeadless.push(`${platform}:${options?.headless === true}`)
            state.connectUrlProfileIds.push(profileId)
            state.connectUrlRedirects.push(redirectUrl)
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

vi.mock('@/lib/ops/rate-limit', () => ({
  fixedWindowAllow: () =>
    Promise.resolve({ allowed: state.rateAllowed, count: 1, unmeasured: false }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: state.mapping, error: state.mappingError }),
        }),
      }),
    }),
    rpc: () => {
      state.rpcCalls += 1
      return Promise.resolve({ error: null })
    },
  }),
}))

const { POST } = await import('./route')

const call = () => post({ platform: 'instagram' })

/** One press, with whatever body the test wants to send. */
const post = (body: Record<string, unknown>) =>
  POST(
    new Request('https://app.sahodalabs.com/api/oauth/zernio/start', {
      method: 'POST',
      body: JSON.stringify(body),
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
  state.connectUrlPlatforms = []
  state.connectUrlHeadless = []
  state.connectUrlProfileIds = []
  state.connectUrlRedirects = []
  state.mapping = null
  state.mappingError = null
  state.rateAllowed = true
})

describe('an abuse ceiling stands before any external work', () => {
  it('refuses with 429 and provisions nothing when the window is exceeded', async () => {
    state.rateAllowed = false

    const res = await call()

    expect(res.status).toBe(429)
    // The point of placing it above `ensureZernioProfile` and `connectUrl`: a
    // refused connect must not touch Zernio at all.
    expect(state.profileEnsured).toBe(0)
    expect(state.connectUrlCalls).toBe(0)
  })

  it('lets a normal press through', async () => {
    const res = await call()

    expect(res.status).toBe(200)
  })
})

/**
 * ONE IDEMPOTENCY KEY, A RENAMED WORKSPACE, AND NO CHANNEL COULD BE CONNECTED.
 *
 * MEASURED: Sentry JAVASCRIPT-NEXTJS-1M, 2026-08-25, three events in 32 seconds
 * on this route: `createProfile: This Idempotency-Key was already used with a
 * different request body`. The workspace had been bound to its profile in
 * `zernio_profiles` nine hours earlier. This route never read that row: it asked
 * Zernio by a name that embeds the workspace name, the workspace had been
 * renamed, the lookup missed, and the create went out under the old key.
 *
 * The stored mapping is the answer, and it is read first.
 */
describe('a workspace that is already bound never asks Zernio for a profile again', () => {
  const BOUND = '6a8d3af765ef313d46dc012c'

  it('uses the stored profile even after a rename, and provisions nothing', async () => {
    state.mapping = { profile_id: BOUND }
    // The rename that produced the Sentry events: bound under one name, pressed
    // under another.
    state.workspace = { id: 'ws-1', name: 'TRAINX' }

    const res = await post({ platform: 'instagram' })

    // MUTATION WITNESS. Put `ensureZernioProfile` back in front of the read and
    // this counts one provisioning call on a workspace that already has a profile.
    expect(res.status).toBe(200)
    expect(state.profileEnsured).toBe(0)
    expect(state.rpcCalls).toBe(0)
    expect(state.connectUrlProfileIds).toEqual([BOUND])
  })

  it('still provisions, and records the binding, for a workspace that has none', async () => {
    state.mapping = null

    const res = await post({ platform: 'instagram' })

    expect(res.status).toBe(200)
    expect(state.profileEnsured).toBe(1)
    expect(state.rpcCalls).toBe(1)
    expect(state.connectUrlProfileIds).toEqual(['6a75cae32853ee463c6419d6'])
  })

  it('refuses when the binding cannot be read, rather than minting a second profile', async () => {
    // A create for a workspace whose binding we could not read is how an orphan
    // profile gets made and PROFILE_ALREADY_BOUND becomes permanent.
    state.mappingError = { message: 'connection reset' }

    const res = await post({ platform: 'instagram' })
    const body = (await res.json()) as { message?: string }

    expect(res.status).toBe(503)
    expect(state.profileEnsured).toBe(0)
    expect(state.connectUrlCalls).toBe(0)
    expect(body.message).toMatch(/try again/i)
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})

/**
 * THE NONCE THAT TIES THE TRIP HOME TO THIS PRESS.
 *
 * The return route used to bind a picker to the customer with nothing but a
 * profile id, which is on every return URL their browser ever visited. A
 * per-press random value, in an httpOnly cookie AND on the return URL, is what
 * a link built by somebody else cannot carry.
 */
describe('every press mints a nonce, and it travels both ways', () => {
  const nonceFrom = (res: Response): string | null => {
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('sahoda_connect_nonce='))
    return cookie?.split(';')[0]?.split('=')[1] ?? null
  }

  it('puts the same value in an httpOnly cookie and on the return URL', async () => {
    const res = await post({ platform: 'facebook', mode: 'popup' })

    const nonce = nonceFrom(res)
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{22}$/)
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('sahoda_connect_nonce='))
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    // The URL Zernio was given carries it, and Zernio preserves our query string.
    // (`mode` and `platform` are `zernioReturnUrl`'s to add, and that is mocked
    // here; return-url.test.ts pins them.)
    const redirect = new URL(state.connectUrlRedirects[0] ?? '')
    expect(redirect.searchParams.get('nonce')).toBe(nonce)
  })

  it('never reuses a value across presses', async () => {
    const a = nonceFrom(await post({ platform: 'instagram' }))
    const b = nonceFrom(await post({ platform: 'instagram' }))
    expect(a).not.toBeNull()
    expect(a).not.toBe(b)
  })

  it('still sends the pending-connect cookie beside it', async () => {
    const res = await post({ platform: 'linkedin' })
    const names = res.headers.getSetCookie().map((c) => c.split('=')[0])
    expect(names).toEqual(['sahoda_connect', 'sahoda_connect_nonce'])
  })

  it('sends no nonce on a refusal', async () => {
    state.limitVerdict = { kind: 'blocked', sentence: 'Your Free plan includes 2 channels.' }
    const res = await post({ platform: 'instagram' })
    expect(res.status).toBe(403)
    expect(res.headers.getSetCookie()).toEqual([])
  })
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

/**
 * WHAT THE CUSTOMER PRESSED, RECORDED BEFORE THEY LEAVE.
 *
 * ── ASSERTED ON THE REAL `Set-Cookie` HEADER, AND THAT IS THE POINT ──────────
 * These tests used to mock `setPendingConnect` and assert it had been CALLED.
 * It was called. It just did nothing: the old implementation went through
 * `cookies().set()`, and this route answers with a `Response.json(...)` it builds
 * itself, so the mutation never became a header. A seam that records the call
 * cannot tell "we asked for a cookie" from "a cookie was sent", and the whole
 * failure lived in that gap.
 *
 * Two reported bugs came out of it — the popup showed the app instead of closing,
 * and a genuine connect wrote no row — and this file was green throughout.
 *
 * So nothing is mocked now. `setPendingConnectHeader` is a pure function and the
 * assertion reads what actually leaves the route.
 */
describe('the pending connect is recorded, and only for a connect that happens', () => {
  it('SENDS a Set-Cookie header, not merely a call to a cookie helper', async () => {
    const res = await post({ platform: 'linkedin' })

    expect(res.status).toBe(200)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('sahoda_connect=linkedin.redirect')
    // The attributes the return trip depends on. `SameSite=Lax` in particular is
    // load-bearing: the trip home is a cross-site top-level navigation, which
    // `Lax` allows and `Strict` would drop.
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
  })

  it('records the mode, so the return trip knows how to answer', async () => {
    const res = await post({ platform: 'instagram', mode: 'popup' })
    expect(res.headers.get('set-cookie')).toContain('sahoda_connect=instagram.popup')
  })

  it('treats anything that is not the literal "popup" as a redirect', async () => {
    // The older path is the fallback for a blocked popup, so an absent or unknown
    // mode must never select the newer one.
    const odd = await post({ platform: 'instagram', mode: 'iframe' })
    const bare = await post({ platform: 'instagram' })
    expect(odd.headers.get('set-cookie')).toContain('instagram.redirect')
    expect(bare.headers.get('set-cookie')).toContain('instagram.redirect')
  })

  it('sends NO cookie when the plan refuses the connect', async () => {
    // A cookie written before a refusal would authorise a create for a connect
    // that never happened, and it would still be there on the next trip back.
    state.slots = { count: 2, keys: new Set() }
    state.limitVerdict = { kind: 'blocked', sentence: 'Your Free plan includes 2 channels.' }

    const res = await post({ platform: 'instagram' })

    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('sends NO cookie when there is no workspace to connect into', async () => {
    state.workspace = null

    const res = await post({ platform: 'instagram' })

    expect(res.status).toBe(400)
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})

/**
 * OUR NAME FOR A CHANNEL IS NOT ZERNIO'S, AND THREE BUTTONS DIED OF IT.
 *
 * X and Google Business answered "Couldn't start the connection. Try again." on
 * every press while Instagram, LinkedIn and Facebook worked — because for those
 * three our id and Zernio's happen to be the same string. `/connect/x` and
 * `/connect/gbp` are not platforms Zernio has ever had.
 */
describe('the connect endpoint is asked for ZERNIO’s name for the channel', () => {
  it('sends twitter for x and googlebusiness for gbp', async () => {
    await post({ platform: 'x' })
    expect(state.connectUrlPlatforms).toEqual(['twitter'])

    state.connectUrlPlatforms = []
    await post({ platform: 'gbp' })
    expect(state.connectUrlPlatforms).toEqual(['googlebusiness'])
  })

  it('sends our own name where the two agree', async () => {
    await post({ platform: 'instagram' })
    await post({ platform: 'linkedin' })
    await post({ platform: 'facebook' })
    expect(state.connectUrlPlatforms).toEqual(['instagram', 'linkedin', 'facebook'])
  })

  it('refuses Telegram before calling Zernio, because it has no OAuth flow', async () => {
    // `GET /v1/connect/telegram` returns an access CODE for a bot, not an
    // authUrl. Sending a customer there is sending them nowhere.
    const res = await post({ platform: 'telegram' })

    expect(res.status).toBe(400)
    expect(state.connectUrlPlatforms).toEqual([])
    // And it must not leave a cookie authorising a create for a trip that cannot
    // happen.
    expect(res.headers.get('set-cookie')).toBeNull()

    /**
     * ── AND THE SENTENCE HAS TO NAME THE FLOW THAT DOES WORK ────────────────
     * It used to read "This channel is connected a different way, and that flow
     * isn't built yet." Both halves have since gone false: the flow IS built
     * (api/oauth/zernio/telegram plus the code panel on the card), and a
     * customer told a thing is unbuilt does not go looking for the control that
     * would connect it. A refusal that leaves somebody with nowhere to go is the
     * same defect `no-impossible-remedy.spec.ts` exists for.
     */
    const body = (await res.json()) as { message?: string }
    expect(body.message).toMatch(/code on its card/i)
    expect(body.message).not.toMatch(/isn.t built|not built|try again/i)
  })
})

/**
 * WHOSE SCREEN THE CUSTOMER PICKS A FACEBOOK PAGE ON.
 *
 * ── WHY THIS FLAG EXISTS ─────────────────────────────────────────────────────
 * Facebook resolves to every Page the customer administers and Google Business to
 * every location, and Zernio creates NO ACCOUNT until one is chosen. Left alone it
 * hosts that choice on zernio.com — which is the screen the founder reported
 * without knowing what it was: "it opens another new website ... change from
 * social media connector to Sahodalabs". MEASURED 2026-08-27, it also ended with
 * zero facebook accounts on this key.
 *
 * `headless=true` suppresses it and returns the browser to our own return route
 * with the OAuth state, so the picker is ours.
 *
 * ── AND WHY IT IS NOT ON FOR EVERYTHING ──────────────────────────────────────
 * Instagram and LinkedIn connect end to end today — they are the two accounts this
 * workspace actually holds. Zernio publishes selection endpoints for LinkedIn
 * organizations, Pinterest boards and more, and switching those on would move a
 * working flow onto a second half nobody has written. The narrowness IS the
 * safety argument, so it is asserted rather than assumed.
 */
describe('Zernio hosts the picker for nobody we have built one for', () => {
  it('turns Zernio’s own screen off for Facebook', async () => {
    await post({ platform: 'facebook' })
    expect(state.connectUrlHeadless).toEqual(['facebook:true'])
  })

  it('turns it off for Google Business too, asked for by ZERNIO’s name', async () => {
    // Two facts in one assertion, both load-bearing: the flag is set, and the
    // platform reaching Zernio is `googlebusiness` rather than our `gbp`. Passing
    // our own id here is what made every X and GBP connect answer "Couldn't start
    // the connection" for a week.
    await post({ platform: 'gbp' })
    expect(state.connectUrlHeadless).toEqual(['googlebusiness:true'])
  })

  it('leaves it ON for Instagram, which needs no choice and works today', async () => {
    await post({ platform: 'instagram' })
    expect(state.connectUrlHeadless).toEqual(['instagram:false'])
  })

  it('leaves it on for LinkedIn, even though Zernio offers a selection endpoint', async () => {
    // Deliberate. LinkedIn has `/connect/linkedin/select-organization` and we have
    // not built that picker; asking for headless here would return a customer to a
    // return route that cannot finish, i.e. a working platform broken for tidiness.
    await post({ platform: 'linkedin' })
    expect(state.connectUrlHeadless).toEqual(['linkedin:false'])
  })
})
