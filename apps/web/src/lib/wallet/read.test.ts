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
  /** The workspace read itself failed — distinct from "there is none". */
  workspaceUnreadable: false,
  rows: null as unknown,
  /** PostgREST error to hand back, or null for a clean read. */
  error: null as { code: string; message: string } | null,
}))

// `server-only` throws outside a React Server Component graph.
vi.mock('server-only', () => ({}))

vi.mock('@/lib/workspaces', () => ({
  // The THREE-way read, because that distinction is now made one layer up. With
  // the old two-way `getActiveWorkspace`, an unreadable workspace read reached
  // `readBalance` as `null` and came back as `no-workspace` — which /home turns
  // into the whole First-run screen for a founder who has one.
  activeWorkspaceRead: () =>
    Promise.resolve(
      state.workspaceUnreadable
        ? { status: 'unreadable' }
        : state.workspace === null
          ? { status: 'none' }
          : { status: 'ok', workspace: { ...state.workspace, name: 'W', slug: 'w' } },
    ),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from(table: string) {
      const record = { table, filters: [] as Filter[] }
      state.queries.push(record)
      const result = () => ({ data: state.error ? null : state.rows, error: state.error })
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => Promise.resolve(result()),
        not: () => builder,
        eq: (column: string, value: unknown) => {
          record.filters.push({ column, value })
          return builder
        },
        maybeSingle: () => Promise.resolve(result()),
        then: (resolve: (v: unknown) => unknown) => resolve(result()),
      }
      return builder
    },
  }),
}))

const { readBalance, readLedger, readOpenHolds } = await import('./read')

const scopedTo = (query: { filters: Filter[] }) =>
  query.filters.some((f) => f.column === 'workspace_id' && f.value === WORKSPACE)

beforeEach(() => {
  state.queries = []
  state.workspace = { id: WORKSPACE }
  state.workspaceUnreadable = false
  state.rows = null
  state.error = null
})

describe('wallet reads are scoped to the active workspace', () => {
  test('readBalance filters credit_balances by workspace', async () => {
    await readBalance()

    expect(state.queries).toHaveLength(1)
    expect(state.queries[0]?.table).toBe('credit_balances')
    expect(scopedTo(state.queries[0]!)).toBe(true)
  })

  test('a workspace with no ledger row reads as a real zero, not a failure', async () => {
    // The row is materialised lazily by the first `apply_ledger_entry`, so a
    // workspace that has never spent has none. That is zero credits, and the
    // page must render the hero rather than an error.
    await expect(readBalance()).resolves.toEqual({
      status: 'ok',
      balance: { total: 0, held: 0, available: 0, hasHold: false, heldNote: null },
    })
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

  // UPDATED: this test used to assert readBalance() === null here, which pinned
  // "you have no workspace" and "we could not read your balance" to the SAME
  // value — so /wallet answered a signed-in first-run user with a red error and
  // a remedy ("reload to try again") that could never work. No reload creates a
  // workspace. The two cases are now distinct at the I/O edge.
  test('readBalance reports no-workspace, NOT unreadable, and issues no query', async () => {
    // Still never zero: zero would tell someone with a full wallet they cannot
    // afford to work. `no-workspace` is a third answer, not a softer failure.
    await expect(readBalance()).resolves.toEqual({ status: 'no-workspace' })
    expect(state.queries).toEqual([])
  })

  test('readLedger returns empty without querying', async () => {
    // `unreadable: false` and not true. There is no workspace to read a ledger
    // FOR, which is a different answer from a read that was attempted and
    // failed — and the screen above already returns before it could offer a
    // reload here.
    await expect(readLedger()).resolves.toEqual({ entries: [], skipped: 0, unreadable: false })
    expect(state.queries).toEqual([])
  })

  test('readOpenHolds returns empty without querying', async () => {
    await expect(readOpenHolds()).resolves.toEqual([])
    expect(state.queries).toEqual([])
  })
})

describe('a balance that genuinely could not be read stays unreadable', () => {
  test('a PostgREST error is unreadable, not a first run', async () => {
    // The whole point of the split: offering "Create workspace" to a member
    // whose balance read hiccuped would be the mirror-image false remedy.
    state.error = { code: 'PGRST116', message: 'multiple rows returned' }

    await expect(readBalance()).resolves.toEqual({ status: 'unreadable' })
  })

  test('a thrown read is unreadable too', async () => {
    state.workspace = {
      get id(): string {
        throw new Error('cookies() outside a request')
      },
    }

    await expect(readBalance()).resolves.toEqual({ status: 'unreadable' })
  })
})

/**
 * THE SAME SPLIT, ON THE LEDGER, WHICH NEVER GOT IT.
 *
 * `readBalance` was fixed for this and its reasoning is twelve lines above
 * `readLedger` in the same file. `readSpend`, which reads the same
 * `credit_ledger` table for Home's other card, carries the rule verbatim:
 * "`unreadable` is NOT the same claim and must never render as an empty chart,
 * which would tell the user they spent nothing when we simply could not look."
 *
 * `readLedger` was left behind. Every failure returned `{ entries: [] }`, which
 * both callers read as "nothing has ever happened" — the wallet printed "No
 * credit activity yet" and Home printed "Nothing has happened yet", each a
 * confident statement about somebody's money made from a question that never
 * got an answer.
 */
describe('a credit history that could not be read is not an empty one', () => {
  test('a PostgREST error says so, rather than reporting an empty ledger', async () => {
    state.error = { code: 'PGRST301', message: 'connection failed' }

    await expect(readLedger()).resolves.toEqual({ entries: [], skipped: 0, unreadable: true })
  })

  test('a thrown read says so too', async () => {
    state.workspace = {
      get id(): string {
        throw new Error('cookies() outside a request')
      },
    }

    await expect(readLedger()).resolves.toEqual({ entries: [], skipped: 0, unreadable: true })
  })

  /**
   * The other half, and the one that keeps the fix honest: a workspace that has
   * genuinely never spent anything must still read as empty. A flag that were
   * always true would replace one wrong sentence with another.
   */
  test('a ledger that really is empty stays empty', async () => {
    state.rows = []

    await expect(readLedger()).resolves.toEqual({ entries: [], skipped: 0, unreadable: false })
  })
})

/**
 * The arm that did not exist. `readBalance` split `no-workspace` from
 * `unreadable` in its OWN failure modes but read a `string | null` workspace id,
 * which had already collapsed the same two. So a failed workspace read arrived
 * as `no-workspace` and /home replaced the entire dashboard with First run —
 * "Create a workspace" to someone who has one — while the credit chip read
 * "No wallet yet" beside it.
 */
describe('an unreadable workspace read is not an empty account', () => {
  test('readBalance reports unreadable, NOT no-workspace, and issues no query', async () => {
    state.workspaceUnreadable = true

    await expect(readBalance()).resolves.toEqual({ status: 'unreadable' })
    // Nothing may be asked of a workspace we could not identify.
    expect(state.queries).toEqual([])
  })
})
