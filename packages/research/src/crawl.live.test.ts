import { writeFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { createFirecrawlClient } from './firecrawl'
import { crawlSite } from './crawl-site'
import { loadResearchEnv } from './env'

/**
 * Live Firecrawl smoke. Skipped by default — it spends real credits (1 per page
 * plus the map call) and needs FIRECRAWL_API_KEY.
 *
 * It exists so the vendor wiring can be proven WITHOUT a model call in the way:
 * if arm D looks wrong, this says whether the crawl or the extraction is at
 * fault. Every unit test in this package runs on fixtures; this is the only
 * thing that proves the fixtures match the real API's shape.
 *
 *   set -a; source .env; set +a
 *   CRAWL_LIVE_URL=https://… CRAWL_LIVE_OUT=/tmp/crawl.json \
 *     npx vitest run --config vitest.live.config.ts src/crawl.live.test.ts
 */
const LIVE = Boolean(process.env.CRAWL_LIVE_URL)

describe.runIf(LIVE)('firecrawl live', () => {
  it('maps and scrapes several pages, and reports what it cost', async () => {
    const env = loadResearchEnv()
    const client = createFirecrawlClient({ apiKey: env.firecrawlKey, baseUrl: env.firecrawlUrl })

    const out = await crawlSite(process.env.CRAWL_LIVE_URL!, { client })

    if (process.env.CRAWL_LIVE_OUT) {
      writeFileSync(
        process.env.CRAWL_LIVE_OUT,
        JSON.stringify(
          out.ok
            ? {
                ok: true,
                pages: out.pages.map((p) => ({
                  url: p.url,
                  title: p.title,
                  words: p.words,
                  head: p.markdown.slice(0, 400),
                })),
                skipped: out.skipped,
                wordsFound: out.wordsFound,
                creditsUsed: out.creditsUsed,
              }
            : out,
          null,
          2,
        ),
      )
    }

    // Assert on CONTENT, not on a status code — the house rule, and the whole
    // point of the thin/js_only distinction. A crawl that "succeeded" with no
    // words is a failure this package is required to name.
    if (out.ok) {
      expect(out.pages.length).toBeGreaterThan(1) // several pages, not one
      expect(out.wordsFound).toBeGreaterThan(0)
      expect(out.creditsUsed).toBe(out.pages.length + 1) // scrapes + the map call
    } else {
      // A named reason and a sentence that falls back to asking is a PASS: the
      // requirement is honesty, not that every site be readable.
      expect(out.message).toMatch(/ask|your own words|check the address/i)
    }
  }, 180_000)
})
