import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
  /** The workspace READ failed — distinct from having none. */
  workspaceUnreadable: false,
  clientPresent: true,
  workspace: { id: 'ws-1', name: 'Chai & Chapters' } as { id: string; name: string } | null,
  mapping: { profile_id: '6a75cae32853ee463c6419d6' } as { profile_id: string } | null,
  mappingError: null as { message: string } | null,
  /** What every platform returns, unless `accountsByPlatform` overrides it. */
  accounts: [
    { accountId: '6a75caf7d0fe733d1afcc1f4', profileId: '6a75cae32853ee463c6419d6' },
  ] as Record<string, unknown>[],
  /** Per-platform accounts. Null means "same list for every platform". */
  accountsByPlatform: null as Record<string, Record<string, unknown>[]> | null,
  /**
   * Does the ONE account read fail?
   *
   * ── THIS WAS A PER-PLATFORM LIST AND CANNOT BE ONE ANY MORE ───────────────
   * `readThrowsFor: string[]` let a test fail linkedin's read while instagram's
   * succeeded, because the route made one request PER PLATFORM. It now makes a
   * single `listAccounts` call and filters the result thirteen ways — one
   * request, so exactly one thing to fail, and when it fails every platform is
   * genuinely unreadable.
   *
   * A boolean is the honest shape. Keeping the array would let tests describe a
   * partial read that the route can no longer produce, which is a fixture
   * asserting a fiction.
   */
  readThrows: false,
  rpcError: null as { message: string } | null,
  /** Per-platform write results. Null means `rpcError` applies to all of them. */
  rpcErrorByPlatform: null as Record<string, { message: string } | null> | null,
  throwOnAuth: false,
  /** What this workspace already holds. `null` = the read failed. */
  slots: { count: 0, keys: new Set<string>() } as { count: number; keys: Set<string> } | null,
  /**
   * The channels verdict. Default is deliberately roomy (Agency's 8) so every test
   * written before the plan gate existed still exercises the path it was written for.
   */
  limitVerdict: { kind: 'allowed', limit: 8 } as
    | { kind: 'allowed'; limit: number }
    | { kind: 'blocked'; sentence: string }
    | { kind: 'unknown' },
  /** `currentUsage` the route asked the gate about, in order. */
  limitCalls: [] as number[],
  /** Every upsert the route actually ATTEMPTED, as `platform:accountId`. */
  rpcCalls: [] as string[],
  /**
   * What the customer pressed Connect on, as the start route recorded it.
   *
   * Defaults to a roomy `instagram` press so every test written before the
   * create-scoping existed still exercises the path it was written for — the same
   * move `limitVerdict` above makes. `null` is the replayed-URL case.
   */
  pending: { platform: 'instagram', mode: 'redirect' } as {
    platform: string
    mode: string
  } | null,
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => {
    if (state.throwOnAuth) throw new Error('clerk exploded')
    return Promise.resolve({ userId: state.userId })
  },
}))

/**
 * ── THE CLIENT NOW HAS A REAL METHOD, BECAUSE THE ROUTE CALLS ONE ───────────
 * It was `{}`. The route used to reach Zernio only through `reconcileAccounts`,
 * which this file mocked wholesale, so an empty object was enough. The route now
 * fetches the account list ITSELF, once, and filters it thirteen ways — so
 * `listAccounts` has to exist and has to answer in ZERNIO'S SHAPE: `_id`, and a
 * `platform` spelled the way Zernio spells it.
 *
 * That shape is what makes the vocabulary guard real rather than notional. The
 * fixtures below are written in our vocabulary and translated on the way out, so
 * a route that asked for `x` instead of `twitter` genuinely finds nothing here,
 * exactly as it genuinely found nothing in production.
 */
const ZERNIO_NAME: Record<string, string> = { x: 'twitter', gbp: 'googlebusiness' }

