import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ActivityFeed } from '@/components/home/activity-feed'
import type { LedgerEntry } from '@sahoda/shared'

/**
 * THE LEDGER NEVER LIES, INCLUDING ON HOME.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * `credit_ledger` carries this CHECK:
 *
 *   (entry_type = 'ADJUST' and amount <> 0)
 *   or (entry_type <> 'ADJUST' and amount > 0)
 *
 * A DEBIT's `amount` is POSITIVE by definition; the direction is in
 * `entry_type`. Home's activity feed derived it as `entry.amount > 0`, which is
 * true for every row in the table — so every SPEND rendered as `+n` with a
 * tick. MEASURED on the zero-balance journey: "Ux probe +100" and "Welcome
 * credits +100" sat directly above "AVAILABLE CREDITS 0", while /wallet showed
 * the same first row as -100. Two surfaces, one row, opposite claims.
 *
 * ── WHY THE TEST IS SHAPED LIKE THIS ─────────────────────────────────────────
 * It asserts a DEBIT and a GRANT of the SAME positive amount render
 * differently. A fixture with a negative debit amount would be a row the
 * database cannot hold, and it would pass against the broken code.
 */

/**
 * A row shaped the way the database actually stores one.
 *
 * `workspace_id`, `idempotency_key` and `actor` are present because
 * `grantOrigin` reads all three to decide what a GRANT is, and a fixture
 * missing them throws rather than failing an assertion — which reads as a
 * broken test instead of a broken component.
 */
function entry(over: Partial<LedgerEntry>): LedgerEntry {
  return {
    seq: 1,
    workspace_id: '00000000-0000-4000-8000-000000000000',
    entry_type: 'GRANT',
    amount: 100,
    balance_after: 100,
    action_type: null,
    object_ref: null,
    model_tier: null,
    idempotency_key: 'grant:signup:00000000-0000-4000-8000-000000000000',
    actor: null,
    created_at: '2026-08-22T00:00:00.000Z',
    meta: null,
    ...over,
  } as unknown as LedgerEntry
}

describe('Home reports a spend as a spend', () => {
  it('a DEBIT with a positive amount is shown as negative', () => {
    render(
      <ActivityFeed
        entries={[
          entry({
            seq: 2,
            entry_type: 'DEBIT',
            amount: 100,
            action_type: 'loop_cycle',
            idempotency_key: 'debit:loop:1',
          }),
        ]}
      />,
    )
    // The exact string the wallet shows for the same row.
    expect(screen.getByText('-100')).toBeTruthy()
    expect(screen.queryByText('+100')).toBeNull()
  })

  it('a GRANT of the SAME positive amount is still shown as positive', () => {
    render(<ActivityFeed entries={[entry({ seq: 1, entry_type: 'GRANT', amount: 100 })]} />)
    expect(screen.getByText('+100')).toBeTruthy()
  })

  it('a HOLD moves nothing, and does not claim to', () => {
    // Reservations are neutral: a hold reserves and a release un-reserves, and
    // neither changes the wallet total. Rendering one as +n would double-count
    // money that has not moved.
    render(
      <ActivityFeed
        entries={[entry({ seq: 3, entry_type: 'HOLD', amount: 20, idempotency_key: 'hold:1' })]}
      />,
    )
    expect(screen.queryByText('+20')).toBeNull()
  })
})
