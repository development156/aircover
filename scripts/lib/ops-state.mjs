import { createHash } from 'node:crypto'
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
  return pathAt(loadEnv().repoRoot, FILES[name])
}

function pathAt(repoRoot, file) {
  return resolve(repoRoot, file)
}

/**
 * Read a state file from an explicit root.
 *
 * `loadEnv` resolves the repository root once at module load, so a test that
 * spawns a script against a temp directory cannot use the cached form. This
 * takes the root as an argument for exactly that case.
 */
export function readStateAt(repoRoot, name) {
  try {
    const parsed = JSON.parse(readFileSync(pathAt(repoRoot, FILES[name]), 'utf8'))
    if (!parsed || typeof parsed !== 'object') return structuredClone(EMPTY[name])
    return parsed
  } catch {
    return structuredClone(EMPTY[name])
  }
}

export function readState(name) {
  return readStateAt(loadEnv().repoRoot, name)
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

/**
 * ── THE PENDING QUEUES ARE NO LONGER WRITTEN IN PLACE (2026-08-31) ──────────
 *
 * `ops/state/qa.pending.json` is TRACKED, and `.githooks/pre-commit` refuses by
 * name any commit that stages it. Those two facts were fine until the file was
 * committed with 178 runs still in it. From then on every sync did its job —
 * post the runs, drop what the server acknowledged — and left the file empty on
 * disk against a HEAD that holds 2,121 lines. The working tree was permanently
 * modified with a change that is forbidden to commit, and every session was
 * nagged to commit something the hook exists to refuse.
 *
 * The drain is NOT the defect: dropping acknowledged rows is what keeps the
 * outbox from filling to its ceiling and refusing new runs. What was wrong is
 * WHERE the drained state was written. So the tracked file is now a read-only
 * BASELINE, and every mutation a queue undergoes lives in an untracked overlay
 * beside it:
 *
 *   tracked   ops/state/qa.pending.json        never written by these scripts
 *   overlay   ops/state/.pending.local.json    gitignored, per checkout
 *
 * The queue a caller sees is `baseline minus what has been sent, plus what this
 * checkout has appended`. Nothing queued is deleted, nothing unsent is skipped,
 * and `git status` stays clean through any number of syncs.
 *
 * WHY A CURSOR AND NOT A LIST OF SENT IDS: the same reason `dropSent` drops by
 * position rather than by matching `client_id`. A row with a missing or
 * duplicated id would match nothing, the drop would remove zero rows, and the
 * queue would never drain — the old wedge wearing a different hat.
 *
 * WHY THE CURSOR IS FINGERPRINTED: a cursor is a count into a file this
 * checkout does not own. A `git pull` can rewrite the baseline underneath it,
 * and a count that survives that would skip rows nobody ever sent. So the
 * overlay stores a hash of the prefix it claims to have sent; if the baseline
 * no longer starts with that prefix the cursor resets to zero and those rows go
 * again. Re-sending is FREE and losing is not: `ops_qa_runs.client_id` and
 * `ops_changelog.client_id` are unique indexes and `public.ops_ingest` inserts
 * `on conflict (client_id) do nothing`, so the server discards a duplicate. The
 * safe direction is always "send it twice".
 *
 * APPENDS. Only the QA queue appends into the overlay. The changelog is written
 * by a person running `/log-change`, and doc 13 §9.1 says state files are
 * reviewable in the PR like any code — a changelog entry belongs in the diff.
 * QA runs are the opposite: the pre-commit hook calls that file scratch outright
 * because a hook attributes every run to whichever card happens to be open. So
 * the queue that must never enter a commit is the queue whose appends stay off
 * the tracked file.
 */
export const PENDING_OVERLAY_FILE = 'ops/state/.pending.local.json'

/** Which queues append into the overlay rather than the tracked file. See above. */
const OVERLAY_APPENDS = { qa: true, changelog: false }

const EMPTY_QUEUE_OVERLAY = { drained: 0, drained_fingerprint: null, appended: [] }

function overlayPath(repoRoot) {
  return resolve(repoRoot, PENDING_OVERLAY_FILE)
}

/** A hash of the rows this checkout claims it has already sent. Not a security value. */
function fingerprint(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 32)
}

export function readOverlay(repoRoot = loadEnv().repoRoot) {
  try {
    const parsed = JSON.parse(readFileSync(overlayPath(repoRoot), 'utf8'))
    if (!parsed || typeof parsed !== 'object') return { version: 1, queues: {} }
    return { version: 1, queues: {}, ...parsed }
  } catch {
    // Absent, half-written or malformed all read as "nothing has been sent from
    // this checkout yet", which re-sends rather than skips. Same rule as every
    // other reader here: a hook must not throw.
    return { version: 1, queues: {} }
  }
}

function writeOverlay(repoRoot, overlay) {
  const file = overlayPath(repoRoot)
  mkdirSync(dirname(file), { recursive: true })
  // Prettier's own shape, for the reason writeState matches it: the file sits
  // inside a directory `prettier --check .` walks.
  writeFileSync(file, `${JSON.stringify(overlay, null, 2)}\n`, 'utf8')
}

