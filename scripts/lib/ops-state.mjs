import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { loadEnv } from './ops-env.mjs'

/**
 * Read/write for `ops/state/*.json` (doc 13 §9.1).
 *
 * These files are committed and reviewable like any code. Two of them are
 * PENDING queues — changelog and QA — which the sync drains only after the
 * server has acknowledged, so a failed sync loses nothing and the next one
 * replays. The other two are full state: re-posting them converges.
 *
 * Everything here tolerates a missing or malformed file by returning the empty
 * shape. A hook that throws because a JSON file was half-written by a concurrent
 * formatter would block work, and doc 13 §9.2 is explicit that sync never does.
 */

const FILES = {
  roadmap: 'ops/state/roadmap.json',
  board: 'ops/state/board.json',
  changelog: 'ops/state/changelog.pending.json',
  qa: 'ops/state/qa.pending.json',
}

const EMPTY = {
  roadmap: { version: 1, items: [] },
  board: { version: 1, tasks: [] },
  changelog: { version: 1, entries: [] },
  qa: { version: 1, runs: [] },
}

/** Which key holds the rows, per state file. */
const ROWS = {
  roadmap: 'items',
  board: 'tasks',
  changelog: 'entries',
  qa: 'runs',
}

export const STATE_DIR = 'ops/state'

function pathFor(name) {
  return resolve(loadEnv().repoRoot, FILES[name])
}

export function readState(name) {
  try {
    const parsed = JSON.parse(readFileSync(pathFor(name), 'utf8'))
    if (!parsed || typeof parsed !== 'object') return structuredClone(EMPTY[name])
    return parsed
  } catch {
    return structuredClone(EMPTY[name])
  }
}

/**
 * Written the way prettier would write it — two-space indent, trailing newline.
 *
 * Not cosmetic: `.prettierignore` does not cover ops/state, so the repo's
 * PostToolUse formatter rewrites these files after every edit. Matching its
 * output makes that a no-op instead of a second write racing the sync that the
 * first one triggered.
 */
export function writeState(name, value) {
  const file = pathFor(name)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export function stateExists(name) {
  return existsSync(pathFor(name))
}

/** Drain a pending queue after the server has acknowledged it — never before. */
export function clearPending(name) {
  writeState(name, structuredClone(EMPTY[name]))
}

/**
 * Drop the rows a POST just had acknowledged, and nothing else (SL-084).
 *
 * The queue is FIFO and the sync sends the OLDEST `WIRE_BATCH_MAX` rows, so what
 * was acknowledged is exactly the first `count` — the file is re-read here so
 * that anything appended while the request was in flight survives.
 *
 * This replaces `clearPending` on the ack path, which wiped the whole file. That
 * was correct only while a payload always carried the entire queue; the moment
 * the sync started batching it would have thrown away every unsent row past 200
 * on the first successful sync, which is the shredder again wearing a different
 * hat. It is also why a QA run recorded during the 8-second POST window used to
 * be lost.
 *
 * Rows are dropped by POSITION rather than by matching `client_id`: a row with a
 * missing or duplicated id would match nothing, the drop would silently remove
 * zero rows, and the queue would never drain — the same wedge, via identity
 * instead of size.
 */
export function dropSent(name, count) {
  if (!Number.isInteger(count) || count <= 0) return

  const state = readState(name)
  const key = ROWS[name]
  const rows = Array.isArray(state[key]) ? state[key] : []

  writeState(name, { ...state, [key]: rows.slice(count) })
}

/** Stable-enough id for rows the server dedupes on. Not a security value. */
export function clientId(prefix) {
  const rand = Math.floor(Math.random() * 0xffffffff).toString(16)
  return `${prefix}-${Date.now().toString(36)}-${rand}`.slice(0, 64)
}
