import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { pinnedFetch } from './pinned-fetch'

/**
 * These run against a REAL loopback server on purpose.
 *
 * The property under test is "the connection is never made", and a mocked
 * transport cannot show that — it can only show that a function returned early.
 * The onboarding lane's original guard was found this way: before the IP-literal
 * check existed, a request for `http://127.0.0.1:<port>/` reached a live server,
 * and only executing it proved so. `served` below is that same tripwire.
 */
let server: Server
let port = 0
let served = 0

beforeAll(async () => {
  server = createServer((_req, res) => {
    served += 1
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<html><body>SECRET</body></html>')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as { port: number }).port
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('pinnedFetch refuses private destinations', () => {
  test('an IPv4 loopback LITERAL never reaches the server', async () => {
    // Node does not call `lookup` for a literal, so the socket guard cannot see
    // this one. If the explicit literal check regresses, `served` catches it.
    const before = served
    await expect(pinnedFetch(`http://127.0.0.1:${port}/`)).rejects.toThrow(/private address/)
    expect(served, 'the request must never have been served').toBe(before)
  })

  test('the cloud metadata endpoint is refused', async () => {
    await expect(pinnedFetch('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /private address/,
    )
  })

  test('an IPv6 loopback literal in brackets is refused', async () => {
    await expect(pinnedFetch('http://[::1]/')).rejects.toThrow(/private address/)
  })

  test('a NAME that resolves to loopback is refused at connect time', async () => {
    // `localhost` is a name, so this is the socket `lookup` guard doing the work
    // rather than the literal check — the rebinding path, exercised for real.
    const before = served
    await expect(pinnedFetch(`http://localhost:${port}/`)).rejects.toThrow()
    expect(served, 'the request must never have been served').toBe(before)
  })
})
