/**
 * The safety proof, taken from the RUNNING PROCESS rather than from the file I wrote.
 *
 * Two separate claims:
 *   1. the server on 3221 is THIS worktree's, not a peer's (reuseExistingServer
 *      would silently attach to someone else's build);
 *   2. nothing in that process's environment names a remote database — proved
 *      POSITIVELY (every URL-ish value resolves to loopback), not by inequality
 *      against one project ref.
 *
 * Prints hosts and variable names. Never a value.
 */
import { readFileSync, readlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const PORT = 3221
const EXPECT_CWD = '/home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-shots'

const ss = execFileSync('ss', ['-ltnp'], { encoding: 'utf8' })
const line = ss.split('\n').find((l) => l.includes(`:${PORT} `))
if (!line) throw new Error(`nothing is listening on ${PORT}`)
const pid = Number(line.match(/pid=(\d+)/)?.[1])
console.log(`── PORT ${PORT} ──`)
console.log('  pid :', pid)

const cwd = readlinkSync(`/proc/${pid}/cwd`)
console.log('  cwd :', cwd)
console.log(
  '  mine:',
  cwd.startsWith(EXPECT_CWD) ? 'YES — this worktree' : `NO — belongs to ${cwd}`,
)
if (!cwd.startsWith(EXPECT_CWD)) process.exit(1)

// ── ENVIRONMENT ────────────────────────────────────────────────────────────
const raw = readFileSync(`/proc/${pid}/environ`, 'utf8')
const env = {}
for (const pair of raw.split('\0')) {
  const i = pair.indexOf('=')
  if (i > 0) env[pair.slice(0, i)] = pair.slice(i + 1)
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1'])
console.log(`\n── EVERY HOST THIS PROCESS CAN NAME (${Object.keys(env).length} vars scanned) ──`)

const remote = []
for (const [k, v] of Object.entries(env)) {
  // Anything shaped like a URL or a postgres DSN.
  const matches = String(v).match(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"']+/gi) ?? []
  for (const m of matches) {
    let host
    try {
      host = new URL(m).hostname
    } catch {
      continue
    }
    const loop = LOOPBACK.has(host)
    console.log(`  ${loop ? 'local ' : 'REMOTE'}  ${k.padEnd(34)} host=${host}`)
    if (!loop) remote.push({ k, host })
  }
}

console.log('\n── SUPABASE / DB VARS ──')
for (const k of [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_DB_URL',
  'DATABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'ZERNIO_API_KEY',
]) {
  const v = env[k]
  let note = 'ABSENT'
  if (v !== undefined) {
    try {
      note = `host=${new URL(v).hostname}`
    } catch {
      note = `present (${v.length} chars)`
    }
  }
  console.log(`  ${k.padEnd(30)} ${note}`)
}

console.log('\n── VERDICT ──')
const dbRemote = remote.filter((r) => /SUPABASE|DATABASE|POSTGRES/i.test(r.k))
if (dbRemote.length > 0) {
  console.log('  FAIL — a database variable names a remote host:', dbRemote)
  process.exit(1)
}
console.log('  No database variable in this process names any remote host.')
console.log(
  remote.length === 0
    ? '  No remote host of any kind in the environment.'
    : `  Remaining remote hosts are non-database: ${[...new Set(remote.map((r) => r.host))].join(', ')}`,
)
