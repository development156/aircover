/**
 * Server-only. Firecrawl's key is a vendor secret and the crawl reaches
 * arbitrary customer-supplied URLs — neither belongs in a browser bundle.
 */
export function assertServerOnly(): void {
  if (typeof (globalThis as { window?: unknown }).window !== 'undefined') {
    throw new Error('@sahoda/research is server-only and must never run in the browser')
  }
}

export interface ResearchEnv {
  firecrawlKey: string
  /** Overridable for a self-hosted Firecrawl; defaults to the hosted v2 API. */
  firecrawlUrl: string
}

export const DEFAULT_FIRECRAWL_URL = 'https://api.firecrawl.dev/v2'

/**
 * Fail-fast loader in the house style (mirrors mesh + billing): name the missing
 * variable, never echo a value.
 *
 * NOTE: `FIRECRAWL_API_KEY` must also be listed in turbo.json's
 * `@sahoda/web#build` env allowlist, or the Vercel build will not see it and the
 * URL door will fail in production while passing every local gate.
 */
export function loadResearchEnv(source: NodeJS.ProcessEnv = process.env): ResearchEnv {
  assertServerOnly()

  const firecrawlKey = source.FIRECRAWL_API_KEY?.trim() ?? ''
  if (firecrawlKey.length === 0) {
    throw new Error('@sahoda/research: missing required env — FIRECRAWL_API_KEY')
  }

  return {
    firecrawlKey,
    firecrawlUrl: source.FIRECRAWL_API_URL?.trim() || DEFAULT_FIRECRAWL_URL,
  }
}
