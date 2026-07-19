import { describe, expect, it } from 'vitest'
import { fetchTransport, fixtureTransport, routedTransport } from './transport'

const GET = { method: 'GET', url: 'https://sandbox.cashfree.com/pg/orders/o1' }

describe('fixtureTransport', () => {
  it('replays the recorded status and JSON body', async () => {
    const t = fixtureTransport({ status: 200, body: { order_status: 'PAID' } })

    const res = await t(GET)

    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ order_status: 'PAID' })
  })

  it('replays headers, defaulting to none', async () => {
    expect((await fixtureTransport({ status: 204 })(GET)).headers).toEqual({})
    const withHeaders = fixtureTransport({ status: 200, headers: { 'x-a': 'b' }, body: {} })
    expect((await withHeaders(GET)).headers).toEqual({ 'x-a': 'b' })
  })

  it('yields an empty body when none was recorded', async () => {
    expect((await fixtureTransport({ status: 204 })(GET)).body).toBe('')
  })
})

describe('routedTransport', () => {
  const routes = [
    {
      match: { method: 'POST', urlIncludes: '/pg/orders' },
      response: { status: 200, body: { cf_order_id: 'created' } },
    },
    {
      match: { method: 'GET', urlIncludes: '/pg/orders/' },
      response: { status: 200, body: { order_status: 'PAID' } },
    },
  ]

  it('routes by method and URL substring', async () => {
    const t = routedTransport(routes)

    const created = await t({ method: 'POST', url: 'https://x/pg/orders', body: '{}' })
    const fetched = await t({ method: 'GET', url: 'https://x/pg/orders/o1' })

    expect(JSON.parse(created.body)).toEqual({ cf_order_id: 'created' })
    expect(JSON.parse(fetched.body)).toEqual({ order_status: 'PAID' })
  })

  /**
   * The property this port exists for: a missing fixture must fail loudly. A transport that
   * returned a plausible default would let a test assert success against a call that never
   * happened.
   */
  it('throws on an unmatched request rather than defaulting', async () => {
    const t = routedTransport(routes)

    await expect(t({ method: 'DELETE', url: 'https://x/pg/orders/o1' })).rejects.toThrow(
      /no fixture route matched DELETE/,
    )
  })

  it('throws when no route matches the URL', async () => {
    await expect(
      routedTransport(routes)({ method: 'GET', url: 'https://x/pg/links' }),
    ).rejects.toThrow(/no fixture route matched/)
  })

  it('matches any method when the route omits one', async () => {
    const t = routedTransport([
      { match: { urlIncludes: '/pg/' }, response: { status: 200, body: { ok: true } } },
    ])

    expect((await t({ method: 'PATCH', url: 'https://x/pg/anything' })).status).toBe(200)
  })
})

describe('fetchTransport', () => {
  it('passes method, headers and body through and flattens response headers', async () => {
    const calls: Array<[string, RequestInit]> = []
    const fake: typeof fetch = async (url, init) => {
      calls.push([String(url), init as RequestInit])
      return new Response('{"ok":true}', {
        status: 201,
        headers: { 'x-ratelimit-remaining': '29' },
      })
    }

    const res = await fetchTransport(fake)({
      method: 'POST',
      url: 'https://sandbox.cashfree.com/pg/orders',
      headers: { 'x-api-version': '2025-01-01' },
      body: '{"order_amount":499}',
    })

    expect(calls[0]?.[0]).toBe('https://sandbox.cashfree.com/pg/orders')
    expect(calls[0]?.[1].method).toBe('POST')
    expect(calls[0]?.[1].body).toBe('{"order_amount":499}')
    expect(res.status).toBe(201)
    expect(res.body).toBe('{"ok":true}')
    expect(res.headers['x-ratelimit-remaining']).toBe('29')
  })

  it('returns non-2xx responses rather than throwing (adapters classify)', async () => {
    const fake: typeof fetch = async () =>
      new Response('{"code":"order_already_exists"}', { status: 409 })

    const res = await fetchTransport(fake)({ method: 'POST', url: 'https://x/pg/orders' })

    expect(res.status).toBe(409)
  })
})

/**
 * Node's global fetch has NO default timeout. Without a deadline, a stalled Cashfree upstream
 * leaves a webhook handler holding an open socket until the platform kills it — and every
 * Cashfree redelivery opens another one.
 */
describe('fetchTransport — deadline', () => {
  it('passes an AbortSignal on every request', async () => {
    let seen: RequestInit | undefined
    const fake: typeof fetch = async (_u, init) => {
      seen = init as RequestInit
      return new Response('{}', { status: 200 })
    }

    await fetchTransport({ fetchImpl: fake })({ method: 'GET', url: 'https://x/pg/orders/o1' })

    expect(seen?.signal).toBeInstanceOf(AbortSignal)
  })

  it('aborts a request that outlives the timeout', async () => {
    const stalled: typeof fetch = (_u, init) =>
      new Promise((_resolve, reject) => {
        ;(init as RequestInit).signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })

    await expect(
      fetchTransport({ fetchImpl: stalled, timeoutMs: 20 })({
        method: 'GET',
        url: 'https://x/pg/orders/o1',
      }),
    ).rejects.toThrow()
  })

  it('still accepts a bare fetch impl', async () => {
    const fake: typeof fetch = async () => new Response('{"ok":1}', { status: 200 })

    expect((await fetchTransport(fake)({ method: 'GET', url: 'https://x' })).status).toBe(200)
  })
})
