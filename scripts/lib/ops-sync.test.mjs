import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { QUEUE_CEILING, WIRE_BATCH_MAX } from './ops-queue.mjs'
import { pendingView, PENDING_OVERLAY_FILE } from './ops-state.mjs'

/**
 * The real sync script, both paths (SL-084).
 *
 * WHY THERE IS NO SERVER HERE. The acknowledged path is the one that decides
 * what gets DELETED from the outbox, so it has to be exercised — but a test that
 * needs a live listener is a test that hangs or self-skips the first time it
 * meets a restricted sandbox, and this repo already has a card open about
 * counting a test that never ran as one that passed. So `fetch` is replaced
 * inside the child by `node --import`, which touches no production code: the
 * script still calls the real global fetch and knows nothing about the stub.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SYNC = resolve(HERE, '../ops-sync.mjs')
const STUB = pathToFileURL(resolve(HERE, 'stub-ingest-fetch.mjs')).href

/** Port 1 is reserved and nothing listens on it. */
const NOWHERE = 'http://127.0.0.1:1'

let root

const rows = (n) => Array.from({ length: n }, (_, i) => ({ client_id: `qa-${i}` }))

const seed = (runs) => {
  mkdirSync(resolve(root, 'ops/state'), { recursive: true })
  writeFileSync(resolve(root, 'ops/state/qa.pending.json'), JSON.stringify({ version: 1, runs }))
  writeFileSync(
    resolve(root, 'ops/state/changelog.pending.json'),
    JSON.stringify({ version: 1, entries: [{ client_id: 'cl-0' }] }),
  )
  writeFileSync(resolve(root, 'ops/state/board.json'), JSON.stringify({ version: 1, tasks: [] }))
  writeFileSync(resolve(root, 'ops/state/roadmap.json'), JSON.stringify({ version: 1, items: [] }))
}

/**
 * What is still UNSENT — which is what every assertion below has always meant.
 *
 * It is no longer the contents of the tracked file. The sync leaves that file
 * byte-identical and records what the server acknowledged in an untracked
 * overlay beside it, so the queue is the baseline minus that prefix. `pendingView`
 * is the same pure function the scripts use, called here on files this test has
 * read for itself rather than through the module's cached repo root.
 */
const queue = () => {
  const baseline = JSON.parse(readFileSync(resolve(root, 'ops/state/qa.pending.json'), 'utf8')).runs
  let overlay = {}
  try {
    overlay = JSON.parse(readFileSync(resolve(root, PENDING_OVERLAY_FILE), 'utf8'))
  } catch {
    /* no sync has acknowledged anything yet */
  }
  return pendingView(baseline, overlay?.queues?.qa)
}

const trackedBytes = () => readFileSync(resolve(root, 'ops/state/qa.pending.json'), 'utf8')

