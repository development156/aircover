import { writeFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { crawlSite } from './crawl-site'
import { createDirectSource } from './direct-source'
import { createReaderSource } from './reader-source'

/**
 * TIER 1 AGAINST REAL INDIAN SMB WEBSITES.
 *
 * The number this produces decides whether we ever pay a crawl vendor. So the
 * five sites were CHOSEN AND WRITTEN DOWN BEFORE THE FIRST RUN, one per kind,
 * and none is swapped afterwards — a site replaced because it failed turns the
 * result into a number about our patience rather than about the web.
 *
 * Tier 1 only for the headline. Tier 2 runs afterwards on tier 1's failures and
 * is reported SEPARATELY, so "how many need no vendor at all" stays clean.
 *
 *   SMB_LIVE=1 SMB_OUT=/tmp/smb.json \
 *     npx vitest run --config vitest.live.config.ts src/tier1-smb.live.test.ts
 */
const LIVE = process.env.SMB_LIVE === '1'

const SITES = [
  { kind: 'café', url: 'https://www.bengaluru.cafe/' },
  { kind: 'clinic', url: 'https://bespokedentalclinic.com/' },
  { kind: 'shop', url: 'https://vallisvaseha.com/' },
  { kind: 'school', url: 'https://fbs.edu.in/' },
  { kind: 'service', url: 'https://www.theatelierkochi.com' },
] as const

describe.runIf(LIVE)('tier 1 against real Indian SMB sites', () => {
  it('reports per-site outcome with no vendor at all', async () => {
    const rows: unknown[] = []

    for (const site of SITES) {
      const started = Date.now()
      const direct = createDirectSource({ timeoutMs: 20_000 })
      let row: Record<string, unknown>
      try {
        const out = await crawlSite(site.url, { client: direct })
        row = out.ok
          ? {
              ...site,
              tier1: 'ok',
              pages: out.pages.length,
              words: out.wordsFound,
              urls: out.pages.map((p) => ({ url: p.url, words: p.words })),
              sample: out.pages[0]?.markdown.slice(0, 300) ?? '',
              creditsUsed: out.creditsUsed,
            }
          : {
              ...site,
              tier1: out.reason,
              pages: out.pagesFetched,
              words: out.wordsFound,
              attempted: out.attempted,
              message: out.message,
              creditsUsed: out.creditsUsed,
            }
      } catch (error) {
        row = { ...site, tier1: 'threw', error: error instanceof Error ? error.message : 'unknown' }
      }
      row.ms = Date.now() - started
      rows.push(row)
    }

    // Tier 2, separately, only on tier 1's failures — never folded into the
    // headline. Sequential and slow on purpose: the keyless budget is 20/min
    // and it is shared across the whole deployment.
    const tier2: unknown[] = []
    for (const row of rows as Array<Record<string, unknown>>) {
      if (row.tier1 === 'ok') continue
      const reason = row.tier1
      if (reason !== 'js_only' && reason !== 'thin') continue
      try {
        const reader = createReaderSource({ timeoutMs: 60_000 })
        const out = await crawlSite(String(row.url), { client: reader, maxPages: 2 })
        tier2.push(
          out.ok
            ? { url: row.url, tier2: 'ok', pages: out.pages.length, words: out.wordsFound }
            : { url: row.url, tier2: out.reason, words: out.wordsFound },
        )
      } catch (error) {
        tier2.push({
          url: row.url,
          tier2: 'threw',
          error: error instanceof Error ? error.message : 'unknown',
        })
      }
    }

    if (process.env.SMB_OUT) {
      writeFileSync(process.env.SMB_OUT, JSON.stringify({ tier1: rows, tier2 }, null, 2))
    }
    expect(rows).toHaveLength(SITES.length)
  }, 600_000)
})
