/**
 * Tear down everything this session created.
 *
 * Kills ONLY processes proved to be ours — by the worktree in /proc/<pid>/cwd, or
 * by the exact port we opened. Three peer sessions are running on this machine;
 * a pattern kill would take them with it.
 */
import { readFileSync, readlinkSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const WT = '/home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-shots'
const SCRATCH =
  '/tmp/claude-1000/-home-divas-Documents-GitHub-sahodalabs/bba3e938-0904-498b-b8eb-82ebf7aa416b/scratchpad'

function pidsOnPort(port) {
  try {
    const ss = execFileSync('ss', ['-ltnp'], { encoding: 'utf8' })
    return ss
      .split('\n')
      .filter((l) => l.includes(`:${port} `))
      .flatMap((l) => [...l.matchAll(/pid=(\d+)/g)].map((m) => Number(m[1])))
  } catch {
    return []
  }
}

function cwdOf(pid) {
  try {
    return readlinkSync(`/proc/${pid}/cwd`)
  } catch {
    return null
  }
}

// ── 1. the Clerk test user ──────────────────────────────────────────────────
try {
  const env = {}
  for (const line of readFileSync(`${WT}/apps/web/.env`, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  const { clerkUserId } = JSON.parse(readFileSync(`${SCRATCH}/deck-user.json`, 'utf8'))
  const res = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
  })
  console.log(`clerk test user ${clerkUserId}: delete -> ${res.status}`)
} catch (e) {
  console.log('clerk cleanup skipped:', e.message)
}

// ── 2. our three ports ──────────────────────────────────────────────────────
for (const [port, label] of [
  [3221, 'next dev'],
  [3223, 'supabase stand-in proxy'],
  [3222, 'postgrest'],
]) {
  for (const pid of pidsOnPort(port)) {
    const cwd = cwdOf(pid)
    // 3221 must be OUR worktree; 3222/3223 we opened ourselves and nothing else uses.
    const ours = port === 3221 ? cwd !== null && cwd.startsWith(WT) : true
    if (!ours) {
      console.log(`port ${port} pid ${pid}: NOT ours (cwd=${cwd}) — left alone`)
      continue
    }
    try {
      process.kill(pid, 'SIGTERM')
      console.log(`killed ${label} pid ${pid} on :${port}`)
    } catch (e) {
      console.log(`could not kill pid ${pid}: ${e.message}`)
    }
  }
}