/** Run the real sync with the stub standing in for the ingest endpoint. */
function runSyncAcknowledged(args = []) {
  const capture = resolve(root, 'sent.json')
  const result = spawnSync(process.execPath, [SYNC, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_OPTIONS: `--import ${STUB}`,
      OPS_STUB_CAPTURE: capture,
      OPS_REPO_ROOT: root,
      OPS_INGEST_URL: 'http://ingest.test',
      DEVOPS_INGEST_TOKEN: 't',
    },
  })
  return {
    ...result,
    output: result.stdout + result.stderr,
    sent: JSON.parse(readFileSync(capture, 'utf8')),
  }
}

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), 'sahoda-sync-'))
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('syncing a backed-up queue', () => {
  it('never sends more rows than the ingest contract accepts', () => {
    // 201 rows is a 400 on the WHOLE payload, and ingestVerdict calls a 400
    // permanent — the queue would stop draining for ever. This is the guard that
    // makes removing the eviction safe.
    seed(rows(QUEUE_CEILING))

    const { sent } = runSyncAcknowledged()

    expect(sent.qa).toHaveLength(WIRE_BATCH_MAX)
    expect(sent.qa[0].client_id).toBe('qa-0')
  })

  it('drops only what was acknowledged, leaving the backlog on disk', () => {
    seed(rows(WIRE_BATCH_MAX + 51))

    runSyncAcknowledged()

    const left = queue()
    expect(left).toHaveLength(51)
    expect(left[0].client_id).toBe(`qa-${WIRE_BATCH_MAX}`)
  })

  it('says out loud that a backlog is still waiting', () => {
    seed(rows(WIRE_BATCH_MAX + 51))

    expect(runSyncAcknowledged().output).toContain('51 qa still queued')
  })

  it('drains a queue that fits in one batch, and reports no backlog', () => {
    seed(rows(3))

    const { output } = runSyncAcknowledged()

    expect(queue()).toEqual([])
    expect(output).not.toContain('still queued')
  })

  /**
   * ── THE WORKING TREE IS NOT THE SYNC'S SCRATCH SPACE ─────────────────────
   *
   * `ops/state/qa.pending.json` is TRACKED, and `.githooks/pre-commit` refuses
   * by name any commit that stages it. A drain that rewrote it therefore left
   * every checkout whose HEAD held queued runs permanently modified with a
   * change nobody was allowed to commit: 2,121 deleted lines that could not be
   * committed and would not go away.
   *
   * This is the guard. Put `dropSent` back on the tracked file and it goes red.
   */
  it('leaves the tracked pending file byte-identical', () => {
    seed(rows(3))
    const before = trackedBytes()

    runSyncAcknowledged()

    expect(trackedBytes()).toBe(before)
    // Not vacuously true: the sync really did drain, it just did it elsewhere.
    expect(queue()).toEqual([])
  })

  it('does not re-send what a previous sync already had acknowledged', () => {
    // The other half of the same claim. Leaving the file alone must not mean
    // posting the same rows for ever.
    seed(rows(3))
    runSyncAcknowledged()

    expect(runSyncAcknowledged().sent.qa).toEqual([])
  })

  it('keeps the queue when the endpoint refuses the payload', () => {
    // A 400 is permanent, so the rows must survive it for a human to fix.
    seed(rows(4))

    const result = spawnSync(process.execPath, [SYNC], {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_OPTIONS: `--import ${STUB}`,
        OPS_STUB_STATUS: '400',
        OPS_REPO_ROOT: root,
        OPS_INGEST_URL: 'http://ingest.test',
        DEVOPS_INGEST_TOKEN: 't',
      },
    })

    expect(queue()).toHaveLength(4)
    expect(result.stdout + result.stderr).toContain('refused the payload')
  })
})

describe('syncing to an endpoint that is not there', () => {
  it('keeps every queued run and says the board was not updated', () => {
    // The week that lost 140 runs, in one test: the endpoint answers nothing,
    // so the outbox must be exactly as full afterwards as it was before.
    seed(rows(5))

    const result = spawnSync(process.execPath, [SYNC], {
      encoding: 'utf8',
      env: {
        ...process.env,
        OPS_REPO_ROOT: root,
        OPS_INGEST_URL: NOWHERE,
        DEVOPS_INGEST_TOKEN: 't',
      },
    })

    expect(queue()).toHaveLength(5)
    expect(result.stdout + result.stderr).toContain('THE BOARD WAS NOT UPDATED')
    // Non-zero because a human asked for this sync. Hooks pass --hook-write.
    expect(result.status).toBe(1)
  })

  it('still exits 0 when it runs as a hook, and still keeps the queue', () => {
    // Doc 13 §9.2 — a hook may never block work, however bad the news is.
    seed(rows(3))

    const result = spawnSync(process.execPath, [SYNC, '--hook-write'], {
      input: JSON.stringify({ tool_input: { file_path: `${root}/ops/state/qa.pending.json` } }),
      encoding: 'utf8',
      env: {
        ...process.env,
        OPS_REPO_ROOT: root,
        OPS_INGEST_URL: NOWHERE,
        DEVOPS_INGEST_TOKEN: 't',
      },
    })

    expect(result.status).toBe(0)
    expect(queue()).toHaveLength(3)
  })
})
