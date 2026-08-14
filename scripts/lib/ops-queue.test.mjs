import { describe, expect, it } from 'vitest'

import {
  appendCapped,
  ceilingWarning,
  planSync,
  takeBatch,
  QUEUE_CEILING,
  WIRE_BATCH_MAX,
} from './ops-queue.mjs'

/**
 * The rule these pin: a pending queue is an OUTBOX, so nothing already in it is
 * ever removed to make room, and running out of room is never quiet (SL-084).
 */

const rows = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ id: from + i }))

describe('appendCapped', () => {
  it('keeps every queued row when the new ones do not fit', () => {
    // The exact shape of the loss: 200 unsent rows, one more arrives. The old
    // `.slice(-200)` answered by deleting row 0. Nothing may be deleted.
    const queued = rows(QUEUE_CEILING)

    const result = appendCapped(queued, rows(1, 9000))

    expect(result.items).toHaveLength(QUEUE_CEILING)
    expect(result.items[0]).toEqual({ id: 0 })
    expect(result.items.at(-1)).toEqual({ id: QUEUE_CEILING - 1 })
    expect({ accepted: result.accepted, refused: result.refused }).toEqual({
      accepted: 0,
      refused: 1,
    })
  })

  it('says so when it refuses', () => {
    expect(appendCapped(rows(QUEUE_CEILING), rows(3)).atCeiling).toBe(true)
  })

  it('accepts up to the ceiling and refuses only the remainder', () => {
    const result = appendCapped(rows(QUEUE_CEILING - 2), rows(5, 500))

    expect(result.items).toHaveLength(QUEUE_CEILING)
    expect({ accepted: result.accepted, refused: result.refused }).toEqual({
      accepted: 2,
      refused: 3,
    })
  })

  it('fills the last free slot rather than refusing one row early', () => {
    // The boundary in both directions: at ceiling-1 there is room for exactly
    // one, and adding it must not itself trip the ceiling.
    const result = appendCapped(rows(QUEUE_CEILING - 1), rows(1, 700))

    expect(result.items).toHaveLength(QUEUE_CEILING)
    expect({ accepted: result.accepted, atCeiling: result.atCeiling }).toEqual({
      accepted: 1,
      atCeiling: false,
    })
  })

  it('appends in order and stays quiet when there is room', () => {
    const result = appendCapped(rows(2), rows(2, 100))

    expect(result.items.map((r) => r.id)).toEqual([0, 1, 100, 101])
    expect(result.atCeiling).toBe(false)
  })

  it('treats a missing or malformed queue as empty rather than throwing', () => {
    // readState returns the empty shape for a half-written file; the writer must
    // not be the thing that turns that into a crashed hook.
    expect(appendCapped(undefined, rows(1)).items).toHaveLength(1)
    expect(appendCapped('not an array', rows(1)).accepted).toBe(1)
  })
})

describe('takeBatch', () => {
  it('sends the OLDEST rows, so a backlog drains in order', () => {
    const batch = takeBatch(rows(WIRE_BATCH_MAX + 40))

    expect(batch).toHaveLength(WIRE_BATCH_MAX)
    expect(batch[0]).toEqual({ id: 0 })
    expect(batch.at(-1)).toEqual({ id: WIRE_BATCH_MAX - 1 })
  })

  it('never exceeds what the ingest contract accepts', () => {
    // 201 rows is a 400 on the WHOLE payload, which ingestVerdict calls
    // permanent — the queue would wedge shut instead of draining.
    expect(takeBatch(rows(QUEUE_CEILING)).length).toBeLessThanOrEqual(WIRE_BATCH_MAX)
  })

  it('returns nothing for an empty or malformed queue', () => {
    expect(takeBatch([])).toEqual([])
    expect(takeBatch(null)).toEqual([])
  })
})

describe('planSync', () => {
  it('never plans a payload the ingest route would reject', () => {
    // 201 rows is a 400 on the WHOLE payload — board and roadmap with it — and
    // ingestVerdict calls a 400 permanent. This is the difference between a
    // queue that drains slowly and one that never drains again.
    const plan = planSync({ changelog: rows(QUEUE_CEILING), qa: rows(QUEUE_CEILING) })

    expect(plan.qa).toHaveLength(WIRE_BATCH_MAX)
    expect(plan.changelog).toHaveLength(WIRE_BATCH_MAX)
  })

  it('reports what it is leaving behind', () => {
    const plan = planSync({ changelog: rows(3), qa: rows(WIRE_BATCH_MAX + 51) })

    expect(plan.backlog).toEqual({ changelog: 0, qa: 51 })
  })

  it('plans the oldest rows first, so a backlog drains in order', () => {
    const plan = planSync({ changelog: [], qa: rows(WIRE_BATCH_MAX + 10) })

    expect(plan.qa[0]).toEqual({ id: 0 })
    expect(plan.qa.at(-1)).toEqual({ id: WIRE_BATCH_MAX - 1 })
  })

  it('plans nothing, and no backlog, for empty queues', () => {
    expect(planSync({ changelog: [], qa: [] })).toEqual({
      changelog: [],
      qa: [],
      backlog: { changelog: 0, qa: 0 },
    })
  })
})

describe('ceilingWarning', () => {
  it('stays silent when nothing was refused', () => {
    expect(ceilingWarning({ queue: 'QA', refused: 0, queued: 12 })).toBeNull()
  })

  it('names the count, the queue and what to do about it', () => {
    const message = ceilingWarning({ queue: 'QA', refused: 3, queued: QUEUE_CEILING })

    expect(message).toContain('3 QA entries were REFUSED')
    expect(message).toContain(`${QUEUE_CEILING}/${QUEUE_CEILING}`)
    expect(message).toContain('pnpm ops:sync')
    // The one promise the old code broke, stated in the output a human reads.
    expect(message).toContain('Nothing queued was deleted')
  })
})
