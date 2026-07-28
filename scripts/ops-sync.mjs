#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { loadEnv, warn } from './lib/ops-env.mjs'
import { readState, clearPending, STATE_DIR } from './lib/ops-state.mjs'
import { ingestVerdict, formatPermanent } from './lib/ops-ingest-verdict.mjs'

/**
 * Mirror ops/state into the dashboard (doc 13 §9.2).
 *
 * THE ONE RULE THIS SCRIPT MUST NEVER BREAK: it does not block work. Every
 * failure path — no token, no server, a 500, a malformed state file, a broken
 * pipe — prints one line and exits 0. It runs from a PostToolUse hook on
 * ordinary edits, so an exit 1 here would stop a developer mid-sentence to
 * report that a dashboard is behind.
 *
 * Usage:
 *   node scripts/ops-sync.mjs                 push current state
 *   node scripts/ops-sync.mjs --full          also archive tasks the repo forgot
 *   node scripts/ops-sync.mjs --hook-write    PostToolUse: sync iff ops/state changed
 *   node scripts/ops-sync.mjs --heartbeat start|stop|idle
 */

const args = new Set(process.argv.slice(2))
const FLAGS = {
  full: args.has('--full'),
  hookWrite: args.has('--hook-write'),
  heartbeat: (() => {
    const raw = process.argv.find((a) => a.startsWith('--heartbeat'))
    if (!raw) return null
    const inline = raw.includes('=') ? raw.split('=')[1] : null
    if (inline) return inline
    const idx = process.argv.indexOf(raw)
    return process.argv[idx + 1] ?? 'start'
  })(),
}

function git(...cliArgs) {
  try {
    return execFileSync('git', cliArgs, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

async function readStdin() {
  if (process.stdin.isTTY) return ''
  const chunks = []
  try {
    for await (const chunk of process.stdin) chunks.push(chunk)
  } catch {
    return ''
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * PostToolUse fires for every Write/Edit in the session. Hook MATCHERS select on
 * tool name only, never on path, so the path filter has to live here — the same
 * shape the repo's existing PreToolUse guard uses.
 */
function hookTouchedState(hookJson) {
  try {
    const parsed = JSON.parse(hookJson)
    const candidates = [
      parsed?.tool_input?.file_path,
      parsed?.tool_input?.notebook_path,
      ...(Array.isArray(parsed?.tool_input?.edits) ? parsed.tool_input.edits.map(() => null) : []),
    ].filter(Boolean)
    return candidates.some((p) => String(p).includes(STATE_DIR))
  } catch {
    return false
  }
}

function sessionIdFrom(hookJson) {
  try {
    const parsed = JSON.parse(hookJson)
    if (typeof parsed?.session_id === 'string' && parsed.session_id) return parsed.session_id
  } catch {
    /* fall through */
  }
  // Not a hook context: one stable session per branch, so repeated manual syncs
  // update a single row rather than littering the pulse strip.
  return `local:${git('rev-parse', '--abbrev-ref', 'HEAD') || 'detached'}`
}

function buildPayload({ source, sessionId, sessionStatus, tasksTouched }) {
  const board = readState('board')
  const roadmap = readState('roadmap')
  const changelog = readState('changelog')
  const qa = readState('qa')

  return {
    source,
    full: FLAGS.full,
    git: {
      branch: git('rev-parse', '--abbrev-ref', 'HEAD') || null,
      subject: git('log', '-1', '--format=%s') || null,
      sha: git('rev-parse', 'HEAD') || null,
    },
    roadmap: Array.isArray(roadmap.items) ? roadmap.items : [],
    tasks: Array.isArray(board.tasks) ? board.tasks : [],
    changelog: Array.isArray(changelog.entries) ? changelog.entries : [],
    qa: Array.isArray(qa.runs) ? qa.runs : [],
    session: sessionStatus
      ? {
          session_id: sessionId,
          label: git('rev-parse', '--abbrev-ref', 'HEAD') || null,
          tasks_touched: tasksTouched,
          status: sessionStatus,
        }
      : null,
  }
}

async function post(payload) {
  const env = loadEnv()
  if (!env.ingestToken) {
    warn('DEVOPS_INGEST_TOKEN is unset or still a placeholder — dashboard not updated.')
    return null
  }

  const url = `${env.ingestUrl.replace(/\/$/, '')}/api/admin/devops/ingest`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ops-token': env.ingestToken },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) {
      const verdict = ingestVerdict({ status: response.status, body: text, url })
      if (verdict.permanent) {
        // Loud, and non-zero when a human asked for this sync. Hooks still exit
        // 0 (doc 13 §9.2 — a hook must never block work), but they print the
        // same block, so the misconfiguration is visible either way.
        console.error(formatPermanent(verdict))
        if (!FLAGS.hookWrite && !FLAGS.heartbeat) process.exitCode = 1
      } else {
        warn(`${verdict.headline} — will replay on the next sync.`)
      }
      return null
    }
    return JSON.parse(text)
  } catch (error) {
    warn(
      `ingest unreachable at ${url} (${error?.name === 'AbortError' ? 'timeout' : 'offline'}) — will replay on the next sync.`,
    )
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const hookJson = FLAGS.hookWrite || FLAGS.heartbeat ? await readStdin() : ''

  if (FLAGS.hookWrite && !hookTouchedState(hookJson)) return

  const board = readState('board')

  // WORK IN FLIGHT, not "everything that is not To Do".
  //
  // The old filter was `!== 'todo'`, which swept in every DONE card — so the
  // session strip announced "Claude is working · SL-001 SL-002 SL-003" while
  // the actual work was SL-015. Those three were finished hours earlier by
  // another session. A strip that names the wrong cards is worse than one that
  // names none: it sends a reader to a card nobody is touching.
  const touched = Array.isArray(board.tasks)
    ? board.tasks
        .filter(
          (t) => (t?.board_column === 'in_progress' || t?.board_column === 'review') && !t.archived,
        )
        .map((t) => t.code)
        .slice(0, 20)
    : []

  const statusFor = { start: 'working', stop: 'idle', idle: 'idle', end: 'ended' }
  const sessionStatus = FLAGS.heartbeat ? (statusFor[FLAGS.heartbeat] ?? 'working') : 'working'

  const payload = buildPayload({
    source: FLAGS.heartbeat
      ? `heartbeat:${FLAGS.heartbeat}`
      : FLAGS.hookWrite
        ? 'hook:write'
        : 'ops-sync',
    sessionId: sessionIdFrom(hookJson),
    sessionStatus,
    tasksTouched: touched,
  })

  const ack = await post(payload)
  if (!ack) return

  // Drain the queues only now. Anything that was not acknowledged stays on disk
  // and goes again next time, which is what makes an offline dev server a delay
  // rather than a hole in the record.
  if (payload.changelog.length > 0) clearPending('changelog')
  if (payload.qa.length > 0) clearPending('qa')

  const parts = ['roadmap', 'tasks', 'changelog', 'qa']
    .map((k) => `${k} ${ack[k] ?? 0}`)
    .join(' · ')
  console.log(`ops: synced — ${parts}${ack.archived ? ` · archived ${ack.archived}` : ''}`)
}

main().catch((error) => {
  // Even an unexpected throw exits 0. See the rule at the top of this file.
  warn(`sync failed: ${error instanceof Error ? error.message : String(error)}`)
})