function queueOverlay(overlay, name) {
  const stored = overlay?.queues?.[name]
  if (!stored || typeof stored !== 'object') return { ...EMPTY_QUEUE_OVERLAY }
  return {
    drained: Number.isInteger(stored.drained) && stored.drained > 0 ? stored.drained : 0,
    drained_fingerprint:
      typeof stored.drained_fingerprint === 'string' ? stored.drained_fingerprint : null,
    appended: Array.isArray(stored.appended) ? stored.appended : [],
  }
}

/**
 * How much of the baseline this checkout has genuinely sent.
 *
 * Zero the moment the baseline no longer starts with the prefix the overlay
 * hashed — see WHY THE CURSOR IS FINGERPRINTED above.
 */
function validDrain(baseline, q) {
  const drained = Math.min(q.drained, baseline.length)
  if (drained === 0) return 0
  return fingerprint(baseline.slice(0, drained)) === q.drained_fingerprint ? drained : 0
}

/**
 * The unsent queue, as every caller used to read it straight off the file.
 *
 * Pure, and exported, so a test that has spawned a script against a temp root
 * can compute the same view without importing a module whose env cache has
 * already pinned the real repository.
 */
export function pendingView(baselineRows, storedQueueOverlay) {
  const baseline = Array.isArray(baselineRows) ? baselineRows : []
  const q = queueOverlay({ queues: { x: storedQueueOverlay } }, 'x')
  return [...baseline.slice(validDrain(baseline, q)), ...q.appended]
}

/** Read the unsent queue for `name` from an explicit root. */
export function readPendingAt(repoRoot, name) {
  const baseline = readStateAt(repoRoot, name)[ROWS[name]]
  return pendingView(baseline, readOverlay(repoRoot).queues?.[name])
}

/**
 * THE replacement for `readState('qa').runs`. Everything that treats a pending
 * file as an outbox reads this instead, so the baseline and the overlay can
 * never be reasoned about separately by accident.
 */
export function readPending(name) {
  return readPendingAt(loadEnv().repoRoot, name)
}

/**
 * Add rows to a pending queue. Appends land in the overlay or in the tracked
 * file per OVERLAY_APPENDS; either way nothing already queued is touched.
 */
export function appendPending(name, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return

  const repoRoot = loadEnv().repoRoot

  if (!OVERLAY_APPENDS[name]) {
    const state = readState(name)
    const key = ROWS[name]
    const existing = Array.isArray(state[key]) ? state[key] : []
    writeState(name, { ...state, [key]: [...existing, ...rows] })
    return
  }

  const overlay = readOverlay(repoRoot)
  const q = queueOverlay(overlay, name)
  overlay.queues = { ...overlay.queues, [name]: { ...q, appended: [...q.appended, ...rows] } }
  writeOverlay(repoRoot, overlay)
}

/** Drain a pending queue after the server has acknowledged it — never before. */
export function clearPending(name) {
  dropSent(name, readPending(name).length)
}

/**
 * Drop the rows a POST just had acknowledged, and nothing else (SL-084).
 *
 * The queue is FIFO and the sync sends the OLDEST `WIRE_BATCH_MAX` rows, so what
 * was acknowledged is exactly the first `count` — the queue is re-read here so
 * that anything appended while the request was in flight survives.
 *
 * This replaced `clearPending` on the ack path, which wiped the whole file. That
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
 *
 * SINCE 2026-08-31 THIS WRITES THE OVERLAY AND NEVER THE TRACKED FILE. The
 * observable behaviour is unchanged: `readPending` returns exactly what this
 * function used to leave on disk. What changed is that `git status` stays clean.
 */
export function dropSent(name, count) {
  if (!Number.isInteger(count) || count <= 0) return

  const repoRoot = loadEnv().repoRoot
  const baseline = (() => {
    const rows = readState(name)[ROWS[name]]
    return Array.isArray(rows) ? rows : []
  })()

  const overlay = readOverlay(repoRoot)
  const q = queueOverlay(overlay, name)
  const drained = validDrain(baseline, q)

  // The acknowledged prefix spans the baseline remainder first, then this
  // checkout's own appends — the same order `pendingView` hands them out in, so
  // a count taken from that view drops exactly the rows it counted.
  const fromBaseline = Math.min(count, baseline.length - drained)
  const fromAppended = count - fromBaseline
  const nextDrained = drained + fromBaseline

  overlay.queues = {
    ...overlay.queues,
    [name]: {
      drained: nextDrained,
      drained_fingerprint: fingerprint(baseline.slice(0, nextDrained)),
      appended: fromAppended > 0 ? q.appended.slice(fromAppended) : q.appended,
    },
  }
  writeOverlay(repoRoot, overlay)
}

/** Stable-enough id for rows the server dedupes on. Not a security value. */
export function clientId(prefix) {
  const rand = Math.floor(Math.random() * 0xffffffff).toString(16)
  return `${prefix}-${Date.now().toString(36)}-${rand}`.slice(0, 64)
}
