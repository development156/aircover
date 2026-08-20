/**
 * The nightly audience pass, as a plain program.
 *
 * ── WHY A PROGRAM AND NOT A ROUTE ────────────────────────────────────────────
 * The same reason its sibling `metric-capture.ts` is one, and the reasoning is
 * recorded in `.github/workflows/metrics-nightly.yml`: nothing in `apps/jobs` has
 * ever been deployed to Trigger.dev, and the Vercel cron cannot schedule a path that
 * is not in the deployed build. `runAudienceCapture` imports neither the Trigger.dev
 * SDK nor anything from Next, so a scheduled GitHub Action can execute it directly
 * with no deploy of any kind.
 *
 * ── HONEST STATUS: NOTHING SCHEDULES THIS YET ────────────────────────────────
 * `metrics-nightly.yml` lives on the DEFAULT branch (GitHub fires `schedule` only
 * from there) and checks out whatever `vars.METRICS_REF` names. That variable does
 * not name this branch. So this program is runnable and is NOT armed, and arming it
 * is an owner action, not a lane's — see `.github/workflows/audience-nightly.yml`
 * in this branch for the step that would do it.
 *
 * ── WHAT IT WILL NOT DO ──────────────────────────────────────────────────────
 * Publish, reply, charge, or change a post. `audienceCaptureDeps` wires only
 * `createZernioReads`, which has no method that can write to a platform, and the one
 * table it touches carries a `block_mutations` trigger on UPDATE and DELETE —
 * VERIFIED on production 2026-08-20 — so this program cannot alter a number it wrote
 * yesterday even by accident.
 *
 * ── WHAT IT PRINTS ───────────────────────────────────────────────────────────
 * Counts and one date. No workspace id, no account id, no customer text, no
 * environment value. Action logs are readable by anyone with repository access, and
 * a secret printed once is a secret to rotate.
 */
import {
  audienceCaptureDeps,
  runAudienceCapture,
  type AudienceCaptureReport,
} from '../src/publish'

/**
 * How many accounts one pass asks about.
 *
 * THREE Zernio requests per account against a 60/min limit, so 50 accounts is 150
 * requests — under three minutes at the limit, with room for their retry budget.
 */
const DEFAULT_BATCH = 50

/**
 * How stale the newest collected day may be before this run is called a stall.
 *
 * `written: 0` is the correct, healthy answer for a second run on the same day — the
 * conflict key is the DAY. It is also exactly what a stall looks like. The
 * discriminator is `newestDay`, and without a threshold nothing ever acts on it.
 * Three days is two clear misses, not one flaky night.
 */
const STALE_AFTER_DAYS = 3

/** Exit codes, so a failure can be told apart from a refusal in the Action's summary. */
const EXIT = { ok: 0, failed: 1, noStorage: 2, stalled: 3 } as const

/**
 * Load a `.env` file for LOCAL runs, without a dependency and without ever overriding
 * something already set.
 *
 * The precedence is deliberate: in CI every value arrives from Actions secrets and
 * there is no file, so this is a no-op there. A file that could override the process
 * environment would let a stale checkout quietly redirect a production write.
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
  dryRun: boolean
}

function parseArgs(argv: readonly string[]): Args {
  let envFile: string | null = null
  let batch = DEFAULT_BATCH
  let dryRun = false
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? ''
    // A bare `--` is an argument SEPARATOR, not an argument. MEASURED on pnpm
    // 11.3.0: `pnpm run x -- --batch 50` forwards the separator itself. Refusing an
    // unrecognised argument is right — a typo'd flag must never be silently ignored
    // on a job that writes to production — but `--` is not one.
    if (arg === '--') continue
    if (arg === '--env-file') envFile = argv[++i] ?? null
    else if (arg.startsWith('--env-file=')) envFile = arg.slice('--env-file='.length)
    else if (arg === '--batch') batch = Number(argv[++i])
    else if (arg.startsWith('--batch=')) batch = Number(arg.slice('--batch='.length))
    else if (arg === '--dry-run') dryRun = true
    else throw new Error(`unknown argument: ${arg}`)
  }
  if (!Number.isInteger(batch) || batch <= 0) throw new Error('--batch must be a positive integer')
  return { envFile, batch, dryRun }
}

/**
 * The four keys this pass cannot run without, named so a misconfigured Action says
 * which one rather than dying inside `pg`. `ZERNIO_API_KEY` is treated as optional by
 * the shared env loader — correct for the publish rails, wrong here, where every
 * target is read through Zernio and a missing key would report a clean night with
 * zero targets for an environment that is simply not provisioned.
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
    throw new Error(`audience-capture: not provisioned — missing ${missing.join(', ')}`)
  }
}

/**
 * The connection family, stated because it is the failure this environment keeps
 * having.
 *
 * MEASURED: `db.<ref>.supabase.co` resolves to AAAA records ONLY — re-confirmed
 * 2026-08-20, 0 A records, 1 AAAA. A GitHub-hosted runner has no IPv6 route, so the
 * direct host hangs there exactly as it did on Vercel; the fix both times is the
 * regional pooler. Printing the CLASSIFICATION (never the value) turns a five-minute
 * hang into a first-line diagnosis.
 */
