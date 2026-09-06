/**
 * Server-only. The vendor key is a secret and the crawl reaches arbitrary
 * customer-supplied URLs — neither belongs in a browser bundle.
 */
export function assertServerOnly(): void {
  if (typeof (globalThis as { window?: unknown }).window !== 'undefined') {
    throw new Error('@sahoda/research is server-only and must never run in the browser')
  }
}

export interface ResearchEnv {
  tinyfishKey: string
  /** Overridable for a proxy or a fixture server; defaults to TinyFish's hosted Fetch API. */
  tinyfishFetchUrl: string
}

export const DEFAULT_TINYFISH_FETCH_URL = 'https://api.fetch.tinyfish.ai'

/**
 * Fails loudly at boot when the key is absent — callers that can run without
 * tier 3 (onboarding does) check `process.env.TINYFISH_API_KEY` themselves and
 * simply do not arm the flag, rather than calling this.
 */
export function loadResearchEnv(source: NodeJS.ProcessEnv = process.env): ResearchEnv {
  assertServerOnly()
  const tinyfishKey = source.TINYFISH_API_KEY?.trim() ?? ''
  if (tinyfishKey.length === 0) {
    throw new Error('@sahoda/research: missing required env — TINYFISH_API_KEY')
  }
  return {
    tinyfishKey,
    tinyfishFetchUrl: source.TINYFISH_FETCH_URL?.trim() || DEFAULT_TINYFISH_FETCH_URL,
  }
}
