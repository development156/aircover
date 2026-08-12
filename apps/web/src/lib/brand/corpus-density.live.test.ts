import { writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { createDirectSource, crawlSite, quarantineCorpus } from '@sahoda/research'
import type { CrawledPage } from '@sahoda/research'
import { brandExtractTask, createMesh } from '@sahoda/mesh'
import type { MeshContext } from '@sahoda/shared'

/**
 * THE TOKEN-DENSITY HYPOTHESIS.
 *
 * The 2026-08-12 three-door run measured fbs.edu.in's crawl corpus at 27,851
 * characters and 27,599 INPUT TOKENS — roughly one token per character, where
 * English prose runs about four characters per token. A 1.5 MB PDF of the same
 * school cost 16,373. If the cause is URL- and markdown-dense text, stripping it
 * is the largest single cost lever in the product, because extraction is the
 * biggest line item in a signup.
 *
 * Measured, not estimated: each corpus goes through a REAL extraction call and
 * `usage.tokensIn` is the provider's own count — the same instrument that
 * produced 27,599, so the before and after are comparable.
 *
 * It also measures the thing that matters more than the saving: whether the
 * stripped corpus still extracts the SAME FACTS. A cheaper corpus that loses
 * "5th best school in Bhubaneswar" is not cheaper, it is worse.
 *
 *   set -a; source .env; set +a
 *   DENSITY_LIVE=1 DENSITY_OUT=/tmp/density.json \
 *     npx vitest run --config vitest.live.config.ts src/lib/brand/corpus-density.live.test.ts
 */
const LIVE = process.env.DENSITY_LIVE === '1'

const WORKSPACE_ID = 'c12b271a-a9be-44a4-b713-3ff8faa70066'
const SITE = 'https://fbs.edu.in/'
const NAME = 'Future Bhubaneswar School'

const ZERO_WIDTH = /[​‌‍﻿]/g

/**
 * SAFE strip: syntax and addresses only. Nothing a human would read as a
 * sentence is touched — link TEXT is kept, only the target is dropped.
 */
export function stripSafe(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[\s*\]\([^)]*\)/g, '') // empty-text links: pure noise
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // keep the words, drop the href
    .replace(/<https?:\/\/[^>]*>/g, '')
    .replace(/https?:\/\/\S+/g, '') // bare URLs
    .replace(ZERO_WIDTH, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .filter((line) => !/^[\s\-*_|#>]*$/.test(line)) // rules, empty bullets, bare hashes
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * AGGRESSIVE strip: also drops short fragments and repeats. This is where
 * content loss becomes possible — a three-word line can be an address or an
 * opening time. Measured separately so the safe lever can be judged on its own.
 */
export function stripAggressive(markdown: string): string {
  const seen = new Set<string>()
  return stripSafe(markdown)
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      if (t.length === 0) return false
      if (/^#{1,6}\s/.test(t)) return true // headings are structure, keep them
      const words = t.split(/\s+/).filter(Boolean).length
      if (words < 4) return false
      const key = t.toLowerCase()
      if (seen.has(key)) return false // the same nav item on all five pages
      seen.add(key)
      return true
    })
    .join('\n')
}

function restrip(pages: readonly CrawledPage[], fn: (md: string) => string): CrawledPage[] {
  return pages.map((p) => {
    const markdown = fn(p.markdown)
    return { ...p, markdown, words: markdown.split(/\s+/).filter(Boolean).length }
  })
}

describe.runIf(LIVE)('corpus token density', () => {
  it('measures chars, tokens and chars-per-token before and after stripping', async () => {
    const mesh = createMesh()
    const crawl = await crawlSite(SITE, { client: createDirectSource({ timeoutMs: 20_000 }) })
    if (!crawl.ok) throw new Error(`crawl failed: ${crawl.reason}`)

    const variants = [
      { label: 'raw', pages: crawl.pages },
      { label: 'safe', pages: restrip(crawl.pages, stripSafe) },
      { label: 'aggressive', pages: restrip(crawl.pages, stripAggressive) },
    ]

    // MULTIPLE TRIALS, and the reported figure is the MINIMUM.
    //
    // The engine makes exactly one repair retry when the first answer fails the
    // schema, and `sumUsage` ADDS the retry's tokens — and the retry resends
    // every original message, so a repaired call reports roughly double the
    // input. A single measurement therefore cannot tell "this corpus is dense"
    // from "this corpus happened to need a repair". The first run of this test
    // showed exactly that: `aggressive` had FEWER characters than `safe` and
    // nearly double the tokens, and `raw` reported 8 extracted fields at 3,929
    // output tokens against `safe`'s 17 fields at 2,044.
    //
    // A single-pass call is the floor; a repair can only add. So the minimum
    // across trials is the honest single-pass number, and the spread is the
    // evidence that the artefact is real rather than assumed.
    const TRIALS = 3
    const rows: unknown[] = []
    for (const v of variants) {
      const corpus = quarantineCorpus(v.pages)
      const trials: Array<{ tokensIn: number; tokensOut: number; costUsd: number; fields: number }> = []
      let best: { fields: string[]; gaps: string[] } = { fields: [], gaps: [] }
      let bestTokens = Number.POSITIVE_INFINITY

      for (let i = 0; i < TRIALS; i += 1) {
        const ctx: MeshContext = {
          workspaceId: WORKSPACE_ID,
          traceId: `density-${v.label}-${i}-${process.pid}-${process.hrtime.bigint()}`,
          creditsCharged: 0,
        }
        const ex = await mesh.runTask(brandExtractTask.def, { corpus, name: NAME }, ctx)
        const u = ex.usage
        if (!u) continue
        trials.push({
          tokensIn: u.tokensIn,
          tokensOut: u.tokensOut,
          costUsd: u.costUsd,
          fields: ex.ok ? ex.data.fields.length : 0,
        })
        if (ex.ok && u.tokensIn < bestTokens) {
          bestTokens = u.tokensIn
          best = { fields: ex.data.fields.map((f) => `${f.channel}.${f.key}: ${f.value}`), gaps: ex.data.gaps }
        }
      }

      const minIn = Math.min(...trials.map((t) => t.tokensIn))
      const maxIn = Math.max(...trials.map((t) => t.tokensIn))
      rows.push({
        label: v.label,
        chars: corpus.length,
        tokensInMin: minIn,
        tokensInMax: maxIn,
        charsPerToken: corpus.length / minIn,
        costMin: Math.min(...trials.map((t) => t.costUsd)),
        trials,
        fields: best.fields,
        gaps: best.gaps,
      })
    }

    if (process.env.DENSITY_OUT) writeFileSync(process.env.DENSITY_OUT, JSON.stringify(rows, null, 2))
  }, 600_000)
})
