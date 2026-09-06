import { describe, expect, it } from 'vitest'
import { crawlSite } from './crawl-site'
import { loadResearchEnv } from './env'
import { createTinyFishSource } from './tinyfish'

/**
 * Live TinyFish Fetch smoke. Skipped by default — it reaches the real vendor
 * and spends one of the key's 1,000 daily fetches per page. Run with
 * TINYFISH_API_KEY set and SAHODA_ALLOW_LIVE_TESTS=1.
 */
const LIVE = process.env.SAHODA_ALLOW_LIVE_TESTS === '1' && !!process.env.TINYFISH_API_KEY

describe.runIf(LIVE)('tinyfish live', () => {
  it('reads a public page as markdown with a title', async () => {
    const env = loadResearchEnv()
    const client = createTinyFishSource({ apiKey: env.tinyfishKey, baseUrl: env.tinyfishFetchUrl })
    const page = await client.scrape('https://example.com/')
    expect(page.statusCode).toBe(200)
    expect(page.title.length).toBeGreaterThan(0)
    expect(page.markdown.length).toBeGreaterThan(50)
  }, 60_000)

  it('crawls a small site through the same source', async () => {
    const env = loadResearchEnv()
    const client = createTinyFishSource({ apiKey: env.tinyfishKey, baseUrl: env.tinyfishFetchUrl })
    const outcome = await crawlSite('https://example.com/', { client, maxPages: 2 })
    expect(outcome.creditsUsed).toBe(0)
  }, 120_000)
})
