import { describe, expect, it } from 'vitest'
import type { LedgerEntry } from '@sahoda/shared'

import {
  GAP,
  clampPage,
  filterEntries,
  matchesKind,
  matchesQuery,
  pageCount,
  pageSlots,
  showingRange,
  totalsFor,
} from './activity-view'

/**
 * Every number this module produces is a claim about somebody's money or about
 * how much of their history they are looking at. An off-by-one in
 * `showingRange` and a mis-signed sum in `totalsFor` are the same class of
 * defect as a wrong balance, so they are pinned here rather than left to the
 * component.
 */

let seq = 0
function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  seq += 1
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    workspace_id: '00000000-0000-4000-8000-000000000001',
    seq,
    entry_type: 'DEBIT',
    amount: 10,
    balance_after: 100,
    action_type: 'caption_rewrite',
    object_ref: null,
    model_tier: null,
    cogs_usd_est: null,
    idempotency_key: `k${seq}`,
    settles_entry_id: null,
    hold_expires_at: null,
    actor: null,
    meta: null,
    created_at: '2026-08-29T10:00:00.000Z',
    ...over,
  } as LedgerEntry
}

describe('totalsFor', () => {
  it('reads the direction from the entry type, never from the stored amount', () => {
    // `credit_ledger` stores a DEBIT as a POSITIVE number. Summing `amount`
    // directly makes a 30-credit spend and a 30-credit grant agree when they
    // point opposite ways — the defect `signedEffect` exists to prevent, and
    // the one that would make this whole panel lie.
    const totals = totalsFor([
      entry({ entry_type: 'DEBIT', amount: 30 }),
      entry({ entry_type: 'GRANT', amount: 30 }),
    ])

    expect(totals.spent).toBe(30)
    expect(totals.added).toBe(30)
    expect(totals.net).toBe(0)
  })

  it('counts a hold and its release as nothing, because neither moved the total', () => {
    // A HOLD reserves and a RELEASE hands back. `balance_total` never moves, so
    // a summary that counted them would report spending that never happened.
    const totals = totalsFor([
      entry({ entry_type: 'HOLD', amount: 40 }),
      entry({ entry_type: 'RELEASE', amount: 40 }),
    ])

    expect(totals).toMatchObject({ spent: 0, added: 0, net: 0, covers: 2 })
  })

  it('reads an ADJUST both ways, because it is the one type that carries its own sign', () => {
    expect(totalsFor([entry({ entry_type: 'ADJUST', amount: -25 })]).spent).toBe(25)
    expect(totalsFor([entry({ entry_type: 'ADJUST', amount: 25 })]).added).toBe(25)
  })

  it('says how many entries it looked at, so the caller cannot label it a lifetime', () => {
    // The read is windowed. `covers` is returned precisely so a caller has to
    // hold the number of entries the sum was taken over.
    expect(totalsFor([entry(), entry(), entry()]).covers).toBe(3)
    expect(totalsFor([]).covers).toBe(0)
  })
})

describe('filtering', () => {
  it('sorts each entry into the category the ledger actually records', () => {
    expect(matchesKind(entry({ entry_type: 'DEBIT' }), 'spent')).toBe(true)
    expect(matchesKind(entry({ entry_type: 'TOPUP' }), 'added')).toBe(true)
    // A RELEASE is a refund in ordinary speech and NEUTRAL in this ledger: the
    // credits never left the wallet total. Filing it under "added" would state
    // the opposite of what the ledger records.
    expect(matchesKind(entry({ entry_type: 'RELEASE' }), 'added')).toBe(false)
    expect(matchesKind(entry({ entry_type: 'RELEASE' }), 'reserved')).toBe(true)
    expect(matchesKind(entry({ entry_type: 'DEBIT' }), 'all')).toBe(true)
  })

  it('narrows on every word rather than widening', () => {
    const row = entry({ entry_type: 'TOPUP' })
    expect(matchesQuery(row, 'credits purchased')).toBe(true)
    // Widening on `some` would make a two-word search return MORE than a
    // one-word search, which reads as a broken field.
    expect(matchesQuery(row, 'credits refunded')).toBe(false)
    expect(matchesQuery(row, '')).toBe(true)
  })

  it('searches the reason and the action, not only the headline', () => {
    const row = entry({ entry_type: 'DEBIT', action_type: 'caption_rewrite' })
    expect(matchesQuery(row, 'caption')).toBe(true)
  })

  it('applies the category and the search together', () => {
    const rows = [
      entry({ entry_type: 'DEBIT', action_type: 'caption_rewrite' }),
      entry({ entry_type: 'TOPUP' }),
      entry({ entry_type: 'DEBIT', action_type: 'site_build' }),
    ]
    expect(filterEntries(rows, { kind: 'spent', query: 'caption' })).toHaveLength(1)
    expect(filterEntries(rows, { kind: 'all', query: '' })).toHaveLength(3)
  })
})

