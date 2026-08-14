import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { QUEUE_CEILING, WIRE_BATCH_MAX } from './ops-queue.mjs'

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

const queue = () =>
  JSON.parse(readFileSync(resolve(root, 'ops/state/qa.pending.json'), 'utf8')).runs

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
