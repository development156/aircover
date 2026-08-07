import { render, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { LedgerEntrySchema, type LedgerEntry } from '@sahoda/shared'

import { LedgerTable } from './ledger-table'

/**
 * These tests exist because the truncation notice used to key off `entries`,
 * which is the POST-parse array, while `limit` is the PRE-parse query cap. Any
 * row dropped by `parseEntries` pushed the count under the cap and silently
 * removed the notice — so a truncated history rendered as a complete one
 * precisely when rows had also gone missing.
 */

function entry(seq: number): LedgerEntry {
  return LedgerEntrySchema.parse({
    id: `1111111${seq}-1111-4111-8111-111111111111`,
    workspace_id: '22222222-2222-4222-8222-222222222222',
    seq,
    entry_type: 'DEBIT',
    amount: 3,
    balance_after: 97,
    action_type: 'post_variants',
    object_ref: 'variants:abc',
    model_tier: 'standard',
    cogs_usd_est: null,
    idempotency_key: `ws:post_variants:${seq}`,
    settles_entry_id: null,
    hold_expires_at: null,
    actor: 'user_abc',
    meta: null,
    created_at: '2026-07-19T10:00:00.000Z',
  })
}

function entries(count: number): LedgerEntry[] {
  return Array.from({ length: count }, (_, index) => entry(index + 1))
}

const NOTICE = /Older activity is not listed here/

describe('LedgerTable truncation notice', () => {
  test('stays hidden when the query returned fewer rows than the cap', () => {
    render(<LedgerTable entries={entries(1)} skipped={0} limit={3} />)

    expect(screen.queryByText(NOTICE)).toBeNull()
  })

  test('shows when a full page parsed cleanly', () => {
    render(<LedgerTable entries={entries(3)} skipped={0} limit={3} />)

    expect(screen.getByText(NOTICE)).toBeInTheDocument()
  })

  test('still shows when dropped rows put the displayed count under the cap', () => {
    // The query returned a full page of 3; 2 rows failed the contract. The
    // history IS windowed, and saying otherwise is the bug this pins.
    render(<LedgerTable entries={entries(1)} skipped={2} limit={3} />)

    expect(screen.getByText(NOTICE)).toBeInTheDocument()
  })

  test('reports the dropped rows alongside the truncation notice', () => {
    render(<LedgerTable entries={entries(1)} skipped={2} limit={3} />)

    expect(screen.getByText(/could not be displayed/)).toBeInTheDocument()
  })
})

/**
 * A correction is three correct rows that read as a clawback.
 *
 * seq 5374 was a manual GRANT the wallet mislabelled. credit_ledger is
 * append-only, so it was fixed by writing seq 5597 (-100, reversing it) and
 * seq 5596 (+100, re-issuing it). Newest-first that puts "-100 Manual
 * adjustment" at the top of the user's history with its matching +100 below it
 * and the entry they fix scrolled away — 100 credits apparently taken, with
 * nothing on screen saying they came straight back.
 */
const CORRECTION_ID = '2026-07-25-relabel-manual-grant'

/** `entry()` builds its id from the seq, which stops being a uuid past one digit. */
const idFor = (seq: number): string => `${String(seq).padStart(8, '0')}-1111-4111-8111-111111111111`

function correctionRow(seq: number, amount: number, link: Record<string, number>): LedgerEntry {
  return LedgerEntrySchema.parse({
    ...entry(1),
    id: idFor(seq),
    seq,
    entry_type: 'ADJUST',
    amount,
    action_type: 'manual_adjustment',
    actor: 'claude-ledger-correction',
    meta: { correction: CORRECTION_ID, ...link },
  })
}

const REVERSAL = correctionRow(5597, -100, { reverses_seq: 5374 })
const REISSUE = correctionRow(5596, 100, { replaces_seq: 5374 })
const ORIGINAL = LedgerEntrySchema.parse({
  ...entry(1),
  id: idFor(5374),
  seq: 5374,
  entry_type: 'GRANT',
  amount: 100,
  action_type: 'signup_grant',
  idempotency_key: 'manual-verify-topup:c12b271a:20260724-1',
  actor: 'claude-verification',
})

describe('LedgerTable correction grouping', () => {
  test('presents the pair as one correction rather than two adjustments', () => {
    render(<LedgerTable entries={[REVERSAL, REISSUE, ORIGINAL]} skipped={0} limit={50} />)

    expect(screen.getByRole('rowgroup', { name: /correction/i })).toBeInTheDocument()
  })

  test('says outright that nothing changed, which is the whole worry', () => {
    render(<LedgerTable entries={[REVERSAL, REISSUE, ORIGINAL]} skipped={0} limit={50} />)

    expect(screen.getByText(/no change to your balance/i)).toBeInTheDocument()
  })

  test('still shows both rows — grouping explains the ledger, it does not hide it', () => {
    render(<LedgerTable entries={[REVERSAL, REISSUE, ORIGINAL]} skipped={0} limit={50} />)

    // Scoped to the group: the original grant is a third +100 elsewhere in the
    // table, and it is meant to still be there.
    const group = within(screen.getByRole('rowgroup', { name: /correction/i }))

    expect(group.getByText('-100')).toBeInTheDocument()
    expect(group.getByText('+100')).toBeInTheDocument()
    // Both halves, still individually auditable — an append-only ledger that
    // hid rows behind a summary would be worse than the confusing version.
    expect(group.getAllByRole('row')).toHaveLength(3)
  })

  test('marks the entry that was corrected so it does not read as still standing', () => {
    render(<LedgerTable entries={[REVERSAL, REISSUE, ORIGINAL]} skipped={0} limit={50} />)

    expect(screen.getByText(/corrected by a later entry/i)).toBeInTheDocument()
  })

  test('states the movement when a correction is not net zero', () => {
    const partial = correctionRow(5596, 60, { replaces_seq: 5374 })

    render(<LedgerTable entries={[REVERSAL, partial]} skipped={0} limit={50} />)

    // -100 then +60. Claiming "no change" here would be the same class of lie
    // as the labels this correction was written to fix.
    expect(screen.queryByText(/no change to your balance/i)).not.toBeInTheDocument()
    expect(screen.getByText(/-40 credits/i)).toBeInTheDocument()
  })

  test('leaves an ordinary ledger ungrouped', () => {
    render(<LedgerTable entries={entries(3)} skipped={0} limit={50} />)

    expect(screen.queryByRole('rowgroup', { name: /correction/i })).not.toBeInTheDocument()
  })
})

/**
 * The "Reserved" pill is a claim about money RIGHT NOW: these credits are
 * frozen. It shipped derived from `entry_type === 'HOLD'`, so every completed
 * charge rendered the hold row as though the freeze were still in force —
 * `Reserved 3` sitting above the `-3` that had already charged it, sometimes
 * months later. These pin the claim to the settlement, not to the row type.
 */
describe('Reserved means frozen right now, not "was once a hold"', () => {
  const HOLD_ID = '11111111-1111-4111-8111-111111111111'

  const hold = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
    ...entry(1),
    id: HOLD_ID,
    seq: 10,
    entry_type: 'HOLD',
    ...over,
  })

  const settlement = (type: 'DEBIT' | 'RELEASE'): LedgerEntry => ({
    ...entry(2),
    seq: 11,
    entry_type: type,
    settles_entry_id: HOLD_ID,
  })

  test('an OPEN hold says Reserved', () => {
    render(<LedgerTable entries={[hold()]} skipped={0} limit={50} />)

    expect(screen.getByText('Reserved')).toBeInTheDocument()
  })

  test('a hold settled by a DEBIT does NOT say Reserved — this was the lie', () => {
    render(<LedgerTable entries={[settlement('DEBIT'), hold()]} skipped={0} limit={50} />)

    expect(screen.queryByText('Reserved')).not.toBeInTheDocument()
  })

  test('a hold settled by a RELEASE does NOT say Reserved either', () => {
    // The credits came back rather than being spent, but the hold is closed
    // just the same — nothing is frozen.
    render(<LedgerTable entries={[settlement('RELEASE'), hold()]} skipped={0} limit={50} />)

    expect(screen.queryByText('Reserved')).not.toBeInTheDocument()
  })

  test('an expiry timestamp on a settled hold does not resurrect the claim', () => {
    // `hold_expires_at` survives settlement, which is why it can never be the
    // signal: using it would report every past charge as stuck credits.
    const expired = hold({ hold_expires_at: '2026-07-01T00:00:00.000Z' })
    render(<LedgerTable entries={[settlement('DEBIT'), expired]} skipped={0} limit={50} />)

    expect(screen.queryByText('Reserved')).not.toBeInTheDocument()
  })

  test('one settled hold does not silence another open one', () => {
    const OTHER = '11111112-1111-4111-8111-111111111111'
    const openHold = hold({ id: OTHER, seq: 12 })
    render(<LedgerTable entries={[openHold, settlement('DEBIT'), hold()]} skipped={0} limit={50} />)

    expect(screen.getAllByText('Reserved')).toHaveLength(1)
  })
})
