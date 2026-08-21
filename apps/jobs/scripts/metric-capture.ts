/**
 * The nightly metric-history pass, as a plain program.
 *
 * ── WHY THIS EXISTS WHEN A ROUTE ALREADY DOES ────────────────────────────────
 * `apps/web/src/app/api/cron/metrics/route.ts` is the same job behind a Vercel
 * cron. MEASURED 2026-08-19 against the live production alias: `/api/cron/sweeps`
 * answers 401 (the route is in the build, its guard fired) and `/api/cron/metrics`
 * answers 404, byte-identical to a path that was never written. Production is built
 * from `wt-web`, and the metrics route has never been merged into it. Vercel cannot
 * schedule a path that is not in the deployed build, so the collection has never run
 * once — while `post_metric_snapshots` holds 27 rows across 3 days, every one of them
 * written by hand.
 *
 * Merging is 79 commits and 410 files into the branch that serves customers, and that
 * is a decision, not a task. `runMetricCapture` imports neither the Trigger.dev SDK nor
 * anything from Next, so it can be executed directly by a scheduled GitHub Action
 * tonight, with no deploy of any kind. That is what this file is for.
 *
 * ── WHAT IT WILL NOT DO ──────────────────────────────────────────────────────
 * Publish, reply, charge, or change a post. `metricCaptureDeps` wires only
 * `createZernioReads`, which has no method that can write to a platform, and the one
 * table it touches carries a `block_mutations` trigger on UPDATE and DELETE — MEASURED
 * on production — so this program cannot alter a number it wrote yesterday even by
 * accident.
 *
 * ── WHAT IT PRINTS ───────────────────────────────────────────────────────────
 * Counts and one timestamp. No post id, no workspace id, no customer text, no
 * environment value. GitHub Actions logs are retained and readable by anyone with
 * repository access, and a secret printed once is a secret to rotate.
 */
import { metricCaptureDeps, runMetricCapture, type MetricCaptureReport } from '../src/publish'

/** Matches the route's ceiling. One Zernio request per target, and they rate-limit at 60/min. */
const DEFAULT_BATCH = 120

/**
 * How stale the newest measurement may be before this run is called a stall.
 *
 * `written: 0` is the correct, healthy answer for a second run on the same day — the
 * conflict key is the DAY. It is also exactly what a stall looks like. The discriminator
 * is `newestMeasuredAt`, and without a threshold nothing ever acts on it. Three days is
 * two clear misses, not one flaky night.
 */
const STALE_AFTER_DAYS = 3

/** Exit codes, so a failure can be told apart from a refusal in the Action's summary. */
const EXIT = { ok: 0, failed: 1, noStorage: 2, stalled: 3 } as const

/**
 * Load a `.env` file for LOCAL runs, without adding a dependency and without ever
 * overriding something already set.
 *
 * The precedence is deliberate: in CI every value arrives from GitHub Actions secrets and
 * there is no file, so this is a no-op there. Locally the file fills the gaps. A file that
 * could override the process environment would let a stale checkout quietly redirect a
 * production write, which is the one mistake this program must not make.
 */
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
    if (key === '' || process.env[key] !== undefined) continue
    process.env[key] = value
    applied += 1
  }
  return applied
}

interface Args {
  envFile: string | null
  batch: number
}

function parseArgs(argv: readonly string[]): Args {
  let envFile: string | null = null
  let batch = DEFAULT_BATCH
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    // `argv[i]` is `string | undefined` under `noUncheckedIndexedAccess`, which
    // this file had never been told about: apps/jobs/tsconfig.json only included
    // `src`, `tests` and `trigger.config.ts`, so everything in `scripts/` — this
    // job and the audience capture beside it — compiled unchecked. wt-audience
    // added `scripts` to the include and that is what surfaced it.
    //
    // `continue`, not a non-null assertion: the loop is bounded by argv.length so
    // this cannot actually happen, and the point of the flag is that the compiler
    // should not have to take my word for that.
    if (arg === undefined) continue
    // A bare `--` is an argument SEPARATOR, not an argument.
    //
    // MEASURED 2026-08-20 on pnpm 11.3.0: `pnpm run metrics:capture -- --batch 120`
    // forwards the separator itself, so the script received `['--', '--batch', '120']`
    // and died on `unknown argument: --`. Refusing an unrecognised argument is right —
    // a typo'd flag must never be silently ignored on a job that writes to production
    // — but `--` is not one, and every wrapper in this ecosystem emits it.
    if (arg === '--') continue
    if (arg === '--env-file') envFile = argv[++i] ?? null
    else if (arg.startsWith('--env-file=')) envFile = arg.slice('--env-file='.length)
    else if (arg === '--batch') batch = Number(argv[++i])
    else if (arg.startsWith('--batch=')) batch = Number(arg.slice('--batch='.length))
    else throw new Error(`unknown argument: ${arg}`)
  }
  if (!Number.isInteger(batch) || batch <= 0) throw new Error(`--batch must be a positive integer`)
  return { envFile, batch }
}

