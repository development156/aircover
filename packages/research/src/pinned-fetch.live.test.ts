import { describe, expect, test } from 'vitest'

import { pinnedFetch } from './pinned-fetch'

/**
 * LIVE — makes one real request. Excluded from `vitest.config.ts` and run with
 * `vitest.live.config.ts`, because a unit suite that needs the internet fails
 * for reasons that have nothing to do with the code.
 *
 * It earns its place: every assertion in `pinned-fetch.test.ts` is that a
 * request was REFUSED, and a transport that refused everything would pass all of
 * them while shipping a crawler that reads nothing. This is the other half.
 */
describe('pinnedFetch is a usable transport', () => {
  test('reads a public response', async () => {
    // Proves the guard is not simply refusing everything — a transport that
    // blocked all traffic would pass every test above and ship a dead crawler.
    const res = await pinnedFetch('https://example.com/', {
      headers: { accept: 'text/html' },
      signal: AbortSignal.timeout(15_000),
    })
    expect(res.status).toBeGreaterThanOrEqual(200)
    expect(res.status).toBeLessThan(400)
    expect(await res.text()).toContain('<')
  }, 20_000)
})

/**
 * THE REGRESSION THIS GUARDS, found by walking the deployed flow: `node:http`
 * does not decompress, so every crawled page arrived as gzip bytes and the
 * corpus handed to the model began with the gzip magic number instead of prose.
 * `fetch` had been doing this for us silently.
 */
describe('pinnedFetch returns TEXT, not compressed bytes', () => {
  test('a gzip-serving origin comes back as readable html', async () => {
    const res = await pinnedFetch('https://www.python.org/', {
      headers: { accept: 'text/html' },
      signal: AbortSignal.timeout(20_000),
    })
    const body = await res.text()
    expect(res.status).toBe(200)
    expect(body.charCodeAt(0), 'a leading 0x1f is the gzip magic number').not.toBe(0x1f)
    expect(body.toLowerCase()).toContain('<html')
    expect(body.toLowerCase()).toContain('python')
  }, 30_000)
})
