import { describe, expect, test } from 'vitest'

import { cogsUsd, parseEntries } from './parse-entries'

/**
 * A row shaped exactly as PostgREST returns it from `credit_ledger`.
 * `cogs_usd_est` is `numeric` in Postgres, so it arrives as a JSON *string*.
 */
function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    seq: 1,
    entry_type: 'DEBIT',
    amount: 12,
    balance_after: 88,
    action_type: 'brand_resolve',
    object_ref: 'brand:abc',
    model_tier: 'standard',
    cogs_usd_est: '0.0123',
    idempotency_key: 'ws:brand_resolve:abc',
    settles_entry_id: null,
    hold_expires_at: null,
    actor: 'user_abc',
    meta: null,
    created_at: '2026-07-19T10:00:00.000Z',
    ...overrides,
  }
}

describe('parseEntries', () => {
  test('parses a well-formed row and reports nothing skipped', () => {
    const result = parseEntries([row()])

    expect(result.skipped).toBe(0)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.seq).toBe(1)
    expect(result.entries[0]?.entry_type).toBe('DEBIT')
    expect(result.entries[0]?.model_tier).toBe('standard')
  })

  test('skips and counts a row whose model_tier is junk instead of throwing', () => {
    // credit_ledger.model_tier has no CHECK constraint, so a service-role
    // writer can put anything there. One bad row must not 500 the wallet page.
    const result = parseEntries([row({ model_tier: 'gpt-9-turbo-ultra' })])

    expect(result.entries).toEqual([])
    expect(result.skipped).toBe(1)
  })

  test('keeps the good rows when a batch is mixed', () => {
    const result = parseEntries([
      row({ seq: 3 }),
      row({ seq: 2, model_tier: 'not-a-tier' }),
      row({ seq: 1 }),
    ])

    expect(result.entries.map((e) => e.seq)).toEqual([3, 1])
    expect(result.skipped).toBe(1)
  })

  test('sorts by seq descending even when created_at disagrees', () => {
    // seq is the int8 identity; created_at can invert under lock contention.
    const result = parseEntries([
      row({ seq: 1, created_at: '2026-07-19T12:00:00.000Z' }),
      row({ seq: 3, created_at: '2026-07-19T10:00:00.000Z' }),
      row({ seq: 2, created_at: '2026-07-19T11:00:00.000Z' }),
    ])

    expect(result.entries.map((e) => e.seq)).toEqual([3, 2, 1])
    expect(result.skipped).toBe(0)
  })

  test('returns an empty result for non-array input rather than throwing', () => {
    expect(parseEntries(null)).toEqual({ entries: [], skipped: 0 })
    expect(parseEntries(undefined)).toEqual({ entries: [], skipped: 0 })
    expect(parseEntries({ error: 'permission denied for table credit_ledger' })).toEqual({
      entries: [],
      skipped: 0,
    })
    expect(parseEntries('boom')).toEqual({ entries: [], skipped: 0 })
  })

  test('counts every unparseable row, including non-objects inside the array', () => {
    const result = parseEntries([null, 'nope', 42, row()])

    expect(result.entries).toHaveLength(1)
    expect(result.skipped).toBe(3)
  })

  test('never leaks internals about why a row was skipped', () => {
    const result = parseEntries([row({ model_tier: 'junk', idempotency_key: 'ws:secret:key' })])

    // Only an honest count — no zod messages, no raw row, no idempotency keys.
    expect(Object.keys(result).sort()).toEqual(['entries', 'skipped'])
    expect(JSON.stringify(result)).not.toMatch(/secret|invalid|expected|zod|junk/i)
  })

  test('drops columns outside the contract instead of passing them through', () => {
    // The skipped path returns only a count, so the real leak vector is a row
    // that DOES parse while carrying an extra column PostgREST tacked on.
    const result = parseEntries([
      row({
        pg_error_detail: 'permission denied for table credit_ledger',
        pg_sqlstate: '42501',
        internal_note: 'stack trace here',
      }),
    ])

    expect(result.entries).toHaveLength(1)
    expect(Object.keys(result.entries[0] ?? {}).sort()).toEqual(Object.keys(row()).sort())
    expect(JSON.stringify(result)).not.toMatch(/permission denied|42501|stack trace/i)
  })

  test('does not mutate the caller’s array', () => {
    const rows = [row({ seq: 1 }), row({ seq: 2 })]
    parseEntries(rows)

    expect(rows.map((r) => r['seq'])).toEqual([1, 2])
  })
})

