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
