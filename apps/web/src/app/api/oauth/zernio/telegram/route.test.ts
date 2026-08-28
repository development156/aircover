import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE ONE CHANNEL THAT LINKS WITHOUT A CONSENT SCREEN.
 *
 * ── WHY IT NEEDED A SECOND SURFACE ───────────────────────────────────────────
 * MEASURED against the live API on 2026-08-27: `GET /v1/connect/telegram`
 * answers 200 with `{ code: "ZRN-DLPTJW", botUsername: "LateScheduleBot",
 * expiresIn: 900, instructions: [...] }` and **no authUrl anywhere in it**. The
 * customer adds the bot as an administrator of their channel and messages it the
 * code; the link completes inside Telegram.
 *
 * On the OAuth rail this platform answered "Couldn't start the connection. Try
 * again." on every press — a remedy that could never succeed, which is what
 * `no-impossible-remedy.spec.ts` exists to forbid. `catalogue.ts` carried the
 * note "what building it needs: a code-and-poll surface of its own"; this is it.
 *
 * ── AND WHAT THESE TESTS ARE REALLY ABOUT ────────────────────────────────────
 * A poll is a channel the customer's browser touches, and doc 13 §3 records that
 * Zernio validates an accountId against your whole TEAM: a wrong one does not
 * error, it names somebody else's account and returns 200. So the interesting
 * assertions here are the ones about what the route REFUSES to believe.
 */

const state = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
  clientPresent: true,
  workspace: { id: 'ws-1', name: 'Chai & Chapters' } as { id: string; name: string } | null,
  mapping: { profile_id: '6a75cae32853ee463c6419d6' } as { profile_id: string } | null,
  /** The httpOnly cookie's code, or null for "no attempt in flight". */
  cookieCode: 'ZRN-DLPTJW' as string | null,
  /** What Zernio says when polled. */
  status: { status: 'pending', expiresAt: null } as
    | { status: 'pending'; expiresAt: string | null }
    | { status: 'connected' }
    | { status: 'expired' },
  /** Accounts Zernio holds under our profile, in ITS vocabulary. */
  accounts: [
    {
      _id: '6a8fcc9477555aae01e7cb9c',
      platform: 'telegram',
      profileId: '6a75cae32853ee463c6419d6',
    },
  ] as {
    _id: string
    platform: string
    profileId: string
  }[],
  limitVerdict: { kind: 'allowed', limit: 8 } as
    | { kind: 'allowed'; limit: number }
    | { kind: 'blocked'; sentence: string }
    | { kind: 'unknown' },
  slots: { count: 0, keys: new Set<string>() } as { count: number; keys: Set<string> } | null,
  /** `platform:accountId` for every upsert ATTEMPTED. */
  rpcCalls: [] as string[],
  /** Codes handed to `telegramStatus`, so a forged one cannot go unnoticed. */
  polledCodes: [] as string[],
  codeIssued: 0,
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: state.userId }) }))

vi.mock('@/lib/zernio/server', () => ({
  zernioClient: () =>
    state.clientPresent
      ? {
          telegramCode: () => {
            state.codeIssued += 1
            return Promise.resolve({
              code: 'ZRN-DLPTJW',
              botUsername: 'LateScheduleBot',
              expiresAt: '2026-08-27T09:15:17.516Z',
              expiresIn: 900,
              instructions: ['1. Add @LateScheduleBot as an administrator in your channel/group'],
            })
          },
          telegramStatus: (code: string) => {
            state.polledCodes.push(code)
            return Promise.resolve(state.status)
          },
          listAccounts: () => Promise.resolve(state.accounts),
        }
      : null,
}))

/**
 * A FAITHFUL REIMPLEMENTATION, not a lookup. The real function filters on
 * Zernio's platform name and then re-checks the profile, and both are what this
 * route leans on to avoid trusting the poll's own answer.
 */
