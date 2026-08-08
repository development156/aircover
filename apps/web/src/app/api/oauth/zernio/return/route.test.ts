import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
  clientPresent: true,
  workspace: { id: 'ws-1', name: 'Chai & Chapters' } as { id: string; name: string } | null,
  mapping: { profile_id: '6a75cae32853ee463c6419d6' } as { profile_id: string } | null,
  mappingError: null as { message: string } | null,
  accounts: [
    { accountId: '6a75caf7d0fe733d1afcc1f4', profileId: '6a75cae32853ee463c6419d6' },
  ] as Record<string, unknown>[],
  rpcError: null as { message: string } | null,
  throwOnAuth: false,
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
  reconcileAccounts: () => Promise.resolve(state.accounts),
}))

vi.mock('@sahoda/shared', () => ({ ZERNIO_PLATFORMS: ['instagram'] }))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: state.mapping, error: state.mappingError }),
        }),
      }),
    }),
    rpc: () => Promise.resolve({ error: state.rpcError }),
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
  state.rpcError = null
  state.throwOnAuth = false
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
