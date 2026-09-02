import { describe, it, expect } from 'vitest'
import { createWithCredits } from '@sahoda/billing'
import { creditCost } from '@sahoda/shared'

import { chargeSubscribers, scanWeekKey } from './charge'
import { FakeLedger } from './fake-ledger'

/**
 * THE WEEKLY SCAN CHARGES WHAT /radar SAYS IT CHARGES, AND ONLY THEN.
 *
 * The screen prints "One scan per business per week, at 5 credits each. A page
 * that will not load is skipped and not charged." Until this file existed,
 * nothing wrote a `radar_scan` ledger row at all, so both halves of that
 * sentence were untested claims. The properties pinned here, each of which was
 * watched fail by mutation:
 *
 *   · one DEBIT per subscribing workspace per SUCCESSFUL scan, at
 *     `creditCost('radar_scan')` — never a literal;
 *   · a scan that did not see the page HOLDs and then RELEASES: no DEBIT;
 *   · one fetch serves every subscriber — the scan runs ONCE however many pay;
 *   · a workspace that cannot pay is skipped, and the others still get the read;
 *   · the objectRef is (competitor, ISO week), so a re-run of the same week
 *     replays the same keys and charges nobody a second time.
 *
 * `createWithCredits` here is the REAL wrapper from packages/billing over an
 * in-memory ledger that replays idempotency keys the way the Postgres function
 * does. A fake `withCredits` would have proved only that the charge was asked
 * for, not that it lands exactly once.
 */

const WS_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const WS_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const COMPETITOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const PRICE = creditCost('radar_scan')

function countingScan(result: 'seen' | 'not_seen' | Error) {
  const state = { calls: 0 }
  return {
    state,
    async scan(): Promise<'seen' | 'not_seen'> {
      state.calls += 1
      if (result instanceof Error) throw result
      return result
    },
  }
}

