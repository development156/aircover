import { writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { createDirectSource, crawlSite, quarantineCorpus } from '@sahoda/research'
import { brandExtractTask, createMesh, type RepairEvent } from '@sahoda/mesh'
import type { MeshContext } from '@sahoda/shared'

/**
 * WHY DOES brand_extract FAIL ITS SCHEMA TWO TIMES IN THREE?
 *
 * The 2026-08-12 density run measured 6 of 9 extraction calls needing the
 * engine's one repair retry — and a repair resends the whole corpus, so the
 * real cost of extraction is roughly double the single-pass figure. Nothing
 * recorded it: a repaired call and a clean one both logged `status: 'ok'`.
 *
 * The suspects were `confirmed: z.literal(false)`, the `channel` enum and the
 * required `source_url`. This test does not assume any of them. It captures the
 * ACTUAL zod message and the ACTUAL first-attempt text for every failure, on the
 * same fbs.edu.in corpus, and writes them out to be read.
 *
 *   set -a; source .env; set +a
 *   REPAIR_DIAG=1 REPAIR_OUT=/tmp/repair.json \
 *     npx vitest run --config vitest.live.config.ts src/lib/brand/repair-diagnosis.live.test.ts
 */
const LIVE = process.env.REPAIR_DIAG === '1'

const WORKSPACE_ID = 'c12b271a-a9be-44a4-b713-3ff8faa70066'
const SITE = 'https://fbs.edu.in/'
const NAME = 'Future Bhubaneswar School'
const TRIALS = 6

describe.runIf(LIVE)('brand_extract repair diagnosis', () => {
  it('records every first-attempt schema failure verbatim', async () => {
    const repairs: RepairEvent[] = []
    const mesh = createMesh({ onRepair: (e) => repairs.push(e) })

    const crawl = await crawlSite(SITE, { client: createDirectSource({ timeoutMs: 20_000 }) })
    if (!crawl.ok) throw new Error(`crawl failed: ${crawl.reason}`)
    const corpus = quarantineCorpus(crawl.pages)

    const runs: unknown[] = []
    for (let i = 0; i < TRIALS; i += 1) {
      const ctx: MeshContext = {
        workspaceId: WORKSPACE_ID,
        traceId: `repair-diag-${i}-${process.pid}-${process.hrtime.bigint()}`,
        creditsCharged: 0,
      }
      const ex = await mesh.runTask(brandExtractTask.def, { corpus, name: NAME }, ctx)
      runs.push({
        trial: i,
        ok: ex.ok,
        tokensIn: ex.usage?.tokensIn,
        tokensOut: ex.usage?.tokensOut,
        costUsd: ex.usage?.costUsd,
        fields: ex.ok ? ex.data.fields.length : 0,
      })
    }

    if (process.env.REPAIR_OUT) {
      writeFileSync(
        process.env.REPAIR_OUT,
        JSON.stringify({ corpusChars: corpus.length, trials: TRIALS, runs, repairs }, null, 2),
      )
    }
  }, 900_000)
})
