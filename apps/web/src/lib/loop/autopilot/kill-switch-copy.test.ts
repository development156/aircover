import { describe, expect, it } from 'vitest'

import { AUTOPILOT_LEVEL } from './decide'
import { autopilotStatus, type AutopilotHistoryRow } from './history-copy'
import { runAutopilotTick } from './run'
import type { DecisionRow } from './store'

/**
 * THE KILL SWITCH MUST NEVER TELL A CUSTOMER THEY PRESSED IT.
 *
 * ── THE DEFECT THIS EXISTS FOR, WHICH SHIPPED IN THIS BRANCH ─────────────────
 * `decideDue` returned `{ kind: 'refuse', reason: CANCELLED }` for the kill
 * switch, the tick wrote `decision = 'refused'` with that name, and
 * `autopilotStatus` renders a refusal by looking the name up in
 * AUTOPILOT_REFUSAL_COPY — whose sentence began "You stopped this post". A
 * customer who had not touched anything was told they had.
 *
 * ── WHY THE EXISTING GUARDS ALL MISSED IT ───────────────────────────────────
 * `history-copy.test.ts` has a test named "does NOT say the person did when
 * autopilot did", and it passed throughout: it feeds a row with
 * `decision: 'cancelled'`, which is the shape the kill switch did NOT produce.
 * `run.test.ts` asserted the kill switch published nothing, which was true.
 * `never-list.test.ts` asserted CANCELLED reached a row, which it did.
 *
 * Every guard was correct about its own half and nothing joined them up. So
 * this file runs the REAL tick, takes the rows it wrote, and hands them to the
 * REAL copy function — the only shape of test that could have caught it.
 */

const NOW = new Date('2026-08-29T10:00:00.000Z')

async function rowsFromKilledTick(): Promise<DecisionRow[]> {
  const written: DecisionRow[] = []
  await runAutopilotTick({
    workspaceId: 'ws-1',
    world: {
      now: NOW,
      levelFor: () => AUTOPILOT_LEVEL,
      brainPayload: null,
      dailyCap: 3,
      publishedToday: 0,
      cancelMinutes: 30,
      weeklyBudgetRemaining: 1000,
    },
    candidates: [],
    pending: [
      {
        postId: 'due-1',
        variantId: 'v-1',
        channel: 'x',
        accountId: 'acct-1',
        dispatchAfter: new Date('2026-08-29T09:30:00.000Z'),
      },
    ],
    due: { now: NOW, levelFor: () => AUTOPILOT_LEVEL, killed: true },
    write: async (row) => {
      written.push(row)
      return 'row-id'
    },
    publish: async () => {
      throw new Error('the kill switch must never reach a publish')
    },
  })
  return written
}

/** The row as the database would hand it back to a screen. */
function asHistory(row: DecisionRow): AutopilotHistoryRow {
  return {
    decision: row.decision,
    refusalReason: row.refusalReason ?? null,
    dispatchAfter: row.dispatchAfter ?? null,
    createdAt: NOW,
    // The column's default. `writeDecision` does not send an actor, so a row
    // the tick writes is 'autopilot' — which is the whole point.
    actor: 'autopilot',
  }
}

describe('the kill switch, from the tick to the sentence', () => {
  it('writes exactly one row, and it is a cancellation', async () => {
    const rows = await rowsFromKilledTick()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.decision).toBe('cancelled')
  })

  it('does NOT tell the customer they stopped it', async () => {
    // The assertion that would have caught the defect. Note it checks the
    // SENTENCE a reader gets, not the row: the row was defensible on its own
    // terms and the sentence was not.
    const rows = await rowsFromKilledTick()
    const status = autopilotStatus(rows.map(asHistory), NOW)
    expect(status.sentence).not.toMatch(/^you\b/i)
    expect(status.sentence).toMatch(/sahoda/i)
  })

  it('still tells them nothing went out, which is the part that must survive', async () => {
    const rows = await rowsFromKilledTick()
    const status = autopilotStatus(rows.map(asHistory), NOW)
    expect(status.sentence).toMatch(/nothing went out/i)
    expect(status.state).toBe('stopped')
    expect(status.stoppable).toBe(false)
  })

  it('a PERSON stopping the same post does say "you"', async () => {
    // The other half of the distinction. If both read the same, the actor
    // column is decorative and this whole change bought nothing.
    const rows = await rowsFromKilledTick()
    const byPerson = rows.map(asHistory).map((r) => ({ ...r, actor: 'person' }))
    expect(autopilotStatus(byPerson, NOW).sentence).toMatch(/^you\b/i)
  })

  it('carries no refusal_reason, so no guardrail is blamed for a stop', async () => {
    const rows = await rowsFromKilledTick()
    expect(rows[0]?.refusalReason ?? null).toBeNull()
  })
})
