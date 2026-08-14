import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

/**
 * `dropSent` — the other half of not losing unsent work (SL-084).
 *
 * The ack path used to call `clearPending`, which wiped the file. That is only
 * safe while every POST carries the entire queue; now that the sync sends the
 * oldest 200, wiping would delete every unsent row past the batch on the first
 * successful sync. It also lost any run recorded during the 8-second request.
 *
 * `OPS_REPO_ROOT` is set before the import because ops-env resolves the root at
 * module load, so a static import would already have pinned the real repo.
 */
const root = mkdtempSync(resolve(tmpdir(), 'sahoda-state-'))
process.env.OPS_REPO_ROOT = root

const { readState, writeState, dropSent } = await import('./ops-state.mjs')

afterAll(() => rmSync(root, { recursive: true, force: true }))

const rows = (n, tag) => Array.from({ length: n }, (_, i) => ({ client_id: `${tag}-${i}` }))

describe('dropSent', () => {
  it('removes exactly the acknowledged prefix and keeps the rest', () => {
    writeState('qa', { version: 1, runs: rows(250, 'r') })

    dropSent('qa', 200)

    const left = readState('qa').runs
    expect(left).toHaveLength(50)
    expect(left[0].client_id).toBe('r-200')
  })

  it('keeps a row appended while the request was in flight', () => {
    // The sequence the old clearPending destroyed: build a payload of 2, a hook
    // records a third mid-POST, the ack arrives. Only the 2 that were sent go.
    writeState('qa', { version: 1, runs: rows(2, 'sent') })
    const sentCount = readState('qa').runs.length

    writeState('qa', { version: 1, runs: [...rows(2, 'sent'), { client_id: 'arrived-late' }] })
    dropSent('qa', sentCount)

    expect(readState('qa').runs).toEqual([{ client_id: 'arrived-late' }])
  })

  it('leaves the queue alone when nothing was sent', () => {
    writeState('changelog', { version: 1, entries: rows(3, 'c') })

    dropSent('changelog', 0)

    expect(readState('changelog').entries).toHaveLength(3)
  })

  it('preserves the file version rather than rewriting the shape', () => {
    writeState('qa', { version: 1, runs: rows(2, 'v') })

    dropSent('qa', 1)

    expect(readState('qa').version).toBe(1)
  })
})
