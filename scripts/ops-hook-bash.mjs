#!/usr/bin/env node
import { execFileSync, execFileSync as run } from 'node:child_process'
import { warn } from './lib/ops-env.mjs'
import { readState, writeState, readPending, appendPending, clientId } from './lib/ops-state.mjs'
import { appendCapped, ceilingWarning } from './lib/ops-queue.mjs'
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

/**
 * AN AUTO RUN IS ATTRIBUTED TO NOTHING, BECAUSE NOTHING HERE KNOWS THE CARD.
 *
 * This used to return "whatever is in progress right now" — the first card in
 * the in_progress column. That is not an inference, it is a coincidence, and it
 * wrote FALSE AUDIT RECORDS: every gate run any session made was stamped
 * `SL-054`, the card recording that production was down for 22 hours 40 minutes,
 * as `pass` and as `fail` alike (REQUESTS §18, observed twice — 2026-08-24 and
 * 2026-08-26).
 *
 * `scripts/lib/ops-cards.mjs` already carries the ruling this violates: **infer
 * only what cannot be recorded, and say so where it shows.** A gate run records
 * which SUITE ran and what it returned. Which card it belongs to is not recorded
 * anywhere, is not derivable from the command, and a session can have many cards
 * open or none — so the honest value is null.
 *
 * Null is a rendered state, not a gap: `qa-run-row.tsx` prints "no card" for it,
 * and its own comment says why — "a run attached to nothing is a real state, and
 * saying so is what stops it being read as attached to whatever is above". The
 * `OpsQaRunSchema.task_code` field is `nullish()` for the same reason.
 *
 * The commit path is untouched and stays: `markCommitted` reads SL-### codes out
 * of the commit MESSAGE, which is a link a person actually wrote down.
 */
const AUTO_RUN_TASK_CODE = null

/**
 * Append auto runs to the outbox.
 *
 * This function ended with `.slice(-200)` until SL-084, which made it a ring
 * buffer over rows that had never been sent anywhere — see the header of
 * scripts/lib/ops-queue.mjs for what that cost. It now refuses at the ceiling
 * instead of evicting, and says so.
 */
function recordQaRuns(entries) {
  const queued = readPending('qa')
  const now = new Date().toISOString()
  const task_code = AUTO_RUN_TASK_CODE

  const arriving = entries.map((entry) => ({
    client_id: clientId('qa'),
    task_code,
    kind: 'auto',
    actor: 'claude',
    started_at: now,
    finished_at: now,
    ...entry,
  }))

  const { items, accepted, refused } = appendCapped(queued, arriving)

  // The ceiling is decided against the WHOLE queue (baseline plus overlay) and
  // then only the accepted rows are appended. `items` is not written anywhere:
  // writing it back would put this session's scratch QA runs into a tracked file
  // that `.githooks/pre-commit` refuses by name, which is the contradiction this
  // whole overlay exists to end.
  appendPending('qa', arriving.slice(0, accepted))

  const warning = ceilingWarning({ queue: 'QA', refused, queued: items.length })
  if (warning) console.error(warning)

  return accepted
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

  // Only what was actually written is announced. A refused run has already had
  // its own block printed, and reporting it here as recorded would be the same
  // fake success the ceiling exists to prevent.
  const accepted = recordQaRuns(entries)
  if (accepted > 0) {
    console.log(
      `ops: QA ${entries
        .slice(0, accepted)
        .map((e) => `${e.suite} ${e.status}`)
        .join(' · ')}`,
    )
  }
  sync()
}

main().catch((error) => {
  warn(`bash hook failed: ${error instanceof Error ? error.message : String(error)}`)
})
