#!/usr/bin/env node
import { execFileSync, execFileSync as run } from 'node:child_process'
import { warn } from './lib/ops-env.mjs'
import { readState, writeState, clientId } from './lib/ops-state.mjs'
import {
  classifyBashRuns,
  closingTaskCodes,
  invokesOpsScript,
  isGitCommit,
} from './lib/ops-classify.mjs'

/**
 * PostToolUse(Bash) → the QA feed and the board (doc 13 §9.3).
 *
 * Two jobs, decided by what the command was:
 *   · a test/lint/typecheck run  → append an auto QA run to qa.pending.json
 *   · a `git commit`             → move every SL-### in the message to done,
 *                                  stamped with the sha that just landed
 *
 * Everything else is ignored, and everything here exits 0. This runs after every
 * Bash call a developer makes; blocking on it would be intolerable, and doc 13
 * §9.2 says so outright.
 */

const SYNC = new URL('./ops-sync.mjs', import.meta.url).pathname

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
 * The PostToolUse payload does not carry a Bash exit code in every Claude Code
 * build, so every plausible spelling is checked and `null` is an accepted answer.
 * The classifier treats null as "read the output instead", and reads nothing into
 * it when the output is also silent.
 */
function exitCodeFrom(response) {
  for (const key of ['exit_code', 'exitCode', 'returnCode', 'code', 'status']) {
    const value = response?.[key]
    if (typeof value === 'number') return value
  }
  return null
}

function outputFrom(response) {
  if (typeof response === 'string') return response
  return [response?.stdout, response?.stderr].filter(Boolean).join('\n')
}

function sync() {
  try {
    run(process.execPath, [SYNC], { stdio: 'inherit', timeout: 15000 })
  } catch {
    // ops-sync already exits 0 on its own failures; this catch is for the
    // spawn itself dying, which still must not surface here.
  }
}

/** The card an auto run belongs to: whatever is in progress right now. */
function currentTaskCode() {
  const board = readState('board')
  const inProgress = (board.tasks ?? []).find(
    (t) => t?.board_column === 'in_progress' && !t?.archived,
  )
  return inProgress?.code ?? null
}

function recordQaRuns(entries) {
  const qa = readState('qa')
  const now = new Date().toISOString()
  const task_code = currentTaskCode()

  qa.runs = [
    ...(Array.isArray(qa.runs) ? qa.runs : []),
    ...entries.map((entry) => ({
      client_id: clientId('qa'),
      task_code,
      kind: 'auto',
      actor: 'claude',
      started_at: now,
      finished_at: now,
      ...entry,
    })),
  ].slice(-200)
  writeState('qa', qa)
}

function markCommitted(codes) {
  if (codes.length === 0) return false

  let sha = ''
  try {
    sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    sha = ''
  }

  const board = readState('board')
  const known = new Set((board.tasks ?? []).map((t) => t?.code))
  const unknown = codes.filter((code) => !known.has(code))
  if (unknown.length > 0) {
    // Loudly, because doc 13 §9.4 requires work to be on the board BEFORE it is
    // done. A commit naming a card that does not exist is a process miss, and
    // silently inventing the card would hide it.
    warn(`commit names ${unknown.join(', ')} — not on the board; add the card first.`)
  }

  board.tasks = (board.tasks ?? []).map((task) =>
    codes.includes(task?.code)
      ? { ...task, board_column: 'done', ...(sha ? { commit_sha: sha } : {}) }
      : task,
  )
  writeState('board', board)
  return true
}

async function main() {
  const raw = await readStdin()
  if (!raw.trim()) return

  let hook
  try {
    hook = JSON.parse(raw)
  } catch {
    return
  }
  if (hook?.tool_name !== 'Bash') return

  const command = hook?.tool_input?.command
  if (typeof command !== 'string' || command.trim() === '') return

  // Never let the sync script's own invocations recurse into more syncs.
  // RUNS one, not MENTIONS one — `git add scripts/ops-sync.mjs` is a commit.
  if (invokesOpsScript(command)) return

  if (isGitCommit(command)) {
    const codes = closingTaskCodes(command)
    if (markCommitted(codes)) {
      console.log(`ops: ${codes.join(', ')} → done`)
      sync()
    }
    return
  }

  const entries = classifyBashRuns({
    command,
    output: outputFrom(hook?.tool_response),
    exitCode: exitCodeFrom(hook?.tool_response),
    durationMs: hook?.tool_response?.duration_ms ?? null,
  })

  // Empty means the outcome could not be read. Recording nothing is the point —
  // a QA console that invents green rows is worse than one with gaps.
  if (entries.length === 0) return

  recordQaRuns(entries)
  console.log(`ops: QA ${entries.map((e) => `${e.suite} ${e.status}`).join(' · ')}`)
  sync()
}

main().catch((error) => {
  warn(`bash hook failed: ${error instanceof Error ? error.message : String(error)}`)
})
