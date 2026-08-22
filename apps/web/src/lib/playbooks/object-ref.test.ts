import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  PLAYBOOK_REF_PREFIX,
  isPlaybookRef,
  newPlaybookItemRef,
  newPlaybookRunRef,
} from './object-ref'

/**
 * THE PREFIX THE KILL SWITCH LOOKS FOR, PINNED TO THE SQL THAT LOOKS FOR IT.
 *
 * `playbook_kill_switch` finds outstanding holds with `object_ref like
 * 'playbook:%'`. A charge written with any other prefix is a hold the switch
 * CANNOT SEE — which is exactly the case the switch exists for, and it would
 * fail silently.
 */
const RPCS = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../../packages/db/supabase/migrations/20260822030100_playbook_rpcs.sql',
  ),
  'utf8',
)

describe('playbook ledger refs', () => {
  it('uses the prefix the kill switch searches for', () => {
    const pattern = /object_ref like '([a-z_]+:)%'/.exec(RPCS)
    expect(pattern, 'the kill switch no longer filters holds by prefix').toBeTruthy()
    expect(pattern![1]).toBe(PLAYBOOK_REF_PREFIX)
  })

  it('gives every ref that prefix', () => {
    expect(isPlaybookRef(newPlaybookRunRef('r1'))).toBe(true)
    expect(isPlaybookRef(newPlaybookItemRef('i1'))).toBe(true)
    expect(isPlaybookRef('loop:cycle:1')).toBe(false)
  })

  it('makes each ref FRESH, so a settled charge is never replayed', () => {
    // `withCredits` keys exactly-once on (action, objectRef) and REUSES a
    // DEBIT-settled attempt, so a stable ref would run the paid model call and
    // bill nobody — a free generation and a hole in the ledger's own account.
    expect(newPlaybookItemRef('i1')).not.toBe(newPlaybookItemRef('i1'))
    expect(newPlaybookRunRef('r1')).not.toBe(newPlaybookRunRef('r1'))
  })

  it('carries the id it belongs to, so a charge can be traced back', () => {
    expect(newPlaybookItemRef('abc')).toContain(':item:abc:')
    expect(newPlaybookRunRef('xyz')).toContain(':run:xyz:')
  })
})