vi.mock('@sahoda/publishing', () => ({
  ensureZernioProfile: () => Promise.resolve('6a75cae32853ee463c6419d6'),
  reconcileFromAccounts: (
    accounts: { _id: string; platform: string; profileId: string }[],
    args: { profileId: string; zernioPlatform: string },
  ) =>
    accounts
      .filter((a) => a.platform === args.zernioPlatform)
      .filter((a) => a.profileId === args.profileId)
      .map((a) => ({
        accountId: a._id,
        profileId: args.profileId,
        username: null,
        needsReconnection: false,
        platformStatus: null,
        tokenExpiresAt: null,
      })),
}))

vi.mock('@/lib/workspaces', () => ({
  readActiveWorkspace: async () => {
    const w = await Promise.resolve(state.workspace)
    return w ? { status: 'ok', workspace: w } : { status: 'none' }
  },
}))

vi.mock('@/lib/observability/report', () => ({ reportServerError: () => Promise.resolve() }))

vi.mock('@/lib/connections/pending-telegram', () => ({
  CLEAR_PENDING_TELEGRAM: 'sahoda_telegram=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
  readPendingTelegram: () => Promise.resolve(state.cookieCode),
  setPendingTelegramHeader: (code: string) =>
    `sahoda_telegram=${code}; Path=/; Max-Age=900; HttpOnly; SameSite=Lax`,
}))

vi.mock('@/lib/connections/read', () => ({
  connectionKey: (platform: string, accountId: string) => `${platform}:${accountId}`,
  readConnectionSlots: () => Promise.resolve(state.slots),
}))

vi.mock('@/lib/billing/entitlements', () => ({
  checkCountableLimit: () => Promise.resolve(state.limitVerdict),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.mapping, error: null }) }),
      }),
    }),
    // Two RPCs reach this route: `ensure_zernio_profile` on the way in and
    // `upsert_zernio_connection` on the way out. Only the second is recorded —
    // a mock that assumed one shape threw on the other and turned every POST
    // into a 500, which read exactly like a route bug.
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === 'upsert_zernio_connection') {
        const account = args.p_external_account as { id: string }
        state.rpcCalls.push(`${String(args.p_platform)}:${account.id}`)
      }
      return Promise.resolve({ error: null })
    },
  }),
}))

const { GET, POST } = await import('./route')

const poll = () => GET()

beforeEach(() => {
  state.userId = 'user_1'
  state.clientPresent = true
  state.workspace = { id: 'ws-1', name: 'Chai & Chapters' }
  state.mapping = { profile_id: '6a75cae32853ee463c6419d6' }
  state.cookieCode = 'ZRN-DLPTJW'
  state.status = { status: 'pending', expiresAt: null }
  state.accounts = [
    {
      _id: '6a8fcc9477555aae01e7cb9c',
      platform: 'telegram',
      profileId: '6a75cae32853ee463c6419d6',
    },
  ]
  state.limitVerdict = { kind: 'allowed', limit: 8 }
  state.slots = { count: 0, keys: new Set<string>() }
  state.rpcCalls = []
  state.polledCodes = []
  state.codeIssued = 0
})

describe('issuing a pairing code', () => {
  it('hands back the code and the bot, and remembers the code server-side', async () => {
    const res = await POST()
    const body = (await res.json()) as { code?: string; botUsername?: string }

    expect(res.status).toBe(200)
    expect(body.code).toBe('ZRN-DLPTJW')
    expect(body.botUsername).toBe('LateScheduleBot')
    // httpOnly: the poll's authority comes from the cookie, not from anything a
    // page script holds. See lib/connections/pending-telegram.ts.
    expect(res.headers.get('set-cookie') ?? '').toContain('HttpOnly')
  })

  it('refuses BEFORE issuing one when the plan is full', async () => {
    // The line the OAuth start route draws, for the same reason: by the time a
    // customer has made a bot an administrator of their channel they have done
    // real work in another product, and refusing them after that is the
    // failure-after-commitment this gate exists to prevent.
    state.limitVerdict = { kind: 'blocked', sentence: 'Your Free plan includes 2 channels.' }

    const res = await POST()

    expect(res.status).toBe(403)
    expect(state.codeIssued).toBe(0)
  })

  it('refuses an unreadable plan rather than issuing on a guess', async () => {
    state.limitVerdict = { kind: 'unknown' }
    expect((await POST()).status).toBe(503)
    expect(state.codeIssued).toBe(0)
  })

  it('refuses a signed-out request', async () => {
    state.userId = null
    expect((await POST()).status).toBe(401)
    expect(state.codeIssued).toBe(0)
  })
})

