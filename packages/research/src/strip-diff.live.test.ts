import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { crawlSite } from './crawl-site'
import { createDirectSource } from './direct-source'
import { stripCorpusNoise } from './strip'

/**
 * WHAT DOES THE AGGRESSIVE STRIPPER REMOVE THAT SAFE KEEPS?
 *
 * Safe is shipped; aggressive is held. Aggressive cut 30% of input tokens
 * against safe's 22%, which is tempting — this prints, verbatim, the lines it
 * would have thrown away so the extra 8% can be judged against what it costs.
 * No model calls: crawl only.
 *
 *   STRIP_DIFF=1 STRIP_OUT=/tmp/stripdiff.json \
 *     npx vitest run --config vitest.live.config.ts src/strip-diff.live.test.ts
 */
const LIVE = process.env.STRIP_DIFF === '1'

/** Safe, plus: drop lines under four words, and drop repeats. */
function aggressive(markdown: string): string {
  const seen = new Set<string>()
  return stripCorpusNoise(markdown)
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      if (t.length === 0) return false
      if (/^#{1,6}\s/.test(t)) return true
      if (t.split(/\s+/).filter(Boolean).length < 4) return false
      const k = t.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .join('\n')
}

describe.runIf(LIVE)('safe vs aggressive stripping', () => {
  it('lists every line aggressive drops that safe keeps', async () => {
    const crawl = await crawlSite('https://fbs.edu.in/', {
      client: createDirectSource({ timeoutMs: 20_000 }),
    })
    if (!crawl.ok) throw new Error(crawl.reason)

    const dropped: string[] = []
    let safeChars = 0
    let aggChars = 0
    for (const p of crawl.pages) {
      const s = stripCorpusNoise(p.markdown)
      const a = aggressive(p.markdown)
      safeChars += s.length
      aggChars += a.length
      const kept = new Set(a.split('\n'))
      for (const line of s.split('\n')) {
        if (line.trim() && !kept.has(line)) dropped.push(line.trim())
      }
    }
    const out = { safeChars, aggChars, droppedCount: dropped.length, dropped }
    if (process.env.STRIP_OUT) writeFileSync(process.env.STRIP_OUT, JSON.stringify(out, null, 2))
  }, 300_000)
})
