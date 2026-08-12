import { writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { createDirectSource, crawlSite, quarantineCorpus } from '@sahoda/research'
import { brandExtractTask, brandGuidelinesTask, createMesh } from '@sahoda/mesh'
import { ResolveInputSchema, type MeshContext, type ResolveInput } from '@sahoda/shared'

import { attachProvenance } from '@sahoda/shared'
import { applyExtractedFields } from './url-door'

/**
 * ARMS A′ / D / E — one brand, one day, one model, three intake depths.
 *
 * Future Bhubaneswar School is used for all three because it is the only one of
 * the five real SMB sites that gave tier 1 a clean corpus AND publishes its own
 * PDF. Same brand through both doors is a far stronger comparison than a
 * crawled site and someone else's brand book: the only thing that varies is
 * how we read them.
 *
 *   A′  name + category only          the control
 *   D   + tier-1 crawl of the site    the URL door, no vendor, no key
 *   E   + the school's own prospectus the upload door, cloudflare-ai (free)
 *
 * The headline is NOT signal_lock — three readings of three intakes are not a
 * progression and the lock is model-declared. The headline is the SWAP TEST
 * (doc 18 §14): could a competitor adopt these red lines unchanged? The output
 * file prints each arm's red lines so that is applied by reading.
 *
 *   set -a; source .env; set +a
 *   DOORS_LIVE=1 DOORS_OUT=/tmp/doors.json \
 *     npx vitest run --config vitest.live.config.ts src/lib/brand/doors.live.test.ts
 */
const LIVE = process.env.DOORS_LIVE === '1'

const WORKSPACE_ID = 'c12b271a-a9be-44a4-b713-3ff8faa70066'
const NAME = 'Future Bhubaneswar School'
const CATEGORY = 'Education — CBSE day school'
const SITE = 'https://fbs.edu.in/'
const PDF_URL = 'https://fbs.edu.in/wp-content/uploads/2025/11/FBS-Prospectus-2026-27.pdf'

describe.runIf(LIVE)('the three doors, one brand', () => {
  it('resolves A-prime, D and E and records every payload', async () => {
    const mesh = createMesh()
    const ctxFor = (label: string): MeshContext => ({
      workspaceId: WORKSPACE_ID,
      traceId: `doors-${label}-${process.pid}-${process.hrtime.bigint()}`,
      creditsCharged: 0,
    })
    const record: Record<string, unknown> = { name: NAME, category: CATEGORY }
    const control: ResolveInput = ResolveInputSchema.parse({
      source: { name: NAME, category: CATEGORY },
    })

    // ── A′ control ───────────────────────────────────────────────────────────
    const aPrime = await mesh.runTask(brandGuidelinesTask.def, control, ctxFor('a'))
    record.armA = { ok: aPrime.ok, usage: aPrime.usage, payload: aPrime.ok ? aPrime.data : aPrime.error }

    // ── D: tier 1, no vendor ─────────────────────────────────────────────────
    const crawl = await crawlSite(SITE, { client: createDirectSource({ timeoutMs: 20_000 }) })
    record.crawl = crawl.ok
      ? {
          pages: crawl.pages.map((p) => ({ url: p.url, words: p.words })),
          duplicates: crawl.duplicates,
          skipped: crawl.skipped.length,
          wordsFound: crawl.wordsFound,
          vendorCredits: crawl.creditsUsed,
        }
      : crawl

    if (crawl.ok) {
      const corpus = quarantineCorpus(crawl.pages)
      record.crawlCorpusChars = corpus.length
      const ex = await mesh.runTask(brandExtractTask.def, { corpus, name: NAME }, ctxFor('d-extract'))
      record.extractD = { ok: ex.ok, usage: ex.usage, data: ex.ok ? ex.data : ex.error }
      if (ex.ok) {
        const enriched = applyExtractedFields(
          control,
          attachProvenance(ex.data.fields, crawl.pages.map((p) => p.url)),
        )
        record.armDInput = enriched
        const d = await mesh.runTask(brandGuidelinesTask.def, enriched, ctxFor('d'))
        record.armD = { ok: d.ok, usage: d.usage, payload: d.ok ? d.data : d.error }
      }
    }

    // ── E: the upload door ───────────────────────────────────────────────────
    try {
      const res = await fetch(PDF_URL, { signal: AbortSignal.timeout(60_000) })
      const bytes = Buffer.from(await res.arrayBuffer())
      record.pdf = { url: PDF_URL, status: res.status, bytes: bytes.byteLength }
      if (res.ok && bytes.byteLength > 0) {
        const dataUrl = `data:application/pdf;base64,${bytes.toString('base64')}`
        const ex = await mesh.runTask(
          brandExtractTask.def,
          { name: NAME, file: { filename: 'FBS-Prospectus-2026-27.pdf', dataUrl } },
          ctxFor('e-extract'),
        )
        record.extractE = {
          ok: ex.ok,
          usage: ex.usage,
          data: ex.ok ? ex.data : ex.error,
          // Proof the parse can be replayed rather than paid for twice.
          annotationHashes: (
            (ex as { annotations?: Array<{ file?: { hash?: string } }> }).annotations ?? []
          ).map((a) => a.file?.hash),
        }
        if (ex.ok) {
          const enriched = applyExtractedFields(
            control,
            attachProvenance(ex.data.fields, ['FBS-Prospectus-2026-27.pdf']),
          )
          record.armEInput = enriched
          const e = await mesh.runTask(brandGuidelinesTask.def, enriched, ctxFor('e'))
          record.armE = { ok: e.ok, usage: e.usage, payload: e.ok ? e.data : e.error }
        }
      }
    } catch (error) {
      record.pdf = { url: PDF_URL, error: error instanceof Error ? error.message : 'unknown' }
    }

    if (process.env.DOORS_OUT) writeFileSync(process.env.DOORS_OUT, JSON.stringify(record, null, 2))
  }, 600_000)
})
