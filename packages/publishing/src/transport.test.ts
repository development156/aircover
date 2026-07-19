import { describe, it, expect } from 'vitest'
import { routedTransport } from './transport'

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
