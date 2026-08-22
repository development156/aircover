/**
 * THE NIGHTLY RADAR PASS, as a plain program.
 *
 * Same shape and the same reasons as `metric-capture.ts` beside it: it imports
 * neither the Trigger.dev SDK nor anything from Next, so a scheduled GitHub
 * Action can run it tonight with no deploy of any kind.
 *
 * ── WHY NOT TRIGGER.DEV, WHICH IS NOMINALLY THE JOB RUNNER ───────────────────
 * The key in the environment is a `tr_dev_` SDK runtime key and
 * `trigger.dev whoami` answers "You must login first". Nothing in this repository
 * has ever deployed there. That is a fact about today, not a design position.
 *
 * ── WHAT IT PRINTS ───────────────────────────────────────────────────────────
 * Counts, rates and money. No competitor name, no workspace id, no customer text,
 * no environment value. GitHub Actions logs are retained and readable by anyone
 * with repository access, and a secret printed once is a secret to rotate.
 *
 * ── WHAT IT WILL NOT DO ──────────────────────────────────────────────────────
 * Publish, reply, charge a customer's credits, or touch a post. It reads public
 * pages and writes four Radar tables, two of which refuse UPDATE outright.
 */
import pg from 'pg'

import { createRadarPgDb } from '../src/radar/pg'
import { runRadarPass, type RadarPassReport } from '../src/radar/run'

const DEFAULT_BATCH = 100

/** Exit codes, so a refusal reads differently from a failure in the Action's summary. */
const EXIT = { ok: 0, failed: 1, noStorage: 2, capped: 3 } as const

async function loadEnvFile(path: string): Promise<number> {
  const fs = await import('node:fs')
  if (!fs.existsSync(path)) throw new Error(`--env-file: no such file: ${path}`)
  let applied = 0
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed
      .slice(0, eq)
      .replace(/^export\s+/, '')
      .trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    // Never overrides something already set: in CI every value comes from
    // Actions secrets, and a file that could override them would let a stale
    // checkout quietly redirect a production write.
    if (key === '' || process.env[key] !== undefined) continue
    process.env[key] = value
    applied += 1
  }
  return applied
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

/**
 * Say which address family the database host resolves to, first line.
 *
 * MEASURED 2026-08-19 on the metrics collector: `db.<ref>.supabase.co` carries
 * AAAA records only and a GitHub-hosted runner has no IPv6 route, so the direct
 * host hangs there exactly as it did on Vercel. The regional pooler carries A
 * records and works. Printing the family turns a ten-minute silent timeout into
 * one legible line.
 */
async function classifyHost(url: string): Promise<string> {
  const dns = await import('node:dns/promises')
  let host: string
  try {
    host = new URL(url.replace(/^postgres(ql)?:/, 'http:')).hostname
  } catch {
    return 'database host: unparseable'
  }
  try {
    const addresses = await dns.lookup(host, { all: true })
    const families = [...new Set(addresses.map((a) => a.family))].sort().join('+')
    const kind = host.includes('pooler') ? 'pooler' : 'DIRECT'
    return `database host: ${kind}, IPv${families}${families === '6' ? '  ← a GitHub runner cannot reach this' : ''}`
  } catch {
    return 'database host: does not resolve'
  }
}

function print(report: RadarPassReport): void {
  const { spendMicros: s } = report
  const usd = (m: number) => `$${(m / 1_000_000).toFixed(6)}`
  console.log(`considered        ${report.considered}`)
  console.log(`unchanged         ${report.unchanged}`)
  console.log(`changed           ${report.changed}`)
  console.log(`could not check   ${report.couldNotCheck}   <- GAPS, not quiet days`)
  console.log(`refused by cap    ${report.refused.length}`)
  for (const r of report.refused.slice(0, 5)) console.log(`  · ${r.reason}`)
  console.log(`snapshots written ${report.snapshotsWritten}`)
  console.log(`changes written   ${report.changesWritten}`)
  console.log(`free-check rate   ${(report.freeCheckRate * 100).toFixed(1)}%`)
  // Split, never summed into one figure: Zyte reports cost nowhere, so an
  // estimate added to a measurement is not a total, it is a guess with a
  // decimal point.
  console.log(`spend measured    ${usd(s.measured)}`)
  console.log(`spend estimated   ${usd(s.estimated)}   <- list price, unverifiable`)
}

async function main(): Promise<number> {
  const envFile = arg('env-file')
  if (envFile) console.log(`env file: applied ${await loadEnvFile(envFile)} value(s)`)

  const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? ''
  if (dbUrl === '') {
    console.error('missing required env — SUPABASE_DB_URL')
    return EXIT.noStorage
  }
  console.log(await classifyHost(dbUrl))

  for (const name of ['APIFY_TOKEN', 'ZYTE_API_KEY'] as const) {
    // Named, never echoed. A missing provider is not fatal: the sources it would
    // serve are recorded as gaps and the rest of the pass still runs.
    if (!process.env[name]) console.log(`${name}: absent — its sources will be recorded as gaps`)
  }

  const pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    max: 4,
  })

  try {
    const report = await runRadarPass({
      db: createRadarPgDb(pool),
      fetch: globalThis.fetch as never,
      ...(process.env.APIFY_TOKEN ? { apifyToken: process.env.APIFY_TOKEN } : {}),
      ...(process.env.ZYTE_API_KEY ? { zyteApiKey: process.env.ZYTE_API_KEY } : {}),
      batch: Number(arg('batch') ?? DEFAULT_BATCH),
    })
    print(report)
    // A capped pass is not a failure — it is the cap working — but it must be
    // distinguishable in the Action's summary from a clean night.
    return report.refused.length > 0 ? EXIT.capped : EXIT.ok
  } finally {
    await pool.end()
  }
}

process.exitCode = await main().catch((error: unknown) => {
  console.error(`radar pass failed: ${error instanceof Error ? error.name : 'Error'}`)
  return EXIT.failed
})
