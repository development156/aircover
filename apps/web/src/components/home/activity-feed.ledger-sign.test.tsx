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

  /**
   * THE PILL CARRIES THE SAME THREE-WAY CLAIM AS THE SIGN, AND NOTHING WATCHED IT.
   *
   * The tests above assert the SIGN, which is the half that already went wrong
   * once. The redesign added a coloured pill and a glyph, and a binary
   * spent/not-spent split there renders a neutral HOLD in the same tone as
   * money arriving — the original defect again, in a channel no assertion
   * reached. So the tone is asserted per direction, by CLASS rather than by
   * colour string: the classes are token names, and comparing resolved colours
   * would pass on hue, which docs/37 §1 forbids from being load-bearing.
   */
  it('gives debit, credit and neutral three different pills', () => {
    const toneOf = (label: string): string =>
      screen.getByText(label).closest('li')!.lastElementChild!.className

    render(
      <ActivityFeed
        entries={[
          entry({ seq: 1, entry_type: 'DEBIT', amount: 100, action_type: 'brand_research' }),
          entry({ seq: 2, entry_type: 'GRANT', amount: 100, idempotency_key: 'grant:1' }),
          entry({ seq: 3, entry_type: 'HOLD', amount: 100, idempotency_key: 'hold:1' }),
        ]}
      />,
    )

    const debit = toneOf('-100')
    const credit = toneOf('+100')
    const neutral = toneOf('100')

    expect(debit).toContain('bg-brand-wash')
    expect(credit).toContain('bg-ok-bg')
    expect(neutral).toContain('bg-s2')
    // And all three differ from each other, so collapsing any pair goes red.
    expect(new Set([debit, credit, neutral]).size).toBe(3)
  })
})

/**
 * AND HOME'S HALF OF THE READ-FAILURE SPLIT.
 *
 * `readLedger` used to return `{ entries: [] }` for a dropped connection exactly
 * as it did for a workspace that has genuinely never spent a credit, so this
 * card printed "Nothing has happened yet" over a read that never got an answer.
 * The wallet had the same defect and its own version of this guard.
 */
describe('a feed that could not be read is not an empty one', () => {
  it('never claims nothing has happened when the read failed', () => {
    render(<ActivityFeed entries={[]} unreadable />)

    expect(screen.queryByText(/nothing has happened yet/i)).not.toBeInTheDocument()
    expect(screen.getByRole('alert').textContent ?? '').toMatch(
      /could not read your recent activity/i,
    )
  })

  it('repeats the guarantee, because this card is about money', () => {
    render(<ActivityFeed entries={[]} unreadable />)

    expect(screen.getByRole('alert').textContent ?? '').toMatch(/nothing has been charged/i)
  })

  it('a feed that really is empty still says so', () => {
    // The other half. A flag that were always true would tell every new
    // workspace its wallet is broken on the first screen it ever sees.
    render(<ActivityFeed entries={[]} />)

    expect(screen.getByText(/nothing has happened yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