vi.mock('@/lib/zernio/server', () => ({
  zernioClient: () =>
    state.clientPresent
      ? {
          listAccounts: () => {
            // ONE read for every platform, so ONE way for it to fail. See the
            // note on `readThrows`.
            if (state.readThrows) return Promise.reject(new Error('listAccounts failed'))
            return Promise.resolve(
              MOCK_PLATFORMS.flatMap((ours) => {
                // A per-platform fixture is EXHAUSTIVE: a platform it does not
                // mention has no accounts. It used to fall through to the default
                // list, which was invisible while the fixture named every platform
                // there was — and became wrong the moment a third one existed.
                const per = state.accountsByPlatform
                const list = per ? (per[ours] ?? []) : state.accounts
                return list.map((a) => ({
                  _id: (a as { accountId?: string }).accountId,
                  platform: ZERNIO_NAME[ours] ?? ours,
                  // Fixtures written before the profile filter mattered omit it.
                  // Defaulting to the workspace's own profile keeps them meaning
                  // what they meant; a test about the tenant boundary sets it.
                  profileId: (a as { profileId?: string }).profileId ?? state.mapping?.profile_id,
                }))
              }),
            )
          },
        }
      : null,
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

vi.mock('@/lib/observability/report', () => ({ reportServerError: () => Promise.resolve() }))

/**
 * ── THIS MOCK IS KEYED ON ZERNIO'S NAME, AND THAT IS THE POINT ──────────────
 * It read `args.platform` and the real function's parameter is now
 * `zernioPlatform`, so the rename turned every lookup into `undefined` and eight
 * tests went red. That is the mock doing its job: it proves the route's argument
 * is genuinely exercised here rather than passed into a black hole.
 *
 * The fixture keys stay OUR ids because the tests are written in our vocabulary,
 * so the mock translates on the way in — the same direction the route does, and
 * `askedFor` below records what it was actually handed so a test can check it.
 */
vi.mock('@sahoda/publishing', () => ({
  /**
   * A FAITHFUL REIMPLEMENTATION, not a lookup table. The real function filters
   * `account.platform === args.zernioPlatform` and then re-checks the profile,
   * and both filters are the thing under test here: the first is what made a
   * live X connect invisible, the second is the tenant boundary.
   *
   * Written out rather than keyed off a fixture map on purpose. A mock that
   * returned "whatever was asked for" would pass whichever spelling the route
   * used, which is precisely the blind spot that let the bug ship.
   */
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
// TWO platforms, not one. A partial outcome cannot exist in a one-platform world,
// so the old single-entry mock could not have caught the collapse this file now pins.
// THREE platforms, and the third is load-bearing. It was `['instagram','linkedin']`
// — the only two channels whose id is identical to Zernio's name — so this file
// could not have caught a route that passed OUR id to `reconcileAccounts`. It
// didn't, and a customer's real X connect vanished because of it. `x` is here so
// the vocabulary gap sits INSIDE the fixture rather than outside it.
// `isZernioPlatform`
// is derived from the same short list rather than restated — a mock that answered
// `true` for everything would make the allowlist test pass without an allowlist.
const MOCK_PLATFORMS = ['instagram', 'linkedin', 'x']
vi.mock('@sahoda/shared', () => ({
  ZERNIO_PLATFORMS: MOCK_PLATFORMS,
  isZernioPlatform: (value: unknown) => MOCK_PLATFORMS.includes(value as string),
}))

// The connection count and the plan verdict are mocked as SEAMS, not simulated
// through the supabase mock: this file is about what the route does with an answer,
// and lib/billing/limit-gates.test.ts already pins how the answer is reached.
vi.mock('@/lib/connections/read', () => ({
  connectionKey: (platform: string, accountId: string) => `${platform}:${accountId}`,
  readConnectionSlots: () => Promise.resolve(state.slots),
}))

// A SEAM, like the slot count and the plan verdict beside it. What the cookie
// looks like on the wire is `pending-connect.test.ts`'s job; this file is about
// what the ROUTE does with the answer.
vi.mock('@/lib/connections/pending-connect', () => ({
  CLEAR_PENDING_CONNECT: 'sahoda_connect=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
  readPendingConnect: () => Promise.resolve(state.pending),
}))

vi.mock('@/lib/billing/entitlements', () => ({
  checkCountableLimit: (_workspaceId: string, _dimension: string, currentUsage: number) => {
    state.limitCalls.push(currentUsage)
    return Promise.resolve(state.limitVerdict)
  },
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
    rpc: (_fn: string, args: { p_platform: string; p_external_account: { id: string } }) => {
      state.rpcCalls.push(`${args.p_platform}:${args.p_external_account.id}`)
      return Promise.resolve({
        error: state.rpcErrorByPlatform
          ? (state.rpcErrorByPlatform[args.p_platform] ?? null)
          : state.rpcError,
      })
    },
  }),
}))

const { GET } = await import('./route')

const call = () =>
  GET(new Request('https://app.sahodalabs.com/api/oauth/zernio/return?connected=1'))

beforeEach(() => {
  state.userId = 'user_1'
  state.workspaceUnreadable = false
  state.clientPresent = true
  state.workspace = { id: 'ws-1', name: 'Chai & Chapters' }
  state.mapping = { profile_id: '6a75cae32853ee463c6419d6' }
  state.mappingError = null
  state.accounts = [
    { accountId: '6a75caf7d0fe733d1afcc1f4', profileId: '6a75cae32853ee463c6419d6' },
  ]
  state.accountsByPlatform = null
  state.readThrows = false
  state.rpcError = null
  state.rpcErrorByPlatform = null
  state.throwOnAuth = false
  state.slots = { count: 0, keys: new Set<string>() }
  state.limitVerdict = { kind: 'allowed', limit: 8 }
  state.limitCalls = []
  state.rpcCalls = []
  state.pending = { platform: 'instagram', mode: 'redirect' }
})

/**
 * The collapse this describe block exists for.
 *
 * The route recorded each account in a loop, swallowed a per-account failure with
 * `continue`, and then asked ONE question: `written === 0`. So one platform
 * succeeding masked every other platform failing — the customer was told
 * "connected", the row they were expecting was never written, and the only trace
 * was a Sentry event nobody was watching. A 303 also kept it out of the 4xx/5xx log
 * filter this route was specifically rebuilt to be visible in.
 *
 * The read side collapsed harder still: `reconcileAccounts` ran inside a
 * `Promise.all`, so one platform's `listAccounts` throwing discarded the successful
 * reads for every other platform and left as a generic `unexpected`.
 *
 * Found by audit on 2026-08-10 while investigating post f0a777cf. It was NOT that
 * post's cause — Zernio genuinely holds no LinkedIn account for that profile, which
 * a read-only `GET /accounts` settled — but it is the reason that investigation
 * could not be closed from the database alone: a dropped write and an absent
 * account are byte-identical afterwards.
 */
describe('a partial connect is reported as partial, never as connected', () => {
  /**
   * RETARGETED, not weakened. Every test below drives a trip that touches TWO
   * platforms, and a single press of Connect now only ever CREATES a row for the
   * platform it named — so a two-platform trip is a trip that REFRESHES two rows
   * this workspace already holds. That is a real and common trip (it is what the
   * self-heal was always about), and the guarantee under test is unchanged: one
   * platform succeeding must never be reported as though both did.
   */
  beforeEach(() => {
    state.slots = {
      count: 2,
      keys: new Set(['instagram:6a75caf7d0fe733d1afcc1f4', 'linkedin:6a75caf7d0fe733d1afcc1f4']),
    }
  })

  it('one platform records and another fails to write', async () => {
    state.rpcErrorByPlatform = { instagram: null, linkedin: { message: 'denied' } }

    const res = await call()

    // Not a success status: the whole point of this route's error shape is that a
    // failure is findable by filtering 4xx/5xx.
    expect(res.status).not.toBe(303)
    expect(res.headers.get('location')).toContain('zernio=partial')
  })

  it('a failed read is all-or-nothing now, and says so', async () => {
    // RETARGETED. This asserted "one platform cannot be read at all, and the
    // others still record" — a partial READ. The route made one request per
    // platform then, so that state existed. It now makes a SINGLE
    // `listAccounts` call and filters the result, because thirteen identical
    // requests per connect was burning a 60-per-minute rate limit.
    //
    // So there is one read and one way for it to fail, and when it fails no
    // platform was read. Asserting the old partial would be asserting a state
    // the route can no longer reach. The claim that survives is the important
    // one: a read that failed is never reported as a read that found nothing.
    state.readThrows = true

    const res = await call()

    expect(res.status).not.toBe(303)
    expect(res.headers.get('location')).toContain('zernio=error')
    expect(res.headers.get('location')).toContain('reason=read')
    expect(res.headers.get('location')).not.toContain('zernio=nothing')
  })

  it('a failed read writes nothing at all, rather than half of something', async () => {
    // The other half of the same guarantee, and the one with a customer cost:
    // the old `Promise.all` threw on the first rejection and discarded accounts
    // that had already been read successfully. Nothing is read now, so nothing
    // is written — and `reason=unexpected`, the generic outcome that failure
    // used to hide behind, must not appear.
    state.readThrows = true

    const res = await call()

    expect(state.rpcCalls).toEqual([])
    expect(res.headers.get('location')).not.toContain('reason=unexpected')
  })

  it('a platform that read cleanly but held nothing is not "every write failed"', async () => {
    // The path that makes `written === 0 && accounts.length > 0` load-bearing: one
    // platform answers with no accounts, another cannot be read at all. No write is
    // ever attempted, so `written` is 0 — and reporting that as "every write failed"
    // would name the wrong thing entirely.
    //
    // RETARGETED off a read failure and onto the PLAN LIMIT, which is the other
    // path to the same state and the one that still exists. A read failure can
    // no longer be partial (see above), but a plan with no headroom still leaves
    // `accounts.length > 0` while `attempted` stays 0 — exactly the condition
    // `written === 0 && attempted > 0` was written to distinguish.
    state.slots = { count: 2, keys: new Set() }
    state.limitVerdict = { kind: 'blocked', sentence: 'Your Free plan includes 2 channels.' }

    const res = await call()

    // Not "every write failed". No write was ever attempted.
    expect(res.headers.get('location')).not.toContain('reason=write')
    expect(res.headers.get('location')).toContain('zernio=limit')
    expect(state.rpcCalls).toEqual([])
  })

  it('every read failing is a real failure, not "nothing"', async () => {
    // DERIVED, not the two names it used to list. The claim is "EVERY read
    // failed", and spelling that as a literal pair meant adding a third platform
    // to the fixture silently turned this into "two of three failed" — which is
    // the `partial` path, not this one. The assertion below still passed for
    // three of the four tests that had the same literal, which is exactly how a
    // stale list survives.
    state.readThrows = true

    const res = await call()

    expect(res.status).toBe(500)
    expect(res.headers.get('location')).toContain('reason=read')
    // "nothing" claims we asked and Zernio had none. We never successfully asked.
    expect(res.headers.get('location')).not.toContain('zernio=nothing')
  })

  it('no accounts anywhere, with every read fine, is still "nothing"', async () => {
    // The legitimate case, and the one a real profile is in: a workspace that
    // connected Instagram and nothing else. This must not become an error.
    state.accounts = []

    const res = await call()

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('zernio=nothing')
  })

  it('all accounts recording is still a plain connected', async () => {
    const res = await call()

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('zernio=connected')
  })
})

/**
 * The regression this file exists for.
 *
 * Every outcome used to leave as 303. A failed connect was therefore indistinguishable
 * from a working one in production logs — filtering this route by 4xx/5xx returned
 * nothing, which read as "no connect failures" and was not true.
 */
describe('a failed connect answers with a real error status, never 303', () => {
  it.each([
    [
      'not signed in',
      () => {
        state.userId = null
      },
      401,
      'signin',
    ],
    [
      'rail not provisioned',
      () => {
        state.clientPresent = false
      },
      503,
      'unavailable',
    ],
    [
      'no workspace',
      () => {
        state.workspace = null
      },
      400,
      'no-workspace',
    ],
    [
      'profile lookup failed',
      () => {
        state.mappingError = { message: 'boom' }
      },
      500,
      'lookup',
    ],
    [
      'every write failed',
      () => {
        state.rpcError = { message: 'denied' }
      },
      500,
      'write',
    ],
    [
      'unexpected throw',
      () => {
        state.throwOnAuth = true
      },
      500,
      'unexpected',
    ],
  ])('%s → HTTP %s', async (_name, arrange, expected, reason) => {
    arrange()
    const res = await call()

    expect(res.status).toBe(expected)
    expect(res.status).not.toBe(303)
    // The reason survives, so a log reader can tell the causes apart.
    expect(res.headers.get('location')).toContain(`reason=${reason}`)
    // And it is an outright failure, not the partial outcome — the two share the
    // 5xx status on purpose, so only this word tells them apart.
    expect(res.headers.get('location')).toContain('zernio=error')
  })

  it('still lands the customer on /connections rather than stranding them', async () => {
    state.userId = null
    const res = await call()
    const body = await res.text()

    expect(res.headers.get('content-type')).toContain('text/html')
    expect(body).toContain('http-equiv="refresh"')
    expect(body).toContain('/connections?zernio=error&amp;reason=signin')
    // A real link too, for anything that ignores meta-refresh.
    expect(body).toMatch(/<a href="[^"]*\/connections[^"]*">/)
  })

  it('escapes the URL it embeds — the body is HTML, not a header', async () => {
    state.userId = null
    const body = await (await call()).text()
    // A raw `&` between query params would be invalid in an HTML attribute.
    expect(body).not.toContain('zernio=error&reason=')
    expect(body).toContain('&amp;')
  })
})

describe('real outcomes keep their 303', () => {
  it('a recorded connection redirects with zernio=connected', async () => {
    const res = await call()
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('zernio=connected')
  })

  it('no accounts is "nothing", not an error — the user may have simply cancelled', async () => {
    state.accounts = []
    const res = await call()
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('zernio=nothing')
  })

  it('returning without ever starting is "nothing", not an error', async () => {
    state.mapping = null
    const res = await call()
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('reason=no-profile')
  })
})

/**
 * The channels plan limit.
 *
 * Free allows 2 channels and this loop wrote every account Zernio returned, so a
 * free workspace could hold all four platforms. The fix has to be careful: by the
 * time this route runs the account is ALREADY connected on Zernio's side, so
 * refusing the trip would strand it exactly the way this file's other tests exist to
 * prevent. It admits up to the limit instead, and says so.
 */
describe('the channels plan limit', () => {
  const IG = 'instagram:6a75caf7d0fe733d1afcc1f4'
  const LI = 'linkedin:6a75caf7d0fe733d1afcc1f4'
  /** Two DIFFERENT Instagram accounts — two rows, two slots, one channel. */
  const IG_A = '6a75caf7d0fe733d1afcc1f4'
  const IG_B = '6a75cb0be1ff844e2bfdd205'

  it('a full plan writes nothing new and says the plan is full — not that it failed', async () => {
    state.slots = { count: 2, keys: new Set() }
    state.limitVerdict = { kind: 'blocked', sentence: 'Your Free plan includes 2 channels.' }

    const res = await call()

    // ⚠ MUTATION WITNESS. Delete the headroom check in the write loop and this
    // fails: both accounts are written on a plan with room for neither.
    expect(state.rpcCalls).toEqual([])
    // A 303, not a 5xx. Nothing went wrong — we declined to write.
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('zernio=limit')
    expect(res.headers.get('location')).not.toContain('zernio=error')
  })

  it('admits up to the limit and reports the remainder, rather than all-or-nothing', async () => {
    // Room for exactly one more; Zernio returns two new accounts.
    //
    // RETARGETED to two accounts on ONE platform, which is both what a single
    // press can now create and the case this screen was rebuilt for: a slot holds
    // an ACCOUNT, so two Instagram accounts draw two slots. The partition being
    // tested — admit up to the headroom, report the rest — is unchanged.
    state.accountsByPlatform = {
      instagram: [{ accountId: IG_A }, { accountId: IG_B }],
      linkedin: [],
    }
    state.slots = { count: 1, keys: new Set() }
    state.limitVerdict = { kind: 'allowed', limit: 2 }

    const res = await call()

    expect(state.rpcCalls).toHaveLength(1)
    expect(res.headers.get('location')).toContain('zernio=limit')
  })

  it('a REFRESH of an account we already hold is written even with zero headroom', async () => {
    // This is the documented self-heal. Both accounts are already ours, so writing
    // them creates no row and consumes no allowance — treating them as new would
    // break re-entry into this route for every workspace sitting at its limit.
    state.slots = { count: 2, keys: new Set([IG, LI]) }
    state.limitVerdict = { kind: 'blocked', sentence: 'Your Free plan includes 2 channels.' }

    const res = await call()

    expect(state.rpcCalls.sort()).toEqual([IG, LI].sort())
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('zernio=connected')
  })

  it('the gate is asked about the REAL connection count', async () => {
    state.slots = { count: 3, keys: new Set() }

    await call()

    expect(state.limitCalls).toEqual([3])
  })

  it('an unreadable connection count fails closed — nothing is written', async () => {
    state.slots = null

    const res = await call()

    // Without the count there is no way to tell a refresh from a new row, and
    // writing blind is the hole being closed. The next trip reconciles.
    expect(state.rpcCalls).toEqual([])
    expect(res.status).toBe(500)
    expect(res.headers.get('location')).toContain('reason=slots')
  })

  it('an unanswerable plan admits no new channel', async () => {
    state.slots = { count: 0, keys: new Set() }
    state.limitVerdict = { kind: 'unknown' }

    const res = await call()

    expect(state.rpcCalls).toEqual([])
    expect(res.headers.get('location')).toContain('zernio=limit')
  })

  it('a plan with room is invisible: every account is still recorded', async () => {
    // Two Instagram accounts, both new, plenty of room. Retargeted onto one
    // platform for the reason given above.
    state.accountsByPlatform = {
      instagram: [{ accountId: IG_A }, { accountId: IG_B }],
      linkedin: [],
    }
    state.slots = { count: 0, keys: new Set() }
    state.limitVerdict = { kind: 'allowed', limit: 8 }

    const res = await call()

    expect(state.rpcCalls).toHaveLength(2)
    expect(res.headers.get('location')).toContain('zernio=connected')
  })
})

/**
 * THE DISCONNECT THAT WOULD NOT STICK.
 *
 * Reported as "when you disconnect and connect again the other platforms get
 * connected automatically". The mechanism, in four steps:
 *
 *   1. the customer disconnects LinkedIn — `disconnectConnection` deletes our row
 *   2. Zernio still holds that account. There is no removal endpoint wired, and
 *      the client in packages/publishing exposes no method that could call one
 *   3. the customer connects Instagram
 *   4. this route asked Zernio for EVERY platform and wrote back everything it
 *      found, so LinkedIn reappeared, connected, having been deliberately removed
 *
 * The rule that closes it: a row is only ever CREATED for the platform the
 * customer pressed. Refreshing rows we already hold is untouched, so the
 * self-heal this route was built around still works.
 */
describe('a connect only ever creates a row for the platform that was pressed', () => {
  const IG_ID = '6a75caf7d0fe733d1afcc1f4'

  it('does not resurrect a platform the customer disconnected', async () => {
    // Instagram was pressed. LinkedIn is still live at Zernio because we cannot
    // remove it there, and we hold no row for it because the customer removed it.
    state.pending = { platform: 'instagram', mode: 'redirect' }
    state.slots = { count: 0, keys: new Set() }

    const res = await call()

    // The whole assertion. `linkedin` must not appear at all.
    expect(state.rpcCalls).toEqual([`instagram:${IG_ID}`])
    expect(state.rpcCalls.some((c) => c.startsWith('linkedin:'))).toBe(false)
    // And it is a plain success: nothing was refused and nothing failed.
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('zernio=connected')
  })

  it('still refreshes every account we already hold, whatever platform it is on', async () => {
    // The self-heal, which must survive the fix. LinkedIn is ours already, so it
    // is a refresh — a token that moved or an expiry that shifted still lands.
    state.pending = { platform: 'instagram', mode: 'redirect' }
    state.slots = {
      count: 2,
      keys: new Set([`instagram:${IG_ID}`, `linkedin:${IG_ID}`]),
    }

    await call()

    expect(state.rpcCalls.sort()).toEqual([`instagram:${IG_ID}`, `linkedin:${IG_ID}`].sort())
  })

  it('creates nothing at all when there is no record of a press', async () => {
    // A bookmarked replay of this URL, or a cookie that expired mid-consent.
    // Fail closed: pressing Connect again costs one click, whereas creating here
    // costs the customer the disconnect they asked for, silently.
    state.pending = null
    state.slots = { count: 0, keys: new Set() }

    const res = await call()

    expect(state.rpcCalls).toEqual([])
    // NOT an error. Nothing went wrong and nothing was refused by the plan.
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).not.toContain('zernio=error')
  })

  it('refreshes on a replay even though it creates nothing', async () => {
    // The half of the self-heal that survives with no cookie: rows we hold are
    // still brought up to date. Only creation needs a press behind it.
    state.pending = null
    state.slots = { count: 1, keys: new Set([`linkedin:${IG_ID}`]) }

    await call()

    expect(state.rpcCalls).toEqual([`linkedin:${IG_ID}`])
  })

  it('a skipped platform is not reported as a plan refusal or a failure', async () => {
    // It is neither: the plan had room and no write failed. Reporting it would put
    // correct behaviour into the failure channel this route exists to keep clean.
    state.pending = { platform: 'instagram', mode: 'redirect' }
    state.slots = { count: 0, keys: new Set() }
    state.limitVerdict = { kind: 'allowed', limit: 8 }

    const res = await call()

    const location = res.headers.get('location') ?? ''
    expect(location).not.toContain('zernio=limit')
    expect(location).not.toContain('zernio=partial')
    expect(location).toContain('zernio=connected')
  })

  it('spends the pending-connect cookie on the way out, on success and on failure', async () => {
    // One press authorises one create pass. A cookie that survived the trip would
    // let the next replay re-create the row the customer just disconnected.
    const okRes = await call()
    expect(okRes.headers.get('set-cookie')).toContain('Max-Age=0')

    state.readThrows = true
    const failRes = await call()
    expect(failRes.status).toBe(500)
    expect(failRes.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})

/**
 * THE POPUP THAT WOULD NOT CLOSE.
 *
 * Reported with a screenshot: the popup finished signing in and then loaded the
 * WHOLE APP at `/connections?zernio=connected` inside a 620px window, while the
 * opener sat on "Opening…" forever.
 *
 * The cause is upstream of us. Google's sign-in serves
 * `Cross-Origin-Opener-Policy: same-origin`, which moves the popup into a new
 * browsing context group and severs `window.opener` for good — returning to our
 * own origin afterwards does not bring it back. The closer's opener check
 * therefore failed, and its fallback was `location.replace(...)`.
 *
 * Both halves of the fix are pinned here: signal on a channel COOP cannot reach,
 * and never load the app into the popup again.
 */
describe('the popup closer does not depend on window.opener', () => {
  const popupCall = () => {
    state.pending = { platform: 'instagram', mode: 'popup' }
    return call()
  }

  it('signals over BroadcastChannel, which is scoped by origin', async () => {
    const body = await (await popupCall()).text()

    // THE ASSERTION THAT MATTERS. `opener.postMessage` alone was the bug: COOP
    // cuts it and nothing arrives.
    expect(body).toContain('new BroadcastChannel("sahoda-connect")')
    expect(body).toContain('sahoda:connect-outcome')
  })

  it('still tries the opener, for the case where the chain survived', async () => {
    const body = await (await popupCall()).text()
    expect(body).toContain('window.opener.postMessage')
    // Never a wildcard target — that would post the outcome to whatever happened
    // to open this window.
    expect(body).toContain('window.location.origin')
    expect(body).not.toContain("'*'")
  })

  it('NEVER navigates the popup to the app', async () => {
    const body = await (await popupCall()).text()

    // The exact fallback that produced the reported screenshot. `window.close()`
    // can also be refused once COOP has changed the browsing context group, so
    // the page has to stand on its own instead of loading the product into a
    // window too small to use it.
    expect(body).not.toContain('location.replace')
    expect(body).toContain('window.close()')
  })

  it('says what happened in one sentence, and offers a link rather than a redirect', async () => {
    const body = await (await popupCall()).text()

    expect(body).toContain('Connected. You can close this window.')
    // A link the customer may take, not a navigation taken for them.
    expect(body).toContain('Open Connections')
  })

  it('tells the truth when the trip failed, and keeps the failing status', async () => {
    state.pending = { platform: 'instagram', mode: 'popup' }
    state.readThrows = true

    const res = await call()
    const body = await res.text()

    // A popup does not change what happened, so it does not change the status.
    expect(res.status).toBe(500)
    expect(body).toContain('didn’t finish')
    expect(body).not.toContain('Connected. You can close')
  })

  /**
   * THE BLIND SPOT THIS BLOCK HAD, AND WHY EVERY FIX ABOVE LOOKED LIKE IT WORKED.
   *
   * Every assertion above reads `res.text()`, which returns the body whatever the
   * status line says. The route served this page as a **303 with a `Location`
   * header** — a redirect, which a browser FOLLOWS. The body was never rendered
   * and none of that carefully-argued script ever ran. So the COOP fix, the
   * BroadcastChannel fix and the query-parameter fix all passed their tests and
   * all did nothing, four reports in a row, because no test here ever asked
   * whether the response could be displayed at all.
   */
  it('is a page the browser will RENDER, not a redirect it will follow', async () => {
    const res = await popupCall()

    // 3xx means the browser leaves before the script runs. That is the defect.
    expect(res.status).toBeLessThan(300)
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('sends no Location on a FAILED popup either, and keeps the 5xx', async () => {
    // A 4xx/5xx Location is not followed, so this one was harmless — but the
    // header has no reader in a popup and leaving it is how the success path got
    // one. The failing status still has to survive: this route exists because a
    // failure leaving as a success was invisible to a log filter.
    state.pending = { platform: 'instagram', mode: 'popup' }
    state.readThrows = true

    const res = await call()

    expect(res.status).toBe(500)
    expect(res.headers.get('location')).toBeNull()
  })

  it('is used ONLY for a popup — a redirect trip still gets its 303', async () => {
    state.pending = { platform: 'instagram', mode: 'redirect' }

    const res = await call()

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toContain('zernio=connected')
    expect(await res.text()).toBe('')
  })
})

/**
 * THE INTENT NOW ARRIVES TWO WAYS, AND EITHER IS ENOUGH.
 *
 * The cookie kept not surviving our origin -> Zernio -> Google -> Zernio -> us,
 * and two reported defects came out of that one absence: the popup got a 303 and
 * loaded the app inside itself, and create-scoping fell to its fail-closed branch
 * so a genuine connect wrote no row. These tests pin the fallback with the cookie
 * ABSENT, because that is the condition it exists for.
 */
/**
 * THE BUG THAT MADE A REAL CONNECT VANISH, GUARDED AT THE ROUTE.
 *
 * `reconcileAccounts` filters `account.platform === …` against a string ZERNIO
 * writes. This route passed OUR channel id. MEASURED 2026-08-26 against the live
 * API: a customer's X account, created minutes after they pressed Connect, reads
 * `"platform": "twitter"` — so asking for `'x'` matched nothing, no row was
 * written, and the screen said "Not connected" over a grant that had succeeded.
 *
 * Instagram and LinkedIn were unaffected, and that is why nobody caught it: for
 * those two the two names are the same string.
 *
 * ── WHY THIS ASSERTS `askedFor` AND NOT AN OUTCOME ──────────────────────────
 * An outcome assertion cannot see this. The fixture translates Zernio's name back
 * to ours so the test data stays readable, so a route passing `'x'` and a route
 * passing `'twitter'` both end up at the same fixture key and both produce the
 * same rows. MEASURED: with the defect restored, all 49 tests in this file still
 * passed. The only thing that separates right from wrong here is the string the
 * route actually handed over, so that is what is checked.
 */
describe('the route asks Zernio in Zernio’s own vocabulary', () => {
  const ACC = '6a75caf7d0fe733d1afcc1f4'
  /** Everything already ours, so create-scoping is not the thing under test. */
  const allHeld = () => ({
    count: 3,
    keys: new Set(MOCK_PLATFORMS.map((p) => `${p}:${ACC}`)),
  })

  it('records the X account that Zernio stores as "twitter"', async () => {
    // THE REGRESSION, asserted through an OUTCOME rather than a spy.
    //
    // `listAccounts` answers in Zernio's shape and `reconcileFromAccounts` is a
    // faithful copy of the real filter, so a route that asked for `x` finds
    // nothing here for the same reason it found nothing in production: the
    // account is stored under `twitter`. No row is written and this fails.
    //
    // MEASURED 2026-08-26 — the customer's real account, created minutes after
    // they pressed Connect: { "_id": "6a8f392d…", "platform": "twitter" }.
    //
    // `pending` is X because create-scoping only ever creates the platform that
    // was pressed. That rule is not what is being tested; it is what makes the
    // fixture honest about a real single-platform press.
    state.pending = { platform: 'x', mode: 'redirect' }
    state.slots = { count: 0, keys: new Set() }

    await call()

    expect(state.rpcCalls.some((c) => c.startsWith('x:'))).toBe(true)
  })

  it('leaves the names that already agree alone', async () => {
    // The translation must not invent a difference where there is none.
    // Instagram and LinkedIn are spelled identically on both sides and are the
    // two channels that worked throughout; a mapping that mangled them would
    // break the only part of this flow that was never broken.
    //
    // Every account is already held, so all three are REFRESHES and reach the
    // write regardless of which platform was pressed.
    state.slots = allHeld()

    await call()

    expect(state.rpcCalls.some((c) => c.startsWith('instagram:'))).toBe(true)
    expect(state.rpcCalls.some((c) => c.startsWith('linkedin:'))).toBe(true)
  })

  it('reaches every platform from ONE read', async () => {
    // The point of the change. Three platforms are reconciled from a single
    // `listAccounts` call, and a translation that returned null for one would
    // drop it silently — the quiet direction this route must never fail in.
    state.slots = allHeld()

    await call()

    expect(state.rpcCalls).toHaveLength(MOCK_PLATFORMS.length)
  })
})

describe('the intent survives a lost cookie, because it also rides in the URL', () => {
  const IG_ID = '6a75caf7d0fe733d1afcc1f4'
  const withParams = (query: string) =>
    GET(new Request(`https://app.sahodalabs.com/api/oauth/zernio/return?${query}`))

  it('closes the popup on the URL alone', async () => {
    state.pending = null

    const res = await withParams('connected=1&mode=popup&platform=instagram')

    // Not a 303. A redirect is what the popup was getting, and it is why it
    // showed a second copy of /connections instead of shutting.
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('BroadcastChannel')
  })

  it('authorises the create on the URL alone', async () => {
    // The louder half. Without this the customer presses Connect, approves at the
    // platform, and nothing lands in our table at all.
    state.pending = null
    state.slots = { count: 0, keys: new Set() }

    await withParams('connected=1&platform=instagram')

    expect(state.rpcCalls).toEqual([`instagram:${IG_ID}`])
  })

  it('still SCOPES that create — it does not open the door to every platform', async () => {
    // The disconnect-then-reconnect fix has to survive the fallback. LinkedIn is
    // live at Zernio and deliberately not ours; pressing Instagram must not
    // bring it back.
    state.pending = null
    state.slots = { count: 0, keys: new Set() }

    await withParams('connected=1&platform=instagram')

    expect(state.rpcCalls.some((c) => c.startsWith('linkedin:'))).toBe(false)
  })

  it('refuses a platform that is not on the allowlist', async () => {
    // Validated, not passed through. An unknown string is the fail-closed branch.
    state.pending = null
    state.slots = { count: 0, keys: new Set() }

    await withParams('connected=1&platform=myspace')

    expect(state.rpcCalls).toEqual([])
  })

  it('the cookie still wins when it did arrive', async () => {
    // The parameter is a fallback, never an override. A forged one must not be
    // able to redirect a create the cookie already scoped.
    state.pending = { platform: 'instagram', mode: 'redirect' }
    state.slots = { count: 0, keys: new Set() }

    await withParams('connected=1&platform=linkedin')

    expect(state.rpcCalls).toEqual([`instagram:${IG_ID}`])
  })

  it('a missing mode is still a redirect', async () => {
    state.pending = null

    const res = await withParams('connected=1&platform=instagram')

    expect(res.status).toBe(303)
    expect(await res.text()).toBe('')
  })
})

describe('the query string is read for intent and NOTHING else', () => {
  it('never reads connected/profileId/accountId off the redirect', async () => {
    // doc 13 §3: a wrong accountId does not error, it publishes to someone else and
    // returns 200. `mode` and `platform` are ours and are read; every id on this
    // URL still is not, and that is the line — a channel NAME from a five-item
    // allowlist cannot name another tenant's account, an id can.
    const res = await GET(
      new Request(
        'https://app.sahodalabs.com/api/oauth/zernio/return' +
          '?connected=1&profileId=deadbeefdeadbeefdeadbeef&accountId=facefacefacefacefaceface',
      ),
    )
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).not.toContain('deadbeef')
    expect(res.headers.get('location')).not.toContain('faceface')
  })
})

/**
 * THE STATUS LINE IS THIS ROUTE'S WHOLE OBSERVABILITY STORY.
 *
 * This file exists in its current shape because a failed connect leaving as a
 * 303 was invisible to a 4xx/5xx log filter — twenty-four hours of logs could
 * not answer whether a customer had failed to connect. A 400 on a read that
 * BROKE is the same lie one class down: it says the request was wrong when our
 * database did not answer, so the outage reads as a client error.
 *
 * Run 23 named the handlers as unaudited. This is what that gap held.
 */
describe('a broken workspace read is not a missing workspace', () => {
  it('answers 400 when the account genuinely has none', async () => {
    state.workspace = null

    const res = await call()

    expect(res.status).toBe(400)
    expect(res.headers.get('location')).toContain('reason=no-workspace')
  })

  it('answers 503, not 400, when the workspace read failed', async () => {
    state.workspaceUnreadable = true

    const res = await call()

    // 5xx: ours, transient, and a log filter must see it.
    expect(res.status).toBe(503)
    expect(res.headers.get('location')).toContain('reason=workspace-unreadable')
    // The VISIBLE status stays `error`, because ConnectOutcomeNotice matches an
    // allowlist and renders nothing for a value it does not know — a sixth
    // status here would have shown the customer no notice at all.
    expect(res.headers.get('location')).toContain('zernio=error')
  })

  it('the two answers are not the same answer', async () => {
    state.workspace = null
    const none = await call()
    state.workspace = { id: 'ws-1', name: 'W' }
    state.workspaceUnreadable = true
    const unreadable = await call()

    expect(none.status).not.toBe(unreadable.status)
  })
})