describe('cogsUsd', () => {
  test('coerces the PostgREST numeric string "0.0123" to the number 0.0123', () => {
    expect(cogsUsd({ cogs_usd_est: '0.0123' })).toBe(0.0123)
  })

  test('passes a real number through unchanged', () => {
    expect(cogsUsd({ cogs_usd_est: 0.5 })).toBe(0.5)
  })

  test('returns null when cogs_usd_est is null', () => {
    expect(cogsUsd({ cogs_usd_est: null })).toBeNull()
  })

  test('returns null rather than NaN for a non-numeric string', () => {
    expect(cogsUsd({ cogs_usd_est: 'NaN' })).toBeNull()
    expect(cogsUsd({ cogs_usd_est: 'free' })).toBeNull()

    // No caller ever receives NaN, which would render as "$NaN".
    const results = ['NaN', 'free', 'abc', ''].map((v) => cogsUsd({ cogs_usd_est: v }))
    expect(results.every((r) => r === null)).toBe(true)
  })

  test('returns null for an empty or whitespace string instead of coercing to zero', () => {
    // Number('') === 0, which would render a misleading "$0.00" cost.
    expect(cogsUsd({ cogs_usd_est: '' })).toBeNull()
    expect(cogsUsd({ cogs_usd_est: '   ' })).toBeNull()
  })

  test('returns null for a non-finite value rather than rendering Infinity', () => {
    expect(cogsUsd({ cogs_usd_est: 'Infinity' })).toBeNull()
    expect(cogsUsd({ cogs_usd_est: '-Infinity' })).toBeNull()

    // A decimal that overflows to Infinity must not slip past the pattern check.
    expect(cogsUsd({ cogs_usd_est: '1e999' })).toBeNull()
  })

  test('returns null for non-finite numbers, not just their string spellings', () => {
    expect(cogsUsd({ cogs_usd_est: Number.POSITIVE_INFINITY })).toBeNull()
    expect(cogsUsd({ cogs_usd_est: Number.NaN })).toBeNull()
  })

  test('refuses non-decimal literals rather than inventing a dollar amount', () => {
    // Number('0x1F') === 31. cogs_usd_est is `number | string` in the contract,
    // so any string reaches here — rendering "$31.00" for junk would be a lie.
    expect(cogsUsd({ cogs_usd_est: '0x1F' })).toBeNull()
    expect(cogsUsd({ cogs_usd_est: '0b11' })).toBeNull()
    expect(cogsUsd({ cogs_usd_est: '0o17' })).toBeNull()
  })

  test('still accepts the decimal spellings Postgres numeric actually emits', () => {
    expect(cogsUsd({ cogs_usd_est: '0.004200' })).toBe(0.0042)
    expect(cogsUsd({ cogs_usd_est: '-5' })).toBe(-5)
    expect(cogsUsd({ cogs_usd_est: '1e-3' })).toBe(0.001)
    expect(cogsUsd({ cogs_usd_est: ' 0.5 ' })).toBe(0.5)
  })

  test('preserves an honest zero cost', () => {
    expect(cogsUsd({ cogs_usd_est: '0' })).toBe(0)
  })

  test('normalises negative zero so a zero cost never renders a minus sign', () => {
    expect(Object.is(cogsUsd({ cogs_usd_est: '-0' }), 0)).toBe(true)
  })
})
