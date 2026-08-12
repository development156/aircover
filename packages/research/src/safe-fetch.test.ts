import { describe, expect, it } from 'vitest'
import { assertPublicUrl, isPrivateAddress, safeFetch, UnsafeUrlError } from './safe-fetch'

/** DNS is injected so these run with no network. */
const publicDns = async () => [{ address: '93.184.216.34', family: 4 }]
const privateDns = async () => [{ address: '10.0.0.5', family: 4 }]

function response(init: {
  status?: number
  headers?: Record<string, string>
  body?: string
}): Response {
  return new Response(init.body ?? '', {
    status: init.status ?? 200,
    headers: { 'content-type': 'text/html', ...(init.headers ?? {}) },
  })
}

describe('isPrivateAddress', () => {
  it('rejects every range a customer URL must never reach', () => {
    const blocked: Array<[string, number]> = [
      ['127.0.0.1', 4], // loopback
      ['10.1.2.3', 4], // private
      ['172.16.0.1', 4], // private
      ['172.31.255.255', 4], // private, upper edge
      ['192.168.1.1', 4], // private
      ['169.254.169.254', 4], // cloud metadata — the one that matters most
      ['100.64.0.1', 4], // CGNAT
      ['0.0.0.0', 4],
      ['224.0.0.1', 4], // multicast
      ['::1', 6], // loopback
      ['fd00::1', 6], // unique-local
      ['fe80::1', 6], // link-local
      ['::ffff:169.254.169.254', 6], // v4-mapped metadata — the classic bypass
    ]
    for (const [ip, family] of blocked) {
      expect(isPrivateAddress(ip, family), ip).toBe(true)
    }
  })

  it('allows ordinary public addresses', () => {
    expect(isPrivateAddress('93.184.216.34', 4)).toBe(false)
    expect(isPrivateAddress('172.32.0.1', 4)).toBe(false) // just outside 172.16/12
    expect(isPrivateAddress('2606:2800:220:1::', 6)).toBe(false)
  })
})

describe('reserved ranges carried over from the onboarding address guard', () => {
  it('refuses every reserved range the guard now lists', () => {
    for (const ip of [
      '192.0.0.1', // IETF protocol assignments
      '192.0.2.5', // TEST-NET-1
      '198.18.0.1', // benchmarking
      '198.19.255.254', // benchmarking, upper half of the /15
      '198.51.100.7', // TEST-NET-2
      '203.0.113.9', // TEST-NET-3
    ]) {
      expect(isPrivateAddress(ip, 4), ip).toBe(true)
    }
  })

  it('leaves a neighbouring PUBLIC address alone', () => {
    // The /15 and /24 boundaries are the easy thing to get wrong, and a guard
    // that blocked 198.20.x or 203.0.114.x would silently refuse real customers.
    expect(isPrivateAddress('198.20.0.1', 4)).toBe(false)
    expect(isPrivateAddress('203.0.114.1', 4)).toBe(false)
    expect(isPrivateAddress('192.1.0.1', 4)).toBe(false)
  })
})

describe('assertPublicUrl', () => {
  it('refuses a non-http scheme — file: and data: are ways out of "fetch a page"', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow(UnsafeUrlError)
    await expect(assertPublicUrl('data:text/html,<h1>x')).rejects.toThrow(UnsafeUrlError)
  })

  it('refuses credentials in the URL', async () => {
    await expect(
      assertPublicUrl('https://user:pass@example.com', { resolve: publicDns }),
    ).rejects.toThrow(/credentials/)
  })

  it('refuses a hostname that resolves into a private range', async () => {
    await expect(assertPublicUrl('https://evil.test', { resolve: privateDns })).rejects.toThrow(
      /private address/,
    )
  })

  it('checks EVERY resolved address, not just the first', async () => {
    // One public A record and one loopback is a bypass if we stop at the first.
    const mixed = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]
    await expect(assertPublicUrl('https://mixed.test', { resolve: mixed })).rejects.toThrow(
      /private address/,
    )
  })

  it('accepts an ordinary public site', async () => {
    const url = await assertPublicUrl('https://example.com/about', { resolve: publicDns })
    expect(url.hostname).toBe('example.com')
  })
})

describe('safeFetch', () => {
  it('re-validates each redirect hop — a redirect into a private address is refused', async () => {
    const resolve = async (host: string) =>
      host === 'safe.test'
        ? [{ address: '93.184.216.34', family: 4 }]
        : [{ address: '169.254.169.254', family: 4 }]

    const fetchImpl = (async () =>
      response({
        status: 302,
        headers: { location: 'http://metadata.test/latest' },
      })) as typeof fetch

    await expect(safeFetch('https://safe.test', { resolve, fetchImpl })).rejects.toThrow(
      /private address/,
    )
  })

  it('returns the real HTTP status — js_only vs unreachable depends on it', async () => {
    const fetchImpl = (async () =>
      response({ status: 200, body: '<html><body></body></html>' })) as typeof fetch
    const page = await safeFetch('https://example.com', { resolve: publicDns, fetchImpl })
    expect(page.status).toBe(200)
  })

  it('does not throw on a 404 — a 404 is a fact the classifier needs', async () => {
    const fetchImpl = (async () => response({ status: 404, body: 'nope' })) as typeof fetch
    const page = await safeFetch('https://example.com', { resolve: publicDns, fetchImpl })
    expect(page.status).toBe(404)
  })

  it('skips a non-HTML body rather than reading a PDF into a string', async () => {
    const fetchImpl = (async () =>
      response({
        headers: { 'content-type': 'application/pdf' },
        body: '%PDF-1.7',
      })) as typeof fetch
    const page = await safeFetch('https://example.com/menu.pdf', { resolve: publicDns, fetchImpl })
    expect(page.html).toBe('')
    expect(page.contentType).toMatch(/pdf/)
  })

  it('caps the body — an uncapped read is a memory DoS on a hostile host', async () => {
    const huge = 'x'.repeat(50_000)
    const fetchImpl = (async () => response({ body: huge })) as typeof fetch
    const page = await safeFetch('https://example.com', {
      resolve: publicDns,
      fetchImpl,
      maxBytes: 1000,
    })
    expect(page.truncated).toBe(true)
    expect(page.html.length).toBeLessThanOrEqual(1000)
  })

  it('stops after the redirect cap instead of looping forever', async () => {
    const fetchImpl = (async () =>
      response({ status: 302, headers: { location: 'https://example.com/next' } })) as typeof fetch
    await expect(
      safeFetch('https://example.com', { resolve: publicDns, fetchImpl, maxRedirects: 2 }),
    ).rejects.toThrow(/too many redirects/)
  })
})