describe('polling, and what it refuses to believe', () => {
  it('reports pending without writing anything', async () => {
    const res = await poll()
    expect(((await res.json()) as { status?: string }).status).toBe('pending')
    expect(state.rpcCalls).toEqual([])
  })

  it('records the account once it lands', async () => {
    state.status = { status: 'connected' }

    const res = await poll()

    expect(((await res.json()) as { status?: string }).status).toBe('connected')
    expect(state.rpcCalls).toEqual(['telegram:6a8fcc9477555aae01e7cb9c'])
    // Spent. One code, one landing — a cookie left behind would keep re-writing
    // the row on every later poll.
    expect(res.headers.get('set-cookie') ?? '').toContain('Max-Age=0')
  })

  it('polls ONLY the code this browser was issued', async () => {
    // THE TENANT GUARD ON THIS ROUTE. Zernio answers a poll for anybody's code
    // with their status and, once it lands, their channel's title. The code comes
    // from an httpOnly cookie so a request cannot name somebody else's.
    await poll()
    expect(state.polledCodes).toEqual(['ZRN-DLPTJW'])
  })

  it('says expired, not pending, when no attempt is in flight', async () => {
    // Different claims. `pending` says we asked Zernio and are waiting; with no
    // code we never asked, and a screen that waits for ever is the worse lie.
    state.cookieCode = null

    const res = await poll()

    expect(((await res.json()) as { status?: string }).status).toBe('expired')
    expect(state.polledCodes).toEqual([])
  })

  it('never writes an account belonging to another profile', async () => {
    // The whole reason the poll's own `account` object is dropped on the floor.
    // Zernio said connected; the account under OUR profile is what gets written,
    // and here there is none.
    state.status = { status: 'connected' }
    state.accounts = [
      { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', platform: 'telegram', profileId: 'someone-elses' },
    ]

    const res = await poll()

    expect(res.status).toBe(502)
    expect(state.rpcCalls).toEqual([])
  })

  it('never writes another PLATFORM’s account either', async () => {
    state.status = { status: 'connected' }
    state.accounts = [
      {
        _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        platform: 'twitter',
        profileId: '6a75cae32853ee463c6419d6',
      },
    ]

    expect((await poll()).status).toBe(502)
    expect(state.rpcCalls).toEqual([])
  })

  it('re-checks the plan at the moment of writing, not only when the code was issued', async () => {
    // Fifteen minutes is long enough for another tab to have filled the last
    // slot. The gate that matters is the one at the write.
    state.status = { status: 'connected' }
    state.slots = { count: 2, keys: new Set<string>() }
    state.limitVerdict = { kind: 'allowed', limit: 2 }

    const res = await poll()

    expect(res.status).toBe(403)
    expect(state.rpcCalls).toEqual([])
  })

  it('still refreshes an account this workspace already holds, over the limit or not', async () => {
    // A refresh consumes no allowance — it updates a row that exists. Without
    // this a full plan would stop Telegram ever being re-recorded.
    state.status = { status: 'connected' }
    state.slots = { count: 2, keys: new Set(['telegram:6a8fcc9477555aae01e7cb9c']) }
    state.limitVerdict = { kind: 'allowed', limit: 2 }

    const res = await poll()

    expect(res.status).toBe(200)
    expect(state.rpcCalls).toEqual(['telegram:6a8fcc9477555aae01e7cb9c'])
  })
})
