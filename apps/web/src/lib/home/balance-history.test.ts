import { describe, expect, test } from 'vitest'
import type { LedgerEntry } from '@sahoda/shared'

import { HISTORY_LIMIT } from '@/lib/wallet/read'

import { balanceSeries } from './balance-history'

const NOW = new Date('2026-09-06T10:00:00.000Z')

function entry(seq: number, createdAt: string, balanceAfter: number): LedgerEntry {
  return {
    seq,
    created_at: createdAt,
    balance_after: balanceAfter,
    entry_type: 'DEBIT',
  } as unknown as LedgerEntry
}

describe('balanceSeries', () => {
  test('reads the balance off the ledger at the end of each day, and carries it forward', () => {
    const series = balanceSeries(
      [
        entry(1, '2026-09-01T03:49:00.000Z', 100), // welcome grant
        entry(2, '2026-09-03T08:00:00.000Z', 80),
        entry(3, '2026-09-03T09:00:00.000Z', 60), // the later row wins the day
      ],
      NOW,
      7,
    )
    // 31 Aug is before the first row of a complete ledger: a real zero.
    expect(series.map((d) => d.total)).toEqual([0, 100, 100, 60, 60, 60, 60])
    expect(series[0]!.date).toBe('2026-08-31')
    expect(series[6]!.date).toBe('2026-09-06')
  })

  test('days before the first row of a COMPLETE ledger are a real zero', () => {
    const series = balanceSeries([entry(1, '2026-09-05T00:00:00.000Z', 100)], NOW, 4)
    expect(series.map((d) => d.total)).toEqual([0, 0, 100, 100])
  })

  test('an empty ledger is thirty real zeroes, not thirty unknowns', () => {
    const series = balanceSeries([], NOW)
    expect(series).toHaveLength(30)
    expect(series.every((d) => d.total === 0)).toBe(true)
  })

  test('a CAPPED ledger does not claim the days before its oldest row', () => {
    // Exactly HISTORY_LIMIT rows: the read may have missed older ones, so the
    // days before the oldest row are unknown rather than zero.
    const rows = Array.from({ length: HISTORY_LIMIT }, (_, i) =>
      entry(i + 1, `2026-09-0${4 + (i % 3)}T0${i % 9}:00:00.000Z`, 100 - i),
    )
    const series = balanceSeries(rows, NOW, 7)
    expect(series[0]!.total).toBeNull()
    expect(series[3]!.total).toBeNull()
    expect(series[4]!.total).not.toBeNull()
  })

  test('orders by seq, never by created_at', () => {
    // Two rows in one transaction: the higher seq is the later state even
    // though its timestamp reads earlier.
    const series = balanceSeries(
      [entry(2, '2026-09-05T10:00:00.000Z', 70), entry(1, '2026-09-05T10:00:01.000Z', 100)],
      NOW,
      2,
    )
    expect(series[1]!.total).toBe(70)
  })
})
