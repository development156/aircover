import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
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
  /** Platforms whose `reconcileAccounts` call rejects — a READ failure, not a write one. */
  readThrowsFor: [] as string[],
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
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => {
    if (state.throwOnAuth) throw new Error('clerk exploded')
    return Promise.resolve({ userId: state.userId })
  },
}))

vi.mock('@/lib/zernio/server', () => ({
  zernioClient: () => (state.clientPresent ? {} : null),
}))

vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve(state.workspace),
}))

vi.mock('@/lib/observability/report', () => ({ reportServerError: () => Promise.resolve() }))

vi.mock('@sahoda/publishing', () => ({
  reconcileAccounts: (_client: unknown, args: { platform: string }) => {
    if (state.readThrowsFor.includes(args.platform)) {
      return Promise.reject(new Error(`listAccounts failed for ${args.platform}`))
    }
    return Promise.resolve(state.accountsByPlatform?.[args.platform] ?? state.accounts)
  },
}))

// TWO platforms, not one. A partial outcome cannot exist in a one-platform world,
// so the old single-entry mock could not have caught the collapse this file now pins.
vi.mock('@sahoda/shared', () => ({ ZERNIO_PLATFORMS: ['instagram', 'linkedin'] }))

// The connection count and the plan verdict are mocked as SEAMS, not simulated
// through the supabase mock: this file is about what the route does with an answer,
// and lib/billing/limit-gates.test.ts already pins how the answer is reached.
vi.mock('@/lib/connections/read', () => ({
  connectionKey: (platform: string, accountId: string) => `${platform}:${accountId}`,
  readConnectionSlots: () => Promise.resolve(state.slots),
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
  state.clientPresent = true
  state.workspace = { id: 'ws-1', name: 'Chai & Chapters' }
  state.mapping = { profile_id: '6a75cae32853ee463c6419d6' }
  state.mappingError = null
  state.accounts = [
    { accountId: '6a75caf7d0fe733d1afcc1f4', profileId: '6a75cae32853ee463c6419d6' },
  ]
  state.accountsByPlatform = null
  state.readThrowsFor = []
  state.rpcError = null
  state.rpcErrorByPlatform = null
  state.throwOnAuth = false
  state.slots = { count: 0, keys: new Set<string>() }
  state.limitVerdict = { kind: 'allowed', limit: 8 }
  state.limitCalls = []
  state.rpcCalls = []
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
  it('one platform records and another fails to write', async () => {
    state.rpcErrorByPlatform = { instagram: null, linkedin: { message: 'denied' } }

    const res = await call()

    // Not a success status: the whole point of this route's error shape is that a
    // failure is findable by filtering 4xx/5xx.
    expect(res.status).not.toBe(303)
    expect(res.headers.get('location')).toContain('zernio=partial')
  })

  it('one platform cannot be read at all, and the others still record', async () => {
    state.readThrowsFor = ['linkedin']

    const res = await call()

    expect(res.status).not.toBe(303)
    expect(res.headers.get('location')).toContain('zernio=partial')
  })

  it('a read failure no longer discards the platforms that read fine', async () => {
    // The `Promise.all` version threw here, so the instagram account that WAS read
    // never reached upsert_zernio_connection at all.
    state.readThrowsFor = ['linkedin']

    const res = await call()

    expect(res.headers.get('location')).not.toContain('reason=unexpected')
  })

  it('a platform that read cleanly but held nothing is not "every write failed"', async () => {
    // The path that makes `written === 0 && accounts.length > 0` load-bearing: one
    // platform answers with no accounts, another cannot be read at all. No write is
    // ever attempted, so `written` is 0 — and reporting that as "every write failed"
    // would name the wrong thing entirely.
    state.accountsByPlatform = { instagram: [], linkedin: [] }
    state.readThrowsFor = ['linkedin']

    const res = await call()

    expect(res.headers.get('location')).toContain('zernio=partial')
    expect(res.headers.get('location')).not.toContain('reason=write')
  })

  it('every read failing is a real failure, not "nothing"', async () => {
    state.readThrowsFor = ['instagram', 'linkedin']

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
    state.slots = { count: 0, keys: new Set() }
    state.limitVerdict = { kind: 'allowed', limit: 8 }

    const res = await call()

    expect(state.rpcCalls).toHaveLength(2)
    expect(res.headers.get('location')).toContain('zernio=connected')
  })
})

describe('the query string is still ignored wholesale', () => {
  it('never reads connected/profileId/accountId off the redirect', async () => {
    // doc 13 §3: a wrong accountId does not error, it publishes to someone else and
    // returns 200. The only safe reading of this query string is none at all.
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
