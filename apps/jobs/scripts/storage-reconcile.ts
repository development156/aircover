/**
 * The media-bucket orphan sweep, as a plain program.
 *
 * Same shape and same reasoning as `audience-capture.ts`: nothing in apps/jobs has
 * ever been deployed to Trigger.dev, so the runner that can actually execute this
 * is a scheduled GitHub Action (or a person at a terminal). `runStorageReconcile`
 * imports no scheduler SDK.
 *
 * ── DRY-RUN UNLESS TOLD OTHERWISE, TWICE ─────────────────────────────────────
 * It lists and counts. It deletes only when BOTH `--delete` is passed AND
 * `SAHODA_STORAGE_RECONCILE=delete` is set in the environment. One is a person's
 * intent at the terminal, the other is the environment's consent; a workflow that
 * forgets either removes nothing.
 *
 * ── WHAT IT PRINTS ───────────────────────────────────────────────────────────
 * Counts only. No workspace id, no object name, no environment value.
 *
 * Usage:
 *   pnpm --filter @sahoda/jobs exec tsx scripts/storage-reconcile.ts [--env-file .env] [--delete]
 */
import { runStorageReconcile, storageReconcileMode } from '../src/storage/reconcile'
import { storageReconcileDeps } from '../src/storage/deps'

const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
] as const

async function loadEnvFile(path: string): Promise<void> {
  const fs = await import('node:fs')
  if (!fs.existsSync(path)) throw new Error(`--env-file: no such file: ${path}`)
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
  }
}

function parseArgs(argv: readonly string[]): { envFile: string | null; wantDelete: boolean } {
  let envFile: string | null = null
  let wantDelete = false
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? ''
    if (arg === '--') continue
    if (arg === '--env-file') envFile = argv[++i] ?? null
    else if (arg.startsWith('--env-file=')) envFile = arg.slice('--env-file='.length)
    else if (arg === '--delete') wantDelete = true
    else throw new Error(`unknown argument: ${arg}`)
  }
  return { envFile, wantDelete }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  if (args.envFile) await loadEnvFile(args.envFile)

  const missing = REQUIRED.filter((key) => (process.env[key] ?? '') === '')
  if (missing.length > 0) {
    console.error(`storage-reconcile: not provisioned — missing ${missing.join(', ')}`)
    return 2
  }

  const envMode = storageReconcileMode()
  const mode = args.wantDelete && envMode === 'delete' ? 'delete' : 'dry-run'
  if (args.wantDelete && envMode !== 'delete') {
    console.log(
      'storage-reconcile: --delete given but SAHODA_STORAGE_RECONCILE is not "delete"; dry run',
    )
  }

  const report = await runStorageReconcile(
    storageReconcileDeps({ mode, log: (line) => console.log(line) }),
  )
  console.log(JSON.stringify(report))
  return report.failedWorkspaces > 0 ? 1 : 0
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    console.error(`storage-reconcile: ${error instanceof Error ? error.message : 'failed'}`)
    process.exitCode = 1
  })
