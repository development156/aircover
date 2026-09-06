import { describe, it, expect } from 'vitest'
import { fetchTransport, routedTransport } from './transport'

const TOKEN_RES = { status: 200, body: { access_token: 'a' } }
const ME_RES = { status: 200, body: { data: { id: '99' } } }

describe('routedTransport — per-call fixture routing for multi-call flows', () => {
  it('routes each request to the fixture whose match applies', async () => {
    const transport = routedTransport([
      { match: { method: 'POST', urlIncludes: '/2/oauth2/token' }, response: TOKEN_RES },
      { match: { method: 'GET', urlIncludes: '/2/users/me' }, response: ME_RES },
    ])

    const token = await transport({ method: 'POST', url: 'https://api.twitter.com/2/oauth2/token' })
    const me = await transport({ method: 'GET', url: 'https://api.twitter.com/2/users/me' })

    expect(JSON.parse(token.body)).toEqual({ access_token: 'a' })
    expect(JSON.parse(me.body)).toEqual({ data: { id: '99' } })
  })

  it('matches on url substring alone when method is omitted', async () => {
    const transport = routedTransport([{ match: { urlIncludes: 'accounts' }, response: TOKEN_RES }])

    const res = await transport({ method: 'GET', url: 'https://api.example/v1/accounts' })

    expect(res.status).toBe(200)
  })

  it('throws a descriptive error for an unmatched request instead of replaying blindly', async () => {
    const transport = routedTransport([
      { match: { method: 'POST', urlIncludes: '/token' }, response: TOKEN_RES },
    ])

    await expect(
      transport({ method: 'GET', url: 'https://api.example/unexpected' }),
    ).rejects.toThrow(/no fixture route/i)
  })

  it('uses the first matching route when several could apply', async () => {
    const transport = routedTransport([
      { match: { urlIncludes: 'api' }, response: TOKEN_RES },
      { match: { urlIncludes: 'api' }, response: ME_RES },
    ])

    const res = await transport({ method: 'GET', url: 'https://api.example/x' })

    expect(JSON.parse(res.body)).toEqual({ access_token: 'a' })
  })
})

/**
 * Node's global fetch has NO default timeout. Every adapter and the Zernio media
 * host go through this transport, and `publish/route.ts` records that a
 * platform kill "leaves no record at all": a stalled socket therefore parks a
 * variant in `publishing` for the whole lease with no log row to reconcile.
 * The billing transport closed this in July; this is the same fix.
 */
describe('fetchTransport — a hard deadline on every request', () => {
  it('passes an AbortSignal on every request', async () => {
    let seen: RequestInit | undefined
    const spy = (async (_url: unknown, init?: RequestInit) => {
      seen = init
      return new Response('ok', { status: 200 })
    }) as unknown as typeof fetch
    await fetchTransport(spy)({ method: 'GET', url: 'https://example.test/x', headers: {} })
    expect(seen?.signal).toBeInstanceOf(AbortSignal)
  })

  it('aborts a request that outlives the timeout', async () => {
    const stalled = ((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted by deadline')))
      })) as unknown as typeof fetch
    await expect(
      fetchTransport({ fetchImpl: stalled, timeoutMs: 20 })({
        method: 'POST',
        url: 'https://example.test/stall',
        headers: {},
      }),
    ).rejects.toThrow('aborted by deadline')
  })

  it('still accepts a bare fetch, the call shape every deps.ts uses today', async () => {
    const spy = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch
    const res = await fetchTransport(spy)({
      method: 'GET',
      url: 'https://example.test',
      headers: {},
    })
    expect(res.status).toBe(204)
  })
})
