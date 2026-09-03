import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { QUEUE_CEILING } from './ops-queue.mjs'
import { pendingView, PENDING_OVERLAY_FILE } from './ops-state.mjs'

/**
 * The QA hook, run for real, against a throwaway repo root (SL-084).
 *
 * The pure tests next door prove that `appendCapped` decides correctly. They
 * cannot prove that the hook ACTS on the decision — that it writes what it kept
 * and prints what it refused. Requirement 2 of this card is entirely about the
 * printing, and a warning that no test names is a warning that can be deleted
 * with every suite still green.
 *
 * So this spawns the actual script. `OPS_REPO_ROOT` points it at a temp
 * directory; `DEVOPS_INGEST_TOKEN` is blanked so the sync it triggers reads as
 * unconfigured and never opens a socket.
 */

const HOOK = resolve(dirname(fileURLToPath(import.meta.url)), '../ops-hook-bash.mjs')

let root

const stateFile = (name) => resolve(root, 'ops/state', name)

const seed = (runs) => {
  mkdirSync(resolve(root, 'ops/state'), { recursive: true })
  writeFileSync(stateFile('qa.pending.json'), JSON.stringify({ version: 1, runs }))
  writeFileSync(stateFile('board.json'), JSON.stringify({ version: 1, tasks: [] }))
}

/**
 * The unsent queue, which is what every assertion here has always meant.
 *
 * A recorded run no longer lands in the tracked file: that file is TRACKED and
 * `.githooks/pre-commit` refuses any commit that stages it, so writing a
 * session's scratch runs there left a working tree that could never be made
 * clean. The runs go to an untracked overlay beside it and the queue is the two
 * read together, through the same pure function the scripts use.
 */
const readQueue = () => {
  const baseline = JSON.parse(readFileSync(stateFile('qa.pending.json'), 'utf8')).runs
  let overlay = {}
  try {
    overlay = JSON.parse(readFileSync(resolve(root, PENDING_OVERLAY_FILE), 'utf8'))
  } catch {
    /* nothing recorded yet */
  }
  return pendingView(baseline, overlay?.queues?.qa)
}

/** A green unit run — classifyBashRuns turns this into exactly one QA row. */
const GREEN_RUN = JSON.stringify({
  tool_name: 'Bash',
  tool_input: { command: 'pnpm vitest run' },
  tool_response: { stdout: ' Tests  4 passed (4)', exit_code: 0 },
})

function runHook(payload) {
  const result = spawnSync(process.execPath, [HOOK], {
    input: payload,
    encoding: 'utf8',
    env: { ...process.env, OPS_REPO_ROOT: root, DEVOPS_INGEST_TOKEN: '' },
  })

  // Doc 13 §9.2: this runs after every Bash call a developer makes, so it exits
  // 0 on every path. A non-zero here is itself a defect.
  expect(result.status).toBe(0)

  return { stdout: result.stdout, stderr: result.stderr, output: result.stdout + result.stderr }
}

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), 'sahoda-qa-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('the QA hook writing to a full queue', () => {
  it('appends a run when there is room', () => {
    seed([])

    runHook(GREEN_RUN)

    const queue = readQueue()
    expect(queue).toHaveLength(1)
    expect({ suite: queue[0].suite, status: queue[0].status }).toEqual({
      suite: 'unit',
      status: 'pass',
    })
  })

  it('records the run without touching the tracked file', () => {
    // The whole point of the overlay. `.githooks/pre-commit` refuses a commit
    // that stages ops/state/qa.pending.json, so a hook that writes it dirties a
    // tree that cannot then be cleaned by committing.
    seed([{ client_id: 'qa-committed-0', suite: 'unit', status: 'pass' }])
    const before = readFileSync(stateFile('qa.pending.json'), 'utf8')

    runHook(GREEN_RUN)

    expect(readFileSync(stateFile('qa.pending.json'), 'utf8')).toBe(before)
    expect(readQueue()).toHaveLength(2)
  })

  it('does not evict a single unsent run when the queue is full', () => {
    // 140 real QA runs died exactly here. The oldest row is the one the old
    // `.slice(-200)` deleted, so it is the one this names.
    const queued = Array.from({ length: QUEUE_CEILING }, (_, i) => ({
      client_id: `qa-seed-${i}`,
      suite: 'unit',
      status: 'pass',
    }))
    seed(queued)

    runHook(GREEN_RUN)

    const after = readQueue()
    expect(after).toHaveLength(QUEUE_CEILING)
    expect(after[0].client_id).toBe('qa-seed-0')
    expect(after.at(-1).client_id).toBe(`qa-seed-${QUEUE_CEILING - 1}`)
  })

  it('SHOUTS about the run it refused', () => {
    seed(
      Array.from({ length: QUEUE_CEILING }, (_, i) => ({
        client_id: `qa-seed-${i}`,
        suite: 'unit',
        status: 'pass',
      })),
    )

    const { output } = runHook(GREEN_RUN)

    expect(output).toContain('REFUSED')
    expect(output).toContain('pnpm ops:sync')
  })

  it('never claims to have recorded a run it refused', () => {
    seed(
      Array.from({ length: QUEUE_CEILING }, (_, i) => ({
        client_id: `qa-seed-${i}`,
        suite: 'unit',
        status: 'pass',
      })),
    )

    const { output } = runHook(GREEN_RUN)

    // No success line AT ALL, not merely no accurate one. Asserting the absence
    // of `ops: QA unit pass` was the first version of this and a mutation walked
    // straight through it: dropping the `accepted > 0` guard prints `ops: QA `
    // with an empty suite list, which is not the string but is exactly the
    // "something was recorded" impression the guard exists to prevent.
    expect(output).not.toContain('ops: QA ')
    expect(output).toContain('REFUSED')
  })
})
