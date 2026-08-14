import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createDirectSource, crawlSite, quarantineCorpus } from '@sahoda/research'
import {
  brandExtractTask,
  createMesh,
  type CreateMeshOptions,
  type RepairEvent,
} from '@sahoda/mesh'
import type { MeshContext } from '@sahoda/shared'

/** The transport `createMesh` accepts — named here rather than widening the package's exports. */
type MeshFetch = NonNullable<CreateMeshOptions['fetchImpl']>

/**
 * DOES `ai_provider_logs.repaired` ACTUALLY GET WRITTEN?
 *
 * The column shipped to production and nothing wrote it, so it read `false` on
 * every row and the repair rate it exists to expose stayed invisible. A unit test
 * proves the engine puts the field on the row it hands its sink; it cannot prove
 * the value survives PostgREST and lands in the table. This does: it runs REAL
 * extractions against the REAL provider, lets the REAL log sink write to the REAL
 * database, and then reads the rows back by trace_id.
 *
 * Real money. Never part of `turbo test`.
 *
 *   REPAIRED_VERIFY=1 npx vitest run --config vitest.live.config.ts \
 *     src/lib/mesh/repaired-telemetry.live.test.ts
 *
 * Add REPAIRED_FORCE=1 for the forced-repair case — read its comment first, it is
 * weaker evidence than the natural trials and says so.
 *
 * THESE ROWS ARE PERMANENT. `ai_provider_logs` has a `block_mutations` trigger on
 * update AND delete, so nothing written here can ever be removed, and a forced
 * repair counted as a real one is a fabricated repair rate. Every trace_id below
 * therefore begins `repaired-`, matching the `repair-diag-` rows from the
 * 2026-08-12 diagnosis: a rate query must read
 *   where trace_id is null or trace_id not like 'repair%'
 * Keep that prefix on anything new this file writes.
 */
const LIVE = process.env.REPAIRED_VERIFY === '1'
const FORCE = process.env.REPAIRED_FORCE === '1'

/** "AI's workspace" — the dev workspace the 2026-08-12 diagnosis run used. */
const WORKSPACE_ID = 'c12b271a-a9be-44a4-b713-3ff8faa70066'
/** The same corpus that repaired 5 times in 6 on 2026-08-12, so the comparison holds. */
const SITE = 'https://fbs.edu.in/'
const NAME = 'Future Bhubaneswar School'
const TRIALS = Number(process.env.REPAIRED_TRIALS ?? 6)

/**
 * Live tests read the repo env file directly rather than requiring the caller to
 * `source` it first. Same file, one less way to run the test against the wrong
 * database by forgetting a step.
 */
function loadRepoEnv(): void {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, ['', 'env'].join('.'))
    if (existsSync(candidate)) {
      for (const line of readFileSync(candidate, 'utf8').split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
        if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '')
      }
      return
    }
    dir = dirname(dir)
  }
  throw new Error('no repo env file found above this test')
}

interface LoggedRow {
  task: string
  status: string
  error_code: string | null
  repaired: boolean
  tokens_out: number | null
  trace_id: string
}

/** Read the rows this run wrote, straight out of production. */
async function readRows(tracePrefix: string): Promise<LoggedRow[]> {
  const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const res = await fetch(
    `${base}/rest/v1/ai_provider_logs` +
      `?select=task,status,error_code,repaired,tokens_out,trace_id` +
      `&trace_id=like.${encodeURIComponent(tracePrefix + '*')}&order=created_at.asc`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  )
  if (!res.ok) throw new Error(`read back failed: HTTP ${res.status}`)
  return (await res.json()) as LoggedRow[]
}