function describeHost(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl)
    if (url.hostname.includes('pooler.supabase.com')) {
      return `pooler (${url.hostname.split('.')[0]})`
    }
    if (url.hostname.startsWith('db.')) {
      return 'direct db.<ref>.supabase.co — IPv6-ONLY, no A record. A GitHub runner cannot reach this.'
    }
    return 'unrecognised host shape'
  } catch {
    return 'unparseable SUPABASE_DB_URL'
  }
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000)
}

export function summarise(
  report: AudienceCaptureReport,
  now: Date,
): { line: string; exit: number } {
  if (report.storage === 'not-ready') {
    return {
      exit: EXIT.noStorage,
      line:
        'NOWHERE TO STORE: audience_snapshots does not exist in this database. Nothing was ' +
        'written and nothing can be recovered later — apply migration ' +
        '20260820220000_audience_snapshots.sql.',
    }
  }
  if (report.targets === 0) {
    return {
      exit: EXIT.ok,
      line: 'No connected Instagram account could be asked about. Nothing to collect.',
    }
  }
  if (report.newestDay !== null) {
    const age = daysBetween(now, new Date(`${report.newestDay}T00:00:00Z`))
    if (age >= STALE_AFTER_DAYS) {
      return {
        exit: EXIT.stalled,
        line:
          `STALLED: the newest day collected is ${age} days old (${report.newestDay}). The pass ` +
          'ran and collected numbers, but the history is not growing.',
      }
    }
  }
  // Suppression is the EXPECTED answer for most beta accounts and is not a fault. It
  // is called out because a run that is entirely suppressed and a run that read
  // nothing look identical in a row of counts.
  if (report.measured === 0 && report.suppressed === report.targets) {
    return {
      exit: EXIT.ok,
      line:
        `All ${report.targets} account(s) are under Instagram's 100-follower floor, so it ` +
        'withholds demographics. Follower counts were still collected. Nothing is wrong.',
    }
  }
  if (report.collected > 0 && report.written === 0) {
    return {
      exit: EXIT.ok,
      line:
        `Collected ${report.collected} numbers and stored 0 — every day-key was already ` +
        'recorded. This is the ordinary same-day repeat, not a fault.',
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

  const deps = audienceCaptureDeps({ limit: args.batch })
  if (args.dryRun) {
    // Reads only. Named `--dry-run` rather than `--check` because it DOES call
    // Zernio: the point is to see what a real pass would ask about without storing
    // anything, and a version that skipped the calls would prove nothing about them.
    const report = await runAudienceCapture({
      ...deps,
      writeSnapshots: async (rows) => {
        console.log(`dry run: ${rows.length} row(s) would have been written`)
        return { inserted: 0, storage: 'ready' }
      },
    })
    console.log('report: ' + JSON.stringify(report))
    return EXIT.ok
  }

  const report = await runAudienceCapture(deps)
  const finishedAt = new Date()

  console.log('report: ' + JSON.stringify(report))
  const { line, exit } = summarise(report, finishedAt)
  console.log(line)
  console.log(`finished: ${finishedAt.toISOString()}`)
  return exit
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    // The message only. A stack from inside `pg` can carry the connection string.
    console.error(`audience-capture failed: ${error instanceof Error ? error.message : 'unknown'}`)
    process.exitCode = EXIT.failed
  })
