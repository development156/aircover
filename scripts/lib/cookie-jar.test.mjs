/**
 * The cookie jar, against a stub server rather than the network.
 *
 * The scenario every test here builds is the real one: a handshake that sets a
 * cookie and redirects, and an app that keeps re-issuing the handshake until it
 * sees that cookie come back. That is what `redirect: 'follow'` could not do and
 * what took `probe-production.mjs` to 0/6 against a healthy production.
 *
 * `globalThis.fetch` is replaced with a scripted responder, so these run with no
 * network and no timing.
 */
import { describe, it, expect, afterEach } from 'vitest'

import { fetchFollowingCookies } from './cookie-jar.mjs'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** A response with the given status, location and Set-Cookie lines. */
function reply(status, { location, cookies = [] } = {}) {
  const headers = new Headers()
  if (location) headers.set('location', location)
  for (const c of cookies) headers.append('set-cookie', c)
  return new Response('', { status, headers })
}

/** Install a responder and record what it was asked for. */
function serve(handler) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), cookie: init.headers?.cookie ?? null })
    return handler(String(url), calls.length - 1, init)
  }
  return calls
}

describe('the Clerk development handshake, which is why this exists', () => {
  it('settles once the cookie is carried back', async () => {
    // Hop 1: the app sees no dev-browser cookie and sends you to the handshake.
    // Hop 2: the handshake SETS the cookie and sends you back.
    // Hop 3: the app sees the cookie and finally renders.
    const calls = serve((url, n) => {
      if (n === 0) return reply(307, { location: 'https://clerk.example.dev/handshake' })
      if (n === 1)
        return reply(307, {
          location: 'https://app.example.com/',
          cookies: ['__client=abc; Path=/'],
        })
      return reply(200)
    })

    const { response, hops } = await fetchFollowingCookies('https://app.example.com/')
    expect(response.status).toBe(200)
    expect(hops).toBe(3)
    // The third request is the one that had to carry it. Asserting the HEADER,
    // not merely the final status: a server that answered 200 regardless would
    // make a jar that drops every cookie look like it works.
    expect(calls[2]?.cookie).toBe('__client=abc')
    expect(calls[0]?.cookie).toBeNull()
  })

  it('gives up loudly on a chain that never settles — the actual production symptom', async () => {
    // No jar, no settle: this is exactly what `fetch` did, and reporting it as a
    // failure rather than as a 200 is the whole point.
    serve(() => reply(307, { location: 'https://app.example.com/handshake' }))
    await expect(fetchFollowingCookies('https://app.example.com/')).rejects.toThrow(
      /did not settle/,
    )
  })

  it('carries the trail on the failure, so a human can see where it looped', async () => {
    serve(() => reply(307, { location: 'https://app.example.com/handshake' }))
    const error = await fetchFollowingCookies('https://app.example.com/').catch((e) => e)
    expect(Array.isArray(error.trail)).toBe(true)
    expect(error.trail.length).toBeGreaterThan(1)
    expect(error.trail[0]).toMatchObject({ status: 307 })
  })
})

describe('the jar itself', () => {
  it('keeps several cookies and sends them together', async () => {
    const calls = serve((url, n) => {
      if (n === 0) return reply(302, { location: '/b', cookies: ['a=1; Path=/', 'b=2; HttpOnly'] })
      return reply(200)
    })
    await fetchFollowingCookies('https://x.test/')
    expect(calls[1]?.cookie).toBe('a=1; b=2')
  })

  it('does not split a cookie on the comma inside its own Expires attribute', async () => {
    // `headers.get('set-cookie')` joins multiple cookies with ", " — and
    // "Expires=Wed, 01 Jan 2027" contains a comma of its own. Splitting that
    // string is how a jar silently loses or mangles cookies, so the reader is
    // getSetCookie(). This is the test that would catch a regression to the
    // naive split.
    const calls = serve((url, n) => {
      if (n === 0)
        return reply(302, {
          location: '/b',
          cookies: ['s=v; Expires=Wed, 01 Jan 2027 00:00:00 GMT; Path=/'],
        })
      return reply(200)
    })
    await fetchFollowingCookies('https://x.test/')
    expect(calls[1]?.cookie).toBe('s=v')
  })

  it('honours a deletion instead of sending an emptied cookie forever', async () => {
    const calls = serve((url, n) => {
      if (n === 0) return reply(302, { location: '/b', cookies: ['s=v'] })
      if (n === 1) return reply(302, { location: '/c', cookies: ['s='] })
      return reply(200)
    })
    await fetchFollowingCookies('https://x.test/')
    expect(calls[1]?.cookie).toBe('s=v')
    expect(calls[2]?.cookie).toBeNull()
  })

  it('a later value replaces an earlier one', async () => {
    const calls = serve((url, n) => {
      if (n === 0) return reply(302, { location: '/b', cookies: ['s=old'] })
      if (n === 1) return reply(302, { location: '/c', cookies: ['s=new'] })
      return reply(200)
    })
    await fetchFollowingCookies('https://x.test/')
    expect(calls[2]?.cookie).toBe('s=new')
  })

  it('resolves a relative Location against the hop it came from', async () => {
    const calls = serve((url, n) => (n === 0 ? reply(302, { location: '/deep/page' }) : reply(200)))
    await fetchFollowingCookies('https://x.test/start')
    expect(calls[1]?.url).toBe('https://x.test/deep/page')
  })

  it('follows across hosts, which the handshake requires', async () => {
    const calls = serve((url, n) =>
      n === 0 ? reply(307, { location: 'https://other.test/h' }) : reply(200),
    )
    await fetchFollowingCookies('https://x.test/')
    expect(calls[1]?.url).toBe('https://other.test/h')
  })

  it('returns a non-redirect immediately, with one hop', async () => {
    serve(() => reply(200))
    const { hops, response } = await fetchFollowingCookies('https://x.test/')
    expect(hops).toBe(1)
    expect(response.status).toBe(200)
  })

  it('treats a 3xx with no Location as the end, not as a redirect', async () => {
    // A redirect status with nowhere to go is a malformed response, and the only
    // safe reading is "this is the end". Following it would re-request the same
    // URL forever — a loop indistinguishable from the handshake bug.
    serve(() => reply(302))
    const { response, hops } = await fetchFollowingCookies('https://x.test/')
    expect(response.status).toBe(302)
    expect(hops).toBe(1)
  })

  it('passes the caller headers through on every hop, not just the first', async () => {
    const seen = []
    globalThis.fetch = async (url, init = {}) => {
      seen.push(init.headers?.['user-agent'])
      return seen.length === 1 ? reply(302, { location: '/b' }) : reply(200)
    }
    await fetchFollowingCookies('https://x.test/', { headers: { 'user-agent': 'probe' } })
    expect(seen).toEqual(['probe', 'probe'])
  })
})