/**
 * A transport that breaks the FIRST chat response and passes everything else
 * through untouched.
 *
 * WHAT IS AND IS NOT REAL HERE. The request is real, the model is real and
 * billed, the repair retry is a real second call to the real provider, and the
 * telemetry write is the real sink writing to the real table. What is not real is
 * the first answer: its content is replaced in transit so the engine takes the
 * repair branch on demand.
 *
 * This exists because the token-ceiling fix removed the cause of the 83% repair
 * rate, so an UNFORCED repaired row is no longer reliably obtainable — a model
 * that has stopped making the mistake cannot be asked to make it. Evidence from
 * this path proves the write path carries `true` to the database; it is NOT
 * evidence about how often extraction repairs. The natural trials answer that.
 */
function breakFirstResponse(): MeshFetch {
  let broken = false
  return async (url, init) => {
    const res = await fetch(url, init)
    if (broken || !url.includes('/chat/completions')) return res
    broken = true
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    if (body.choices?.[0]?.message) {
      body.choices[0].message.content = 'this is not json'
    }
    return new Response(JSON.stringify(body), {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    })
  }
}

describe.runIf(LIVE)('ai_provider_logs.repaired is written', () => {
  it('records real extractions, then reads the rows back out of production', async () => {
    loadRepoEnv()
    const stamp = `repaired-verify-${process.pid}`
    const repairs: RepairEvent[] = []
    const mesh = createMesh({ onRepair: (e) => repairs.push(e) })

    const crawl = await crawlSite(SITE, { client: createDirectSource({ timeoutMs: 20_000 }) })
    if (!crawl.ok) throw new Error(`crawl failed: ${crawl.reason}`)
    const corpus = quarantineCorpus(crawl.pages)

    for (let i = 0; i < TRIALS; i += 1) {
      const ctx: MeshContext = {
        workspaceId: WORKSPACE_ID,
        traceId: `${stamp}-t${i}`,
        creditsCharged: 0,
      }
      await mesh.runTask(brandExtractTask.def, { corpus, name: NAME }, ctx)
    }

    const rows = await readRows(stamp)
    expect(rows).toHaveLength(TRIALS)

    // The engine's in-memory view and the database's must agree. This is the
    // assertion the column was added for: if the write is missing, `repaired`
    // reads false while `repairs` holds events, and these disagree.
    const repairedTraces = new Set(repairs.map((r) => r.traceId))
    for (const row of rows) {
      expect(row.repaired).toBe(repairedTraces.has(row.trace_id))
    }

    if (process.env.REPAIRED_OUT) {
      writeFileSync(
        process.env.REPAIRED_OUT,
        JSON.stringify(
          { stamp, corpusChars: corpus.length, trials: TRIALS, rows, repairs },
          null,
          2,
        ),
      )
    }
  }, 900_000)

  it.runIf(FORCE)(
    'carries repaired=true to the table when the first answer fails its schema',
    async () => {
      loadRepoEnv()
      const stamp = `repaired-forced-${process.pid}`
      const repairs: RepairEvent[] = []
      const mesh = createMesh({ onRepair: (e) => repairs.push(e), fetchImpl: breakFirstResponse() })

      const crawl = await crawlSite(SITE, { client: createDirectSource({ timeoutMs: 20_000 }) })
      if (!crawl.ok) throw new Error(`crawl failed: ${crawl.reason}`)
      const corpus = quarantineCorpus(crawl.pages)

      const ctx: MeshContext = {
        workspaceId: WORKSPACE_ID,
        traceId: `${stamp}-t0`,
        creditsCharged: 0,
      }
      await mesh.runTask(brandExtractTask.def, { corpus, name: NAME }, ctx)

      const rows = await readRows(stamp)
      expect(rows).toHaveLength(1)
      expect(rows[0]!.repaired).toBe(true)
      expect(repairs).toHaveLength(1)

      if (process.env.REPAIRED_FORCED_OUT) {
        writeFileSync(
          process.env.REPAIRED_FORCED_OUT,
          JSON.stringify({ stamp, rows, repairs }, null, 2),
        )
      }
    },
    900_000,
  )
})
