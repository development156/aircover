import { render, screen } from '@testing-library/react'
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
