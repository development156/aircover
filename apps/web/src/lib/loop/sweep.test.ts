import { describe, expect, it, vi } from 'vitest'
import type { ApplyLedgerInput } from '@sahoda/shared'

import {
  CANCEL_UNAPPROVED_SQL,
  FAIL_STALE_SQL,
  OPEN_CYCLE_HOLDS_SQL,
  SKIP_BRIEFS_SQL,
  STALE_CANDIDATES_SQL,
  UNAPPROVED_CANDIDATES_SQL,
  readLoopSweepMode,
  sweepLoopCycles,
  type SweepPool,
} from './sweep'

/**
 * THE TWO LOOP STATES NOTHING RECOVERED FROM, swept.
 *
 * (a) A cycle torn down mid-plan stayed `planning` for ever: its HOLD stayed
 *     open until the ledger's expired-hold sweep, and the partial unique index
 *     `loop_cycles_one_live_per_week` kept the week occupied, so every press of
 *     "Plan my week" said "already running".
 * (b) A cycle at `awaiting_cost_approval` nobody approved never expired and
 *     vanished from /loop when next week's cycle opened. Twenty credits, spent
 *     and never explained.
 *
 * These tests drive the sweep with a fake pool keyed on the SQL constants the
 * module exports, so they check the DECISIONS (which rows, which writes, which
 * counts) and never the SQL text. `sweep.pglite.test.ts` sends the real
 * statements to a real Postgres.
 */

const NOW = new Date('2026-09-09T12:00:00Z') // Wednesday, ISO 2026-W37
const WS = '9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f'
const WS2 = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e'
const STALE_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const STALE_B = 'aaaaaaaa-0000-4000-8000-000000000002'
const HALT_A = 'bbbbbbbb-0000-4000-8000-000000000001'
const HOLD_1 = 'cccccccc-0000-4000-8000-000000000001'
const HOLD_2 = 'cccccccc-0000-4000-8000-000000000002'

interface Row {
  id: string
  workspace_id: string
}

interface Script {
  stale?: Row[]
  /** Which stale ids the guarded UPDATE still finds. Defaults to all of `stale`. */
  staleStillThere?: string[]
  holds?: Record<string, { id: string; amount: number }[]>
  unapproved?: Row[]
  unapprovedStillThere?: string[]
  briefsPerCycle?: Record<string, number>
  /** Throw from the guarded UPDATE of this cycle, to prove the sweep keeps going. */
  failOn?: string
}

function fakePool(script: Script) {
  const calls: { sql: string; values: unknown[] }[] = []
  const stale = script.stale ?? []
  const staleStill = new Set(script.staleStillThere ?? stale.map((r) => r.id))
  const unapproved = script.unapproved ?? []
  const unapprovedStill = new Set(script.unapprovedStillThere ?? unapproved.map((r) => r.id))

  const pool: SweepPool = {
    async query(sql, values = []) {
      calls.push({ sql, values })
      const id = values[0] as string
      if (sql === STALE_CANDIDATES_SQL) return { rows: stale }
      if (sql === UNAPPROVED_CANDIDATES_SQL) return { rows: unapproved }
      if (sql === FAIL_STALE_SQL) {
        if (script.failOn === id) throw new Error('connection terminated')
        return { rows: stale.filter((r) => r.id === id && staleStill.has(id)) }
      }
      if (sql === OPEN_CYCLE_HOLDS_SQL) {
        const cycleId = values[1] as string
        return { rows: script.holds?.[cycleId] ?? [] }
      }
      if (sql === CANCEL_UNAPPROVED_SQL) {
        if (script.failOn === id) throw new Error('connection terminated')
        return { rows: unapproved.filter((r) => r.id === id && unapprovedStill.has(id)) }
      }
      if (sql === SKIP_BRIEFS_SQL) {
        const n = script.briefsPerCycle?.[id] ?? 0
        return { rows: Array.from({ length: n }, (_, i) => ({ id: `brief-${i}` })) }
      }
      throw new Error(`unscripted SQL: ${sql.slice(0, 40)}`)
    },
  }
  return { pool, calls }
}

function fakeLedger(opts: { alreadySettled?: string[]; throwOn?: string[] } = {}) {
  const applied: ApplyLedgerInput[] = []
  return {
    applied,
    apply: vi.fn(async (input: ApplyLedgerInput) => {
      if (opts.alreadySettled?.includes(input.settlesEntryId ?? ''))
        throw new Error('HOLD_ALREADY_SETTLED')
      if (opts.throwOn?.includes(input.settlesEntryId ?? '')) throw new Error('boom')
      applied.push(input)
      return { entry: { id: 'x', balanceAfter: 0, amount: input.amount }, replayed: false }
    }),
  }
}

