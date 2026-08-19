import { describe, expect, test } from 'vitest'

import {
  expectedVersionFor,
  inconclusive,
  versionsFromRows,
  VERSIONS_UNSUPPORTED,
} from './variant-version'

/**
 * Working out whether this database tracks versions, from the rows it returned.
 *
 * ── WHY PRESENCE AND NOT AN ERROR CODE ───────────────────────────────────────
 * The obvious detector asks for the column and reads the failure. That means
 * matching a code — Postgres reports a missing column one way, the API layer in
 * front of it another — and nothing in this run could observe the second one. A
 * detector built on an unobserved code picks the wrong branch silently, and the
 * wrong branch here means going back to last-write-wins while appearing to work.
 *
 * So it looks at the rows the read already returned, which cannot be wrong about
 * a database it is looking straight at.
 */

const row = (over: Record<string, unknown> = {}) => ({
  id: 'a',
  channel: 'instagram',
  body: 'hello',
  ...over,
})

describe('reading versions off the rows', () => {
  test('says not tracked when the column is absent from real rows', () => {
    // Production today. Every save must behave exactly as it always has.
    expect(versionsFromRows([row(), row({ channel: 'x' })])).toEqual(VERSIONS_UNSUPPORTED)
  })

  test('says tracked, with each channel’s number, once the column is there', () => {
    const versions = versionsFromRows([row({ version: 3 }), row({ channel: 'x', version: 1 })])

    expect(versions).toEqual({ supported: true, byChannel: { instagram: 3, x: 1 } })
  })

  test('treats a version that is not a whole number as no version at all', () => {
    // Sending a bad one would make every save a refusal the writer cannot clear.
    const versions = versionsFromRows([row({ version: 'four' }), row({ channel: 'x', version: 2 })])

    expect(versions).toEqual({ supported: true, byChannel: { x: 2 } })
  })

  test('leaves the question open when there are no rows to look at', () => {
    // A post with no channel copy yet. No rows carry no columns, so this tells us
    // nothing — and answering "not tracked" here would put the FIRST save of a new
    // post back on last-write-wins, which is the save two tabs race on most.
    expect(inconclusive([])).toBe(true)
    expect(inconclusive([row()])).toBe(false)
  })
})

describe('what to send with a save', () => {
  test('sends nothing at all when the column is not there', () => {
    // `undefined` is the signal for "do not compare". It is NOT interchangeable
    // with null, which means "compare against no row yet" and would create.
    expect(expectedVersionFor(VERSIONS_UNSUPPORTED, 'instagram')).toBeUndefined()
  })

  test('sends null for a channel with no copy yet', () => {
    const versions = { supported: true, byChannel: { x: 2 } } as const
    expect(expectedVersionFor(versions, 'instagram')).toBeNull()
  })

  test('sends the stored number for a channel that has copy', () => {
    const versions = { supported: true, byChannel: { x: 2 } } as const
    expect(expectedVersionFor(versions, 'x')).toBe(2)
  })
})