describe('scanWeekKey', () => {
  it('is the ISO week, so a Monday pass and its Tuesday retry share one key', () => {
    expect(scanWeekKey(new Date('2026-08-31T03:40:00Z'))).toBe('2026-W36') // Monday
    expect(scanWeekKey(new Date('2026-09-06T23:59:59Z'))).toBe('2026-W36') // Sunday
    expect(scanWeekKey(new Date('2026-09-07T00:00:00Z'))).toBe('2026-W37') // next Monday
  })

  it('follows the ISO year at the boundaries, not the calendar year', () => {
    expect(scanWeekKey(new Date('2026-01-01T12:00:00Z'))).toBe('2026-W01')
    expect(scanWeekKey(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53')
    expect(scanWeekKey(new Date('2024-12-30T12:00:00Z'))).toBe('2025-W01')
  })
})

describe('chargeSubscribers', () => {
  it('debits every subscriber the configured price for ONE successful scan', async () => {
    const ledger = new FakeLedger({ [WS_A]: 20, [WS_B]: 20 })
    const scan = countingScan('seen')

    const outcome = await chargeSubscribers({
      withCredits: createWithCredits(ledger),
      workspaces: [WS_A, WS_B],
      competitorId: COMPETITOR,
      week: '2026-W36',
      scan: scan.scan,
    })

    expect(outcome).toMatchObject({ scan: 'seen', debited: [WS_A, WS_B], unpaid: [] })
    // The page was read once, not once per paying workspace.
    expect(scan.state.calls).toBe(1)
    const debits = ledger.entries('DEBIT')
    expect(debits.map((d) => [d.workspaceId, d.amount, d.actionType])).toEqual([
      [WS_A, PRICE, 'radar_scan'],
      [WS_B, PRICE, 'radar_scan'],
    ])
    expect(await ledger.balance(WS_A)).toEqual({ total: 20 - PRICE, held: 0 })
    expect(await ledger.balance(WS_B)).toEqual({ total: 20 - PRICE, held: 0 })
  })

  it('keys the charge on the competitor, the week AND the workspace: ledger keys are global', async () => {
    const ledger = new FakeLedger({ [WS_A]: 20 })

    await chargeSubscribers({
      withCredits: createWithCredits(ledger),
      workspaces: [WS_A],
      competitorId: COMPETITOR,
      week: '2026-W36',
      scan: countingScan('seen').scan,
    })

    expect(ledger.entries('HOLD')[0]?.objectRef).toBe(`${COMPETITOR}:2026-W36:${WS_A}`)
  })

  it('a page that could not be read is held and then released: nothing is charged', async () => {
    const ledger = new FakeLedger({ [WS_A]: 20, [WS_B]: 20 })
    const scan = countingScan('not_seen')

    const outcome = await chargeSubscribers({
      withCredits: createWithCredits(ledger),
      workspaces: [WS_A, WS_B],
      competitorId: COMPETITOR,
      week: '2026-W36',
      scan: scan.scan,
    })

    expect(outcome).toMatchObject({ scan: 'not_seen', debited: [], unpaid: [] })
    expect(scan.state.calls).toBe(1)
    expect(ledger.entries('DEBIT')).toHaveLength(0)
    // Held BEFORE the read, released AFTER it failed — the ledger flow, not a
    // charge that is merely never attempted.
    expect(ledger.entries('HOLD')).toHaveLength(2)
    expect(ledger.entries('RELEASE')).toHaveLength(2)
    expect(await ledger.balance(WS_A)).toEqual({ total: 20, held: 0 })
    expect(await ledger.balance(WS_B)).toEqual({ total: 20, held: 0 })
  })

  it('a scan that throws releases every hold and is reported as a throw, not a quiet failure', async () => {
    const ledger = new FakeLedger({ [WS_A]: 20, [WS_B]: 20 })
    const scan = countingScan(new Error('pool exhausted'))

    const outcome = await chargeSubscribers({
      withCredits: createWithCredits(ledger),
      workspaces: [WS_A, WS_B],
      competitorId: COMPETITOR,
      week: '2026-W36',
      scan: scan.scan,
    })

    expect(outcome.scan).toBe('threw')
    expect(scan.state.calls).toBe(1)
    expect(ledger.entries('DEBIT')).toHaveLength(0)
    expect(ledger.entries('RELEASE')).toHaveLength(2)
  })

  it('a workspace that cannot pay is skipped; the one that can still gets the read', async () => {
    const ledger = new FakeLedger({ [WS_A]: PRICE - 1, [WS_B]: 20 })
    const scan = countingScan('seen')

    const outcome = await chargeSubscribers({
      withCredits: createWithCredits(ledger),
      workspaces: [WS_A, WS_B],
      competitorId: COMPETITOR,
      week: '2026-W36',
      scan: scan.scan,
    })

    expect(outcome).toMatchObject({ scan: 'seen', debited: [WS_B], unpaid: [WS_A] })
    expect(scan.state.calls).toBe(1)
    expect(ledger.entries('DEBIT', WS_A)).toHaveLength(0)
    expect(ledger.entries('DEBIT', WS_B)).toHaveLength(1)
  })

  it('when nobody can pay, the page is never fetched', async () => {
    const ledger = new FakeLedger({ [WS_A]: 0 })
    const scan = countingScan('seen')

    const outcome = await chargeSubscribers({
      withCredits: createWithCredits(ledger),
      workspaces: [WS_A],
      competitorId: COMPETITOR,
      week: '2026-W36',
      scan: scan.scan,
    })

    expect(outcome).toMatchObject({ scan: 'not_run', debited: [], unpaid: [WS_A] })
    expect(scan.state.calls).toBe(0)
    expect(ledger.rows).toHaveLength(0)
  })

  it('a ledger that cannot answer is reported as such, and the page is not fetched on its say-so', async () => {
    const ledger = new FakeLedger({ [WS_A]: 20 })
    const broken = createWithCredits({
      ...ledger,
      apply: async () => {
        throw new Error('ledger: connection reset')
      },
      latestHold: () =>
        ledger.latestHold({ workspaceId: WS_A, action: 'radar_scan', objectRef: 'x' }),
      balance: (ws) => ledger.balance(ws),
    })
    const scan = countingScan('seen')

    const outcome = await chargeSubscribers({
      withCredits: broken,
      workspaces: [WS_A],
      competitorId: COMPETITOR,
      week: '2026-W36',
      scan: scan.scan,
    })

    expect(outcome).toMatchObject({
      scan: 'not_run',
      debited: [],
      unpaid: [],
      ledgerFailed: [WS_A],
    })
    expect(scan.state.calls).toBe(0)
  })

  it('with no subscriber there is nothing to charge, and the scan still runs so the gate can refuse it', async () => {
    const ledger = new FakeLedger({})
    const scan = countingScan('seen')

    const outcome = await chargeSubscribers({
      withCredits: createWithCredits(ledger),
      workspaces: [],
      competitorId: COMPETITOR,
      week: '2026-W36',
      scan: scan.scan,
    })

    expect(outcome.scan).toBe('seen')
    expect(scan.state.calls).toBe(1)
    expect(ledger.rows).toHaveLength(0)
  })

  it('a re-run of the same week charges nobody twice; the next week charges again', async () => {
    const ledger = new FakeLedger({ [WS_A]: 20 })
    const withCredits = createWithCredits(ledger)
    const run = (week: string) =>
      chargeSubscribers({
        withCredits,
        workspaces: [WS_A],
        competitorId: COMPETITOR,
        week,
        scan: countingScan('seen').scan,
      })

    await run('2026-W36')
    const again = await run('2026-W36')

    // The wrapper reports a success on the replay — and the ledger shows ONE
    // debit, because both HOLD and DEBIT hit the same idempotency keys.
    expect(again.debited).toEqual([WS_A])
    expect(ledger.entries('DEBIT')).toHaveLength(1)
    expect(await ledger.balance(WS_A)).toEqual({ total: 20 - PRICE, held: 0 })

    await run('2026-W37')
    expect(ledger.entries('DEBIT')).toHaveLength(2)
    expect(await ledger.balance(WS_A)).toEqual({ total: 20 - 2 * PRICE, held: 0 })
  })
})