describe('sweepLoopCycles: stale plans', () => {
  it('fails every stale plan and releases its open holds through the ledger', async () => {
    const { pool, calls } = fakePool({
      stale: [
        { id: STALE_A, workspace_id: WS },
        { id: STALE_B, workspace_id: WS2 },
      ],
      holds: { [STALE_A]: [{ id: HOLD_1, amount: 20 }] },
    })
    const ledger = fakeLedger()

    const report = await sweepLoopCycles({ pool, ledger, now: NOW, mode: 'on' })

    expect(report).toMatchObject({
      mode: 'on',
      staleFound: 2,
      staleFailed: 2,
      holdsFound: 1,
      holdsReleased: 1,
      holdsAlreadySettled: 0,
      failed: 0,
    })
    // The release is a RELEASE that settles exactly that hold, for the hold's
    // own amount, under a key derived from the hold so a second tick replays.
    expect(ledger.applied).toEqual([
      expect.objectContaining({
        workspaceId: WS,
        entryType: 'RELEASE',
        amount: 20,
        settlesEntryId: HOLD_1,
        idempotencyKey: `loop-sweep:release:${HOLD_1}`,
      }),
    ])
    // Holds are looked up per cycle, scoped to the cycle's own workspace.
    const holdLookups = calls.filter((c) => c.sql === OPEN_CYCLE_HOLDS_SQL)
    expect(holdLookups.map((c) => c.values)).toEqual([
      [WS, STALE_A],
      [WS2, STALE_B],
    ])
  })

  it('passes the instant it was given, never the wall clock, to the candidate query', async () => {
    const { pool, calls } = fakePool({})
    await sweepLoopCycles({ pool, ledger: fakeLedger(), now: NOW, mode: 'on' })
    const stale = calls.find((c) => c.sql === STALE_CANDIDATES_SQL)
    expect(stale?.values[0]).toBe(NOW.toISOString())
  })

  it('does not count a cycle that moved on between the read and the guarded write', async () => {
    // The candidate list said STALE_A was stale; by the time the UPDATE ran the
    // orchestrator had advanced it. The status precondition in the WHERE makes
    // the UPDATE match nothing, and the sweep must not report a failure it did
    // not write, nor release holds for a cycle that is still running.
    const { pool, calls } = fakePool({
      stale: [{ id: STALE_A, workspace_id: WS }],
      staleStillThere: [],
      holds: { [STALE_A]: [{ id: HOLD_1, amount: 20 }] },
    })
    const ledger = fakeLedger()

    const report = await sweepLoopCycles({ pool, ledger, now: NOW, mode: 'on' })

    expect(report).toMatchObject({ staleFound: 1, staleFailed: 0, holdsFound: 0, holdsReleased: 0 })
    expect(ledger.apply).not.toHaveBeenCalled()
    expect(calls.some((c) => c.sql === OPEN_CYCLE_HOLDS_SQL)).toBe(false)
  })

  it('counts a hold the ledger says was already settled, and does not fail the cycle for it', async () => {
    const { pool } = fakePool({
      stale: [{ id: STALE_A, workspace_id: WS }],
      holds: {
        [STALE_A]: [
          { id: HOLD_1, amount: 20 },
          { id: HOLD_2, amount: 5 },
        ],
      },
    })
    const ledger = fakeLedger({ alreadySettled: [HOLD_1] })

    const report = await sweepLoopCycles({ pool, ledger, now: NOW, mode: 'on' })

    expect(report).toMatchObject({
      staleFailed: 1,
      holdsFound: 2,
      holdsReleased: 1,
      holdsAlreadySettled: 1,
      failed: 0,
    })
  })

  it('keeps going when one workspace throws, and counts it', async () => {
    const { pool } = fakePool({
      stale: [
        { id: STALE_A, workspace_id: WS },
        { id: STALE_B, workspace_id: WS2 },
      ],
      failOn: STALE_A,
    })

    const report = await sweepLoopCycles({ pool, ledger: fakeLedger(), now: NOW, mode: 'on' })

    expect(report).toMatchObject({ staleFound: 2, staleFailed: 1, failed: 1 })
  })

  it('counts a release that throws as failed, and still releases the rest', async () => {
    const { pool } = fakePool({
      stale: [{ id: STALE_A, workspace_id: WS }],
      holds: {
        [STALE_A]: [
          { id: HOLD_1, amount: 20 },
          { id: HOLD_2, amount: 5 },
        ],
      },
    })
    const ledger = fakeLedger({ throwOn: [HOLD_1] })

    const report = await sweepLoopCycles({ pool, ledger, now: NOW, mode: 'on' })

    expect(report).toMatchObject({ holdsFound: 2, holdsReleased: 1, failed: 1 })
    expect(ledger.applied.map((a) => a.settlesEntryId)).toEqual([HOLD_2])
  })
})

