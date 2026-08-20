import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { LOOP_REF_PREFIX, newLoopCycleRef, newLoopBriefRef, isLoopRef } from './object-ref'

/** The migration that carries the matching `like` pattern. */
const RPC_SQL = resolve(
  import.meta.dirname,
  '../../../../../packages/db/supabase/migrations/20260820000400_loop_rpcs.sql',
)

describe('Loop ledger refs', () => {
  it('agrees with the pattern the kill switch actually greps for', () => {
    // NOT a restatement of the constant — this READS THE SQL FILE. The two live
    // in different languages in different packages and nothing but this line
    // makes them move together. A rename on either side goes red here.
    const sql = readFileSync(RPC_SQL, 'utf8')
    expect(sql).toContain(`object_ref like '${LOOP_REF_PREFIX}%'`)
  })

  it('gives every ref the prefix the kill switch can see', () => {
    expect(isLoopRef(newLoopCycleRef('c-1'))).toBe(true)
    expect(isLoopRef(newLoopBriefRef('b-1'))).toBe(true)
  })

  it('is fresh per call — a stable ref would replay a spent charge', () => {
    const a = newLoopCycleRef('c-1')
    const b = newLoopCycleRef('c-1')
    expect(a).not.toBe(b)
    expect(new Set([a, b, newLoopBriefRef('b'), newLoopBriefRef('b')]).size).toBe(4)
  })

  it('carries the id, so a ledger row can be traced back to what it paid for', () => {
    expect(newLoopCycleRef('abc')).toContain(':cycle:abc:')
    expect(newLoopBriefRef('xyz')).toContain(':brief:xyz:')
  })

  it('rejects a ref built any other way', () => {
    // This is the failure the prefix guards against: a Loop charge written with
    // the plan-week ref shape is a hold the kill switch cannot find.
    expect(isLoopRef('ws-1:plan_week:uuid')).toBe(false)
    expect(isLoopRef('')).toBe(false)
  })
})
