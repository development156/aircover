import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * Workspace scoping on the wallet reads.
 *
 * RLS is `workspace_id in (select app.member_workspace_ids())` — EVERY workspace
 * the user belongs to, not the active one. So RLS alone is not a tenant
 * selector, and none of these reads originally added a filter.
 *
 * `credit_balances` is one row per workspace and the read uses `.maybeSingle()`,
 * so a second membership with activity returns two rows, postgrest-js
 * synthesises PGRST116, and the wallet reads as permanently unreadable with an
 * em-dash credit chip. Latent in Alpha (one membership per user), silent and
 * total the day that stops being true — which is exactly the kind of bug that
 * ships.
 *
 * These assert the filter is applied on every path. A genuinely live check needs
 * two memberships against real RLS and belongs with the db suite.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'

type Filter = { column: string; value: unknown }

const state = vi.hoisted(() => ({
  /** Every `.eq()` applied, per `.from()` call, in order. */
  queries: [] as { table: string; filters: Filter[] }[],
  workspace: null as { id: string } | null,
  rows: null as unknown,
}))

// `server-only` throws outside a React Server Component graph.
vi.mock('server-only', () => ({}))

vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve(state.workspace),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from(table: string) {
      const record = { table, filters: [] as Filter[] }
      state.queries.push(record)
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => Promise.resolve({ data: state.rows, error: null }),
        not: () => builder,
        eq: (column: string, value: unknown) => {
          record.filters.push({ column, value })
          return builder
        },
        maybeSingle: () => Promise.resolve({ data: state.rows, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: state.rows, error: null }),
      }
      return builder
    },
  }),
}))

const { readAvailableCredits, readBalance, readLedger, readOpenHolds } = await import('./read')

const scopedTo = (query: { filters: Filter[] }) =>
  query.filters.some((f) => f.column === 'workspace_id' && f.value === WORKSPACE)

beforeEach(() => {
  state.queries = []
  state.workspace = { id: WORKSPACE }
  state.rows = null
})

describe('wallet reads are scoped to the active workspace', () => {
  test('readBalance filters credit_balances by workspace', async () => {
    await readBalance()

    expect(state.queries).toHaveLength(1)
    expect(state.queries[0]?.table).toBe('credit_balances')
    expect(scopedTo(state.queries[0]!)).toBe(true)
  })

  test('readLedger filters credit_ledger by workspace', async () => {
    state.rows = []
    await readLedger()

    expect(state.queries.every(scopedTo)).toBe(true)
  })

  test('readOpenHolds scopes BOTH sides of the anti-join', async () => {
    state.rows = []
    await readOpenHolds()

    // Scoping only the holds side would compare one tenant's holds against
    // another's settlements and report settled holds as stuck credits.
    expect(state.queries.length).toBeGreaterThanOrEqual(2)
    expect(state.queries.every(scopedTo)).toBe(true)
  })
})

describe('wallet reads with no active workspace', () => {
  beforeEach(() => {
    state.workspace = null
  })

  test('readBalance reports unreadable rather than issuing an unscoped query', async () => {
    // Zero would tell someone with a full wallet they cannot afford to work.
    await expect(readBalance()).resolves.toBeNull()
    expect(state.queries).toEqual([])
  })

  test('the credit chip shows unknown, not zero', async () => {
    await expect(readAvailableCredits()).resolves.toBeNull()
  })

  test('readLedger returns empty without querying', async () => {
    await expect(readLedger()).resolves.toEqual({ entries: [], skipped: 0 })
    expect(state.queries).toEqual([])
  })

  test('readOpenHolds returns empty without querying', async () => {
    await expect(readOpenHolds()).resolves.toEqual([])
    expect(state.queries).toEqual([])
  })
})
