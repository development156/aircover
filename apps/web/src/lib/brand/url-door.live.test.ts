import { writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import {
  createFirecrawlClient,
  crawlSite,
  loadResearchEnv,
  quarantineCorpus,
} from '@sahoda/research'
import { brandExtractTask, brandGuidelinesTask, createMesh } from '@sahoda/mesh'
import { ResolveInputSchema, type MeshContext, type ResolveInput } from '@sahoda/shared'

import { attachProvenance } from '@sahoda/shared'
import { applyExtractedFields } from './url-door'

/**
 * ARM D — the URL door measured against its own control, on a REAL website.
 *
 * The 2026-08-12 three-arm run (packages/mesh/src/brand-intake.live.test.ts)
 * established A weak · B weak · C moderate: forwarding a URL bought nothing,
 * because the model cannot fetch it. Arm D answers the question that leaves —
 * does CRAWLING the URL buy what typing a description bought?
 *
 * It runs a matched pair on the same business, same day, same model:
 *   A′  name + category only            (the control, repeated for this brand)
 *   D   name + category + crawled site  (extracted fields folded into intake)
 *
 * A different business from arms A–C, necessarily: Chai & Chapters is a demo
 * brand with no website, and crawling a site requires a real one. That is why
 * the control is re-run here rather than compared across brands.
 *
 * The headline is NOT signal_lock. It is the SWAP TEST (doc 18 §14): if a
 * competitor could adopt these red lines unchanged, the Brain contains no
 * information. The output file quotes both arms' red lines side by side so the
 * reader can apply it themselves rather than take a verdict on trust.
 *
 * Costs real money: Firecrawl credits (1/page + 1 map) and two standard-tier
 * resolves plus one extraction.
 *
 *   set -a; source .env; set +a
 *   ARM_D_URL=https://… ARM_D_NAME='…' ARM_D_CATEGORY='…' \
 *   ARM_D_OUT=/tmp/armd.json \
 *     npx vitest run --config vitest.live.config.ts src/lib/brand/url-door.live.test.ts
 */
const LIVE = Boolean(process.env.ARM_D_URL)

/** Telemetry lands against this workspace, as arms A–C did. */
const WORKSPACE_ID = 'c12b271a-a9be-44a4-b713-3ff8faa70066'

describe.runIf(LIVE)('arm D — the URL door on a real site', () => {
  it('crawls, extracts, resolves, and records both arms for the swap test', async () => {
    const url = process.env.ARM_D_URL!
    const name = process.env.ARM_D_NAME ?? ''
    const category = process.env.ARM_D_CATEGORY ?? ''
    if (!name) throw new Error('ARM_D_NAME is required — the control needs the same name as arm D')

    const env = loadResearchEnv()
    const client = createFirecrawlClient({ apiKey: env.firecrawlKey, baseUrl: env.firecrawlUrl })
    const mesh = createMesh()
    const ctxFor = (label: string): MeshContext => ({
      workspaceId: WORKSPACE_ID,
      traceId: `arm-d-${label}-${process.pid}-${process.hrtime.bigint()}`,
      creditsCharged: 0,
    })

    const record: Record<string, unknown> = { url, name, category }

    // ── the crawl ────────────────────────────────────────────────────────────
    const crawl = await crawlSite(url, { client })
    record.crawl = crawl.ok
      ? {
          ok: true,
          pages: crawl.pages.map((p) => ({ url: p.url, words: p.words })),
          skipped: crawl.skipped,
          wordsFound: crawl.wordsFound,
          firecrawlCredits: crawl.creditsUsed,
        }
      : crawl

    // ── arm A′: the control, same brand, no crawl ────────────────────────────
    const control: ResolveInput = ResolveInputSchema.parse({ source: { name, category } })
    const aPrime = await mesh.runTask(brandGuidelinesTask.def, control, ctxFor('a'))
    record.armA = {
      ok: aPrime.ok,
      usage: aPrime.usage,
      payload: aPrime.ok ? aPrime.data : aPrime.error,
    }

    if (!crawl.ok) {
      // Fail honestly: record the reason and stop. No invented arm D.
      record.armD = { skipped: `crawl failed: ${crawl.reason}` }
      if (process.env.ARM_D_OUT)
        writeFileSync(process.env.ARM_D_OUT, JSON.stringify(record, null, 2))
      return
    }

    // ── the quarantined extraction ───────────────────────────────────────────
    const corpus = quarantineCorpus(crawl.pages)
    record.corpusChars = corpus.length
    const extraction = await mesh.runTask(brandExtractTask.def, { corpus, name }, ctxFor('extract'))
    record.extract = {
      ok: extraction.ok,
      usage: extraction.usage,
      data: extraction.ok ? extraction.data : extraction.error,
    }

    if (!extraction.ok) {
      record.armD = { skipped: 'extraction failed' }
      if (process.env.ARM_D_OUT)
        writeFileSync(process.env.ARM_D_OUT, JSON.stringify(record, null, 2))
      return
    }

    // ── arm D: the same control, plus what the site actually said ────────────
    const enriched = applyExtractedFields(
      control,
      attachProvenance(extraction.data.fields, crawl.pages.map((p) => p.url)),
    )
    record.armDInput = enriched
    const armD = await mesh.runTask(brandGuidelinesTask.def, enriched, ctxFor('d'))
    record.armD = { ok: armD.ok, usage: armD.usage, payload: armD.ok ? armD.data : armD.error }

    if (process.env.ARM_D_OUT) writeFileSync(process.env.ARM_D_OUT, JSON.stringify(record, null, 2))
  }, 300_000)
})
