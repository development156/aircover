import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { fetchSite } from './fetch-site'

/**
 * A real server on loopback. Every request that reaches it is a guard FAILURE —
 * loopback is exactly what the guard exists to refuse — so `hits` is the
 * assertion, not a fixture.
 */
let server: Server
let port = 0
let hits = 0

beforeAll(async () => {
  server = createServer((_request, response) => {
    hits += 1
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<html><body>reached the private server</body></html>')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  port = typeof address === 'object' && address ? address.port : 0
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

// Per test, not per file: one leaked hit would otherwise satisfy every later
// `hits` assertion and hide a second hole behind the first.
beforeEach(() => {
  hits = 0
})

describe('fetchSite', () => {
  it('refuses a bare IPv4 literal pointing at loopback', async () => {
    // Node does NOT call the `lookup` hook for an address that is already an IP
    // literal — it connects straight to it. So the socket-level guard, which is
    // what defends against DNS rebinding, never runs for this input at all.
    // Without an explicit literal check this reaches the server below.
    const result = await fetchSite(`http://127.0.0.1:${port}/`)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/private network/)
    expect(hits).toBe(0)
  })

  it('refuses the cloud metadata address', async () => {
    const result = await fetchSite('http://169.254.169.254/latest/meta-data/')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/private network/)
  })

  it('refuses a private range by literal', async () => {
    const result = await fetchSite('http://192.168.1.1/')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/private network/)
  })

  it('refuses something that is not a web address', async () => {
    expect(await fetchSite('javascript:alert(1)')).toMatchObject({ ok: false })
    expect(await fetchSite('')).toMatchObject({ ok: false })
    // A hostname with no dot never becomes a request in the first place.
    expect(await fetchSite('localhost')).toMatchObject({ ok: false })
  })

  it('blocks a public hostname that resolves to a private address', async () => {
    // This is the case the socket-level `lookup` hook exists for, and the only
    // test here that exercises it: `localhost.localtest.me` is a real name in
    // public DNS that answers 127.0.0.1 and ::1 — the same shape as a rebinding
    // record, without needing one.
    const result = await fetchSite('http://localhost.localtest.me/')

    expect(result.ok).toBe(false)
    if (result.ok) return
    // Asserting the REASON matters: "could not find that site" would mean DNS
    // simply failed in the sandbox and this test proved nothing.
    expect(result.reason).toMatch(/private network/)
    expect(hits).toBe(0)
  })
})
