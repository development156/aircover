import { describe, it, expect } from 'vitest'

import { createGuardedFetch } from './guarded-fetch'
import { UnsafeUrlError } from './safe-fetch'

/**
 * THE REDIRECT IS THE POINT.
 *
 * A URL check at the door refuses `http://169.254.169.254/` and feels finished.
 * It is not: `http://their-site.example/` answering `302 → http://169.254.169.254/`
 * reaches the same place with a stored row that looks perfectly ordinary, and
 * `redirect: 'follow'` resolves that second hop inside undici where no guard of
 * ours can see it. Every case below sends the attack through a hop.
 */

/** A public answer for anything, so only the guard can refuse. */
const resolvePublic = async () => [{ address: '93.184.216.34', family: 4 }]

/** Records what was actually connected to, so a refusal can be proven, not assumed. */
function recorder(script: Record<string, { status: number; location?: string }>) {
  const seen: string[] = []
  const transport = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString()
    seen.push(url)
    const step = script[url] ?? { status: 200 }
    const headers = new Headers(step.location ? { location: step.location } : {})
    return new Response(step.status === 304 ? null : 'ok', { status: step.status, headers })
  }) as typeof fetch
  return { seen, transport }
}

describe('a redirect into a private address', () => {
  it('is refused at the hop, and the socket is never opened', async () => {
    const { seen, transport } = recorder({
      'https://competitor.example/': { status: 302, location: 'http://169.254.169.254/latest/' },
    })
    const fetchGuarded = createGuardedFetch({ transport, resolve: resolvePublic })

    await expect(fetchGuarded('https://competitor.example/')).rejects.toThrow(UnsafeUrlError)
    // Hop one happened; hop two must not have.
    expect(seen).toEqual(['https://competitor.example/'])
  })

  it.each([
    ['dotted quad', 'http://169.254.169.254/'],
    ['loopback', 'http://127.0.0.1:5432/'],
    ['RFC1918', 'http://10.0.0.1/'],
    ['decimal', 'http://2852039166/'],
    ['hex', 'http://0xA9FEA9FE/'],
    ['octal', 'http://0251.0376.0251.0376/'],
    ['trailing dot', 'http://169.254.169.254./'],
    ['IPv4-mapped IPv6', 'http://[::ffff:169.254.169.254]/'],
    ['IPv4-mapped IPv6, hextets', 'http://[::ffff:a9fe:a9fe]/'],
    ['IPv4-compatible IPv6', 'http://[::169.254.169.254]/'],
    ['6to4', 'http://[2002:a9fe:a9fe::]/'],
    ['NAT64', 'http://[64:ff9b::a9fe:a9fe]/'],
    ['IPv6 loopback', 'http://[::1]:5432/'],
    ['credentials in the URL', 'http://user:pass@169.254.169.254/'],
  ])('refuses %s reached through a redirect: %s', async (_name, target) => {
    const { seen, transport } = recorder({
      'https://competitor.example/': { status: 302, location: target },
    })
    const fetchGuarded = createGuardedFetch({ transport, resolve: resolvePublic })
    await expect(fetchGuarded('https://competitor.example/')).rejects.toThrow(UnsafeUrlError)
    expect(seen).toEqual(['https://competitor.example/'])
  })

  it('refuses a private address reached four hops down a public chain', async () => {
    const { seen, transport } = recorder({
      'https://a.example/': { status: 302, location: 'https://b.example/' },
      'https://b.example/': { status: 302, location: 'https://c.example/' },
      'https://c.example/': { status: 307, location: 'https://d.example/' },
      'https://d.example/': { status: 302, location: 'http://[::ffff:a9fe:a9fe]/' },
    })
    const fetchGuarded = createGuardedFetch({ transport, resolve: resolvePublic })
    await expect(fetchGuarded('https://a.example/')).rejects.toThrow(UnsafeUrlError)
    expect(seen).toEqual([
      'https://a.example/',
      'https://b.example/',
      'https://c.example/',
      'https://d.example/',
    ])
  })

  it('refuses a hostname whose DNS answer is private, at any hop', async () => {
    const { transport } = recorder({
      'https://competitor.example/': { status: 302, location: 'https://rebound.example/' },
    })
    const fetchGuarded = createGuardedFetch({
      transport,
      // The shape of a rebinding record: public first, metadata second.
      resolve: async (host) =>
        host === 'rebound.example'
          ? [{ address: '169.254.169.254', family: 4 }]
          : [{ address: '93.184.216.34', family: 4 }],
    })
    await expect(fetchGuarded('https://competitor.example/')).rejects.toThrow(
      /resolves to a private address/,
    )
  })

  it('refuses a host with one public and one private record', async () => {
    const { transport } = recorder({})
    const fetchGuarded = createGuardedFetch({
      transport,
      resolve: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '::ffff:a9fe:a9fe', family: 6 },
      ],
    })
    await expect(fetchGuarded('https://competitor.example/')).rejects.toThrow(UnsafeUrlError)
  })

  it('stops rather than looping forever', async () => {
    const { transport } = recorder({
      'https://loop.example/': { status: 302, location: 'https://loop.example/' },
    })
    const fetchGuarded = createGuardedFetch({ transport, resolve: resolvePublic, maxRedirects: 2 })
    await expect(fetchGuarded('https://loop.example/')).rejects.toThrow(/too many redirects/)
  })
})

describe('what it must NOT break', () => {
  it('follows a public chain and reports the FINAL url', async () => {
    const { transport } = recorder({
      'https://competitor.example/': { status: 301, location: 'https://competitor.example/en/' },
    })
    const fetchGuarded = createGuardedFetch({ transport, resolve: resolvePublic })
    const res = await fetchGuarded('https://competitor.example/')
    expect(res.status).toBe(200)
    // `new Response()` leaves `url` empty; a caller recording where the bytes
    // came from would otherwise silently record hop one.
    expect(res.url).toBe('https://competitor.example/en/')
  })

  it('carries the caller headers through — the conditional GET is the whole economics', async () => {
    let seenInit: RequestInit | undefined
    const transport = (async (_input: unknown, init?: RequestInit) => {
      seenInit = init
      return new Response(null, { status: 304 })
    }) as typeof fetch
    const fetchGuarded = createGuardedFetch({ transport, resolve: resolvePublic })

    const res = await fetchGuarded('https://competitor.example/', {
      headers: { 'if-none-match': 'W/"abc"', 'user-agent': 'SahodaRadar/1.0' },
    })
    expect(res.status).toBe(304)
    expect(seenInit?.headers).toEqual({
      'if-none-match': 'W/"abc"',
      'user-agent': 'SahodaRadar/1.0',
    })
    // And the caller never gets to choose redirect handling back.
    expect(seenInit?.redirect).toBe('manual')
  })

  it('returns a 3xx that carries no Location as the answer it is', async () => {
    const { transport } = recorder({ 'https://competitor.example/': { status: 304 } })
    const fetchGuarded = createGuardedFetch({ transport, resolve: resolvePublic })
    const res = await fetchGuarded('https://competitor.example/')
    expect(res.status).toBe(304)
  })
})
