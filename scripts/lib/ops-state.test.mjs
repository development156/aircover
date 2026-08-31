import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * `dropSent` — the other half of not losing unsent work (SL-084), and since
 * 2026-08-31 the half that also keeps the working tree clean.
 *
 * The ack path used to call `clearPending`, which wiped the file. That is only
 * safe while every POST carries the entire queue; now that the sync sends the
 * oldest 200, wiping would delete every unsent row past the batch on the first
 * successful sync. It also lost any run recorded during the 8-second request.
 *
 * These tests read the queue through `readPending` rather than off the file,
 * because the file is now a baseline and the queue is a VIEW over it. Every
 * claim below is the same claim it was: what a drain leaves behind. The one
 * added claim is that the drain no longer touches the tracked bytes.
 *
 * `OPS_REPO_ROOT` is set before the import because ops-env resolves the root at
 * module load, so a static import would already have pinned the real repo.
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 * The `readFileSync` below reads the TEMPORARY tree this file created, never
 * the repository. So "the drain did not touch the tracked bytes" is proven
 * about a fixture, and this file cannot see a write to the real
 * `ops/state/*.json` made through any path that does not go through
 * `ops-state.mjs`: a script writing the file directly, a shell redirect in a
 * hook, or the sync process itself. The pre-commit hook is what catches those,
 * and it is tested separately in `pre-commit-hook.test.mjs`.
 */
const root = mkdtempSync(resolve(tmpdir(), 'sahoda-state-'))
process.env.OPS_REPO_ROOT = root

const { readState, writeState, readPending, appendPending, dropSent } =
  await import('./ops-state.mjs')

afterAll(() => rmSync(root, { recursive: true, force: true }))

// Each test seeds its own baseline with writeState; the overlay has to be reset
// with it, or one test's appended rows are another test's queue. The scripts
// themselves never delete this file: it is the record of what has been sent.
beforeEach(() => rmSync(resolve(root, 'ops/state/.pending.local.json'), { force: true }))

const rows = (n, tag) => Array.from({ length: n }, (_, i) => ({ client_id: `${tag}-${i}` }))
const trackedBytes = (file) => readFileSync(resolve(root, 'ops/state', file), 'utf8')

describe('dropSent', () => {
  it('removes exactly the acknowledged prefix and keeps the rest', () => {
    writeState('qa', { version: 1, runs: rows(250, 'r') })

    dropSent('qa', 200)

    const left = readPending('qa')
    expect(left).toHaveLength(50)
    expect(left[0].client_id).toBe('r-200')
  })

  it('keeps a row appended while the request was in flight', () => {
    // The sequence the old clearPending destroyed: build a payload of 2, a hook
    // records a third mid-POST, the ack arrives. Only the 2 that were sent go.
    writeState('qa', { version: 1, runs: rows(2, 'sent') })
    const sentCount = readPending('qa').length

    appendPending('qa', [{ client_id: 'arrived-late' }])
    dropSent('qa', sentCount)

    expect(readPending('qa')).toEqual([{ client_id: 'arrived-late' }])
  })

  it('leaves the queue alone when nothing was sent', () => {
    writeState('changelog', { version: 1, entries: rows(3, 'c') })

    dropSent('changelog', 0)

    expect(readPending('changelog')).toHaveLength(3)
  })

  it('preserves the file version rather than rewriting the shape', () => {
    writeState('qa', { version: 1, runs: rows(2, 'v') })

    dropSent('qa', 1)

    expect(readState('qa').version).toBe(1)
  })
})

/**
 * ── THE TRACKED FILE IS NOT SCRATCH FOR THE SYNC TO REWRITE ─────────────────
 *
 * `ops/state/qa.pending.json` is tracked AND `.githooks/pre-commit` refuses any
 * commit that stages it. While the drain wrote that file, a checkout whose HEAD
 * held queued runs was left permanently modified with a change nobody was
 * allowed to commit. These are the guards on the fix, and they fail loudly if
 * anybody points a queue writer back at the tracked bytes.
 */
describe('the tracked pending file', () => {
  it('is byte-identical after a drain', () => {
    writeState('qa', { version: 1, runs: rows(5, 'keep') })
    const before = trackedBytes('qa.pending.json')

    dropSent('qa', 5)

    expect(trackedBytes('qa.pending.json')).toBe(before)
    // And the drain really happened: the queue is empty, so nothing re-sends.
    expect(readPending('qa')).toEqual([])
  })

  it('is byte-identical after a QA run is recorded', () => {
    writeState('qa', { version: 1, runs: rows(1, 'base') })
    const before = trackedBytes('qa.pending.json')

    appendPending('qa', [{ client_id: 'fresh-run' }])

    expect(trackedBytes('qa.pending.json')).toBe(before)
    expect(readPending('qa').map((r) => r.client_id)).toEqual(['base-0', 'fresh-run'])
  })

  it('re-sends rather than skips when the baseline changes under the cursor', () => {
    // A `git pull` can rewrite the file this cursor counts into. Skipping rows
    // nobody sent would be a hole in the record; re-sending costs nothing,
    // because ops_qa_runs.client_id is unique and ops_ingest inserts
    // `on conflict do nothing`.
    writeState('qa', { version: 1, runs: rows(3, 'old') })
    dropSent('qa', 3)
    expect(readPending('qa')).toEqual([])

    writeState('qa', { version: 1, runs: rows(3, 'pulled') })

    expect(readPending('qa').map((r) => r.client_id)).toEqual(['pulled-0', 'pulled-1', 'pulled-2'])
  })

  it('keeps a changelog entry in the tracked file, where a reviewer reads it', () => {
    // The asymmetry is deliberate: a changelog entry is typed by a person and
    // belongs in the pull request diff (doc 13 §9.1). Only the QA queue, which
    // the pre-commit hook calls scratch outright, appends off the tracked file.
    writeState('changelog', { version: 1, entries: [] })

    appendPending('changelog', [{ client_id: 'cl-visible' }])

    expect(readState('changelog').entries).toEqual([{ client_id: 'cl-visible' }])
    expect(readPending('changelog')).toEqual([{ client_id: 'cl-visible' }])
  })

  it('does not rewrite the changelog file when that entry is acknowledged', () => {
    writeState('changelog', { version: 1, entries: [{ client_id: 'cl-sent' }] })
    const before = trackedBytes('changelog.pending.json')

    dropSent('changelog', 1)

    expect(trackedBytes('changelog.pending.json')).toBe(before)
    expect(readPending('changelog')).toEqual([])
  })
})