describe('sweepLoopCycles: unapproved halts', () => {
  it('cancels a halt from a past week and skips its planned briefs', async () => {
    const { pool, calls } = fakePool({
      unapproved: [{ id: HALT_A, workspace_id: WS }],
      briefsPerCycle: { [HALT_A]: 3 },
    })

    const report = await sweepLoopCycles({ pool, ledger: fakeLedger(), now: NOW, mode: 'on' })

    expect(report).toMatchObject({ unapprovedFound: 1, unapprovedCancelled: 1, briefsSkipped: 3 })
    // Briefs are skipped only for the cycle whose cancel actually landed, in its workspace.
    const skips = calls.filter((c) => c.sql === SKIP_BRIEFS_SQL)
    expect(skips.map((c) => c.values)).toEqual([[HALT_A, WS]])
  })

  it('asks for halts before the ISO week of the instant it was given', async () => {
    const { pool, calls } = fakePool({})
    await sweepLoopCycles({ pool, ledger: fakeLedger(), now: NOW, mode: 'on' })
    const q = calls.find((c) => c.sql === UNAPPROVED_CANDIDATES_SQL)
    // 2026-09-09 is in ISO week 37 of 2026. A halt for week 36 is a past week; a
    // halt for week 37 is this week's and must be left alone.
    expect(q?.values.slice(0, 3)).toEqual([2026, 37, NOW.toISOString()])
  })

  it('does not skip briefs for a halt that was approved between the read and the write', async () => {
    const { pool, calls } = fakePool({
      unapproved: [{ id: HALT_A, workspace_id: WS }],
      unapprovedStillThere: [],
      briefsPerCycle: { [HALT_A]: 3 },
    })

    const report = await sweepLoopCycles({ pool, ledger: fakeLedger(), now: NOW, mode: 'on' })

    expect(report).toMatchObject({ unapprovedFound: 1, unapprovedCancelled: 0, briefsSkipped: 0 })
    expect(calls.some((c) => c.sql === SKIP_BRIEFS_SQL)).toBe(false)
  })
})

describe('sweepLoopCycles: the mode flag', () => {
  it('reads nothing and writes nothing when off', async () => {
    const { pool, calls } = fakePool({ stale: [{ id: STALE_A, workspace_id: WS }] })
    const ledger = fakeLedger()

    const report = await sweepLoopCycles({ pool, ledger, now: NOW, mode: 'off' })

    expect(calls).toEqual([])
    expect(ledger.apply).not.toHaveBeenCalled()
    expect(report).toEqual({
      mode: 'off',
      staleFound: 0,
      staleFailed: 0,
      holdsFound: 0,
      holdsReleased: 0,
      holdsAlreadySettled: 0,
      unapprovedFound: 0,
      unapprovedCancelled: 0,
      briefsSkipped: 0,
      failed: 0,
    })
  })

  it('lists what it would do and writes nothing in report mode', async () => {
    const { pool, calls } = fakePool({
      stale: [{ id: STALE_A, workspace_id: WS }],
      unapproved: [{ id: HALT_A, workspace_id: WS }],
      holds: { [STALE_A]: [{ id: HOLD_1, amount: 20 }] },
    })
    const ledger = fakeLedger()

    const report = await sweepLoopCycles({ pool, ledger, now: NOW, mode: 'report' })

    expect(report).toMatchObject({
      mode: 'report',
      staleFound: 1,
      staleFailed: 0,
      unapprovedFound: 1,
      unapprovedCancelled: 0,
      holdsReleased: 0,
    })
    expect(calls.map((c) => c.sql)).toEqual([STALE_CANDIDATES_SQL, UNAPPROVED_CANDIDATES_SQL])
    expect(ledger.apply).not.toHaveBeenCalled()
  })

  it('is off unless SAHODA_LOOP_SWEEP_MODE is exactly one of the three modes', () => {
    expect(readLoopSweepMode({})).toBe('off')
    expect(readLoopSweepMode({ SAHODA_LOOP_SWEEP_MODE: 'on' })).toBe('on')
    expect(readLoopSweepMode({ SAHODA_LOOP_SWEEP_MODE: 'report' })).toBe('report')
    expect(readLoopSweepMode({ SAHODA_LOOP_SWEEP_MODE: 'off' })).toBe('off')
    // A typo must land on the side that writes nothing.
    expect(readLoopSweepMode({ SAHODA_LOOP_SWEEP_MODE: 'ON' })).toBe('off')
    expect(readLoopSweepMode({ SAHODA_LOOP_SWEEP_MODE: 'true' })).toBe('off')
  })
})

describe('the guarded writes carry their status precondition', () => {
  // The fake pool above honours the precondition by script; a real database
  // honours it only if the SQL says it. `sweep.pglite.test.ts` proves it by
  // racing a transition; this is the cheap tripwire for the same sentence.
  it('fails a stale plan only while it is still collecting, reflecting or planning', () => {
    expect(FAIL_STALE_SQL).toMatch(/status in \('collecting', 'reflecting', 'planning'\)/)
    expect(FAIL_STALE_SQL).not.toMatch(/'creating'|'staging'|'testing'/)
  })

  it('cancels a halt only while it is still awaiting approval', () => {
    expect(CANCEL_UNAPPROVED_SQL).toMatch(/status = 'awaiting_cost_approval'/)
  })

  it('skips only briefs that were never made', () => {
    expect(SKIP_BRIEFS_SQL).toMatch(/stage_outcome in \('planned', 'awaiting_approval'\)/)
  })
})