/**
 * The four keys this pass cannot run without, named so a misconfigured Action says which
 * one rather than dying inside `pg`. `loadJobsEnv` already refuses on the first three;
 * `ZERNIO_API_KEY` it treats as optional — correct for the publish rails, wrong here,
 * where every single target is read through Zernio and a missing key would report a clean
 * night with zero targets for an environment that is simply not provisioned.
 */
const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
  'ZERNIO_API_KEY',
] as const

/** Names only. Never a value, never a length, never a prefix. */
function assertProvisioned(): void {
  const missing = REQUIRED.filter((key) => (process.env[key] ?? '') === '')
  if (missing.length > 0) {
    throw new Error(`metric-capture: not provisioned — missing ${missing.join(', ')}`)
  }
}

/**
 * The connection family, stated because it is the failure this environment keeps having.
 *
 * MEASURED: `db.<ref>.supabase.co` resolves to AAAA records only. A GitHub-hosted runner
 * has no IPv6 route, so the direct host times out there exactly as it did on Vercel — the
 * fix both times is the regional pooler. Printing the CLASSIFICATION (never the value)
 * turns a five-minute hang into a first-line diagnosis.
 */
function describeHost(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl)
    if (url.hostname.includes('pooler.supabase.com'))
      return `pooler (${url.hostname.split('.')[0]})`
    if (url.hostname.startsWith('db.'))
      return 'direct db.<ref>.supabase.co — IPv6-ONLY, no A record'
    return 'unrecognised host shape'
  } catch {
    return 'unparseable SUPABASE_DB_URL'
  }
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000)
}

function summarise(report: MetricCaptureReport, now: Date): { line: string; exit: number } {
  if (report.storage === 'not-ready') {
    return {
      exit: EXIT.noStorage,
      line:
        'NOWHERE TO STORE: post_metric_snapshots does not exist in this database. ' +
        'Nothing was written and nothing can be recovered later — apply migration ' +
        '20260819000100_post_metric_snapshots.sql.',
    }
  }
  if (report.targets === 0) {
    return { exit: EXIT.ok, line: 'No published channel could be asked about. Nothing to collect.' }
  }
  if (report.newestMeasuredAt !== null) {
    const age = daysBetween(now, new Date(report.newestMeasuredAt))
    if (age >= STALE_AFTER_DAYS) {
      return {
        exit: EXIT.stalled,
        line:
          `STALLED: the newest measurement any platform reported is ${age} days old ` +
          `(${report.newestMeasuredAt}). The pass ran and collected numbers, but the history ` +
          'is not growing.',
      }
    }
  }
  if (report.collected > 0 && report.written === 0) {
    return {
      exit: EXIT.ok,
      line:
        `Collected ${report.collected} numbers and stored 0 — every day-key was already ` +
        `recorded. This is the ordinary same-day repeat, not a fault.`,
    }
  }
  return {
    exit: EXIT.ok,
    line: `Stored ${report.written} new rows across ${report.daysInBatch} day-key(s).`,
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  if (args.envFile !== null) {
    const applied = await loadEnvFile(args.envFile)
    console.log(`env-file: ${args.envFile} — ${applied} key(s) applied (existing values kept)`)
  }
  assertProvisioned()
  console.log(`database host: ${describeHost(process.env.SUPABASE_DB_URL ?? '')}`)

  const startedAt = new Date()
  console.log(
    `started: ${startedAt.toISOString()}  (UTC day-key ${startedAt.toISOString().slice(0, 10)})`,
  )

  const report = await runMetricCapture(metricCaptureDeps({ limit: args.batch }))
  const finishedAt = new Date()

  // Counts and one timestamp. Deliberately the same body the route returns.
  console.log('report: ' + JSON.stringify(report))
  const { line, exit } = summarise(report, finishedAt)
  console.log(line)
  console.log(
    `finished: ${finishedAt.toISOString()}  (${finishedAt.getTime() - startedAt.getTime()} ms)`,
  )
  return exit
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    // The message only. A stack from `pg` can carry the connection string.
    console.error(
      'metric-capture FAILED: ' + (error instanceof Error ? error.message : String(error)),
    )
    process.exit(EXIT.failed)
  })