describe('paging arithmetic', () => {
  it('never reports zero pages, so there is always a page to be on', () => {
    expect(pageCount(0, 10)).toBe(1)
    expect(pageCount(1, 10)).toBe(1)
    expect(pageCount(10, 10)).toBe(1)
    expect(pageCount(11, 10)).toBe(2)
    expect(pageCount(127, 10)).toBe(13)
    expect(pageCount(127, 25)).toBe(6)
  })

  it('refuses a page that does not exist', () => {
    // "Do not allow navigation to invalid pages" — held here rather than in an
    // onClick, so every route into the state goes through it.
    expect(clampPage(0, 127, 10)).toBe(1)
    expect(clampPage(-4, 127, 10)).toBe(1)
    expect(clampPage(99, 127, 10)).toBe(13)
    expect(clampPage(Number.NaN, 127, 10)).toBe(1)
    // The case that actually bites: rows-per-page grows while you are deep in
    // the list, and the page you were on stops existing.
    expect(clampPage(13, 127, 100)).toBe(2)
  })

  it('counts the shown range inclusively, one-based', () => {
    expect(showingRange(1, 10, 127)).toEqual({ from: 1, to: 10 })
    expect(showingRange(3, 25, 127)).toEqual({ from: 51, to: 75 })
    // The last page is short, and its end is the total, not page × perPage.
    expect(showingRange(13, 10, 127)).toEqual({ from: 121, to: 127 })
    // Nothing to show says nothing, rather than "1 to 0".
    expect(showingRange(1, 10, 0)).toEqual({ from: 0, to: 0 })
  })
})

describe('the page numbers the pager draws', () => {
  it('draws every page when there are ten or fewer', () => {
    expect(pageSlots(1, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(pageSlots(1, 1)).toEqual([1])
  })

  it('keeps a full run of five at both ends rather than shrinking it', () => {
    expect(pageSlots(1, 24)).toEqual([1, 2, 3, 4, 5, GAP, 24])
    expect(pageSlots(24, 24)).toEqual([1, GAP, 20, 21, 22, 23, 24])
  })

  it('brackets the middle with both ends', () => {
    expect(pageSlots(10, 24)).toEqual([1, GAP, 8, 9, 10, 11, 12, GAP, 24])
  })

  it('draws the page rather than an ellipsis that would hide exactly one', () => {
    // At page 5 the run is 3 to 7 and only page 2 sits between it and page 1.
    // An ellipsis there is wider than the number it conceals and costs a click.
    expect(pageSlots(5, 24)).toEqual([1, 2, 3, 4, 5, 6, 7, GAP, 24])
    expect(pageSlots(20, 24)).toEqual([1, GAP, 18, 19, 20, 21, 22, 23, 24])
  })

  it('always offers the first and last page', () => {
    for (const page of [1, 2, 7, 13, 40, 99, 100]) {
      const slots = pageSlots(page, 100)
      expect(slots[0]).toBe(1)
      expect(slots[slots.length - 1]).toBe(100)
      // And never a page that does not exist.
      for (const slot of slots) {
        if (slot !== GAP) expect(slot).toBeGreaterThanOrEqual(1)
        if (slot !== GAP) expect(slot).toBeLessThanOrEqual(100)
      }
    }
  })
})
