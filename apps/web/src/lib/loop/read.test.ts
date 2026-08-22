import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * THE LOOP'S SIX READS, AND THE FOUR FALSE SENTENCES THEY USED TO PRODUCE.
 *
 * `one-null-two-meanings.test.ts` drives the two WORKSPACE answers. It cannot
 * reach the third meaning, which is the one the Loop actually carried: the
 * workspace resolved fine and a QUERY failed. `readLoopSnapshot` discarded every
 * PostgREST error — `data ?? []`, `data?.paused`, `cycleRes.data as … | null` —
 * so a failed read arrived at the page as an empty one, and /loop and /report
 * turned it into claims about the customer's business:
 *
 *   connections   → "Connect a channel first — Sahoda has nowhere to plan for."
 *                   with Plan my week DISABLED (controls.tsx:101,107), and a
 *                   second copy of the same falsehood in the dial
 *                   (autonomy-dial.tsx:67) — to a workspace with four channels
 *   loop_settings → the DEFAULT weekly budget rendered as though stored, which
 *                   is an unmeasured number on a spending limit
 *   loop_cycles   → "No week has been reported yet" on /report; and on /loop the
 *                   cost-approval halt vanishes, taking its approve button with it
 *   loop_briefs   → a cost preview priced from no briefs
 *
 * One table at a time, because a guard that only fires when everything breaks is
 * a guard that never fires: the interesting failure is ONE query timing out, not
 * the database going away.
 */

/**
 * The tables whose empty value the screen turns into a CLAIM. One failing makes
 * the whole snapshot unreadable.
 */
const CLAIMING_TABLES = [
  'loop_settings',
  'loop_channel_autonomy',
  'connections',
  'loop_cycles',
  'loop_briefs',
] as const

const state = vi.hoisted(() => ({
  /** The table whose query fails, or null for a healthy database. */
  failing: null as string | null,
  /** Whether `loop_cycles` has a row — `loop_briefs` is only read when it does. */
  hasCycle: true,
  tables: [] as string[],
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/workspaces', () => ({
  activeWorkspaceRead: () =>
    Promise.resolve({ status: 'ok', workspace: { id: 'ws_1', name: 'W', slug: 'w' } }),
}))

/** A row shaped enough for the mapper, per table. */
function rowsFor(table: string): Record<string, unknown>[] {
  switch (table) {
    case 'loop_settings':
      return [{ paused: true, weekly_budget_credits: 50 }]
    case 'loop_channel_autonomy':
      return [{ channel: 'instagram', level: 2 }]
    case 'connections':
      return [{ platform: 'instagram' }, { platform: 'linkedin' }]
    case 'loop_cycles':
      return state.hasCycle
        ? [
            {
              id: 'cyc_1',
              iso_year: 2026,
              iso_week: 34,
              status: 'awaiting_cost_approval',
              estimated_credits: 21,
              approved_credits: null,
              cost_approved_at: null,
              spent_credits: 20,
              budget_credits: 150,
              reflect_skipped_no_history: false,
              failure_reason: null,
              started_at: '2026-08-17T00:00:00Z',
              reported_at: null,
            },
          ]
        : []
    case 'loop_briefs':
      return [
        {
          id: 'b_1',
          priority: 1,
          title: 'T',
          body: 'B',
          channels: ['instagram'],
          suggested_slot: null,
          rationale: null,
          estimated_credits: 3,
          included: true,
          post_id: null,
          stage_outcome: 'planned',
        },
      ]
    default:
      return []
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from(table: string) {
      state.tables.push(table)
      const settle = (single: boolean) => {
        if (state.failing === table) {
          // What PostgREST hands back on a fault: no data, and an error the
          // caller has to look at. Discarding it is the whole defect.
          return Promise.resolve({
            data: null,
            error: { code: '57014', message: 'canceling statement due to statement timeout' },
          })
        }
        const rows = rowsFor(table)
        return Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: null })
      }
      const builder: Record<string, unknown> = {}
      for (const key of ['select', 'eq', 'order', 'limit', 'in', 'not']) {
        builder[key] = () => builder
      }
      builder.maybeSingle = () => settle(true)
      builder.single = () => settle(true)
      builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        settle(false).then(resolve, reject)
      return builder
    },
  }),
}))

import { readLoop, readLoopSnapshot } from '@/lib/loop/read'

beforeEach(() => {
  state.failing = null
  state.hasCycle = true
  state.tables = []
})

describe('a healthy database still reads', () => {
  test('readLoop returns what the six queries said, not a default', async () => {
    const read = await readLoop()

    // The other half of every guard below. A reader that answered `unreadable`
    // to everything would satisfy them all and be an outage.
    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.workspaceId).toBe('ws_1')
    // Stored, not defaulted: 50 is the row, and the default is a different
    // number. This is the assertion that fails if the settings read is silently
    // dropped again.
    expect(read.snapshot.weeklyBudgetCredits).toBe(50)
    expect(read.snapshot.paused).toBe(true)
    expect([...read.snapshot.connected].sort()).toEqual(['instagram', 'linkedin'])
    expect(read.snapshot.cycle?.status).toBe('awaiting_cost_approval')
    expect(read.snapshot.briefs).toHaveLength(1)
  })

  test('a workspace with no cycle is ok and empty, never unreadable', async () => {
    state.hasCycle = false

    const read = await readLoop()

    // "You have not run a week yet" is a true and different answer from "we
    // could not look", and /report prints a different paragraph for it.
    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.snapshot.cycle).toBeNull()
    expect(read.snapshot.briefs).toEqual([])
    // Nothing to price, so nothing was asked.
    expect(state.tables).not.toContain('loop_briefs')
  })
})

describe('memory_events failing does NOT blank the page', () => {
  test('the snapshot still answers, with no learnings and no claim about them', async () => {
    state.failing = 'memory_events'

    const read = await readLoop()

    // `PendingLearnings` renders null for an empty list, so a failed read here
    // produces no sentence and no figure — there is nothing to be wrong about.
    // Blanking the page for it would hide the cost-approval halt, which is the
    // one time-sensitive thing on this screen. An over-broad rule is not a safer
    // rule.
    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.snapshot.learnings).toEqual([])
    // And everything the screen DOES make a claim from is still real.
    expect(read.snapshot.weeklyBudgetCredits).toBe(50)
    expect(read.snapshot.cycle?.status).toBe('awaiting_cost_approval')
  })
})

describe.each(CLAIMING_TABLES)('%s failing alone', (table) => {
  test('readLoopSnapshot refuses to answer', async () => {
    state.failing = table
    // `loop_briefs` is only reached when a cycle exists, which is the default.
    const snapshot = await readLoopSnapshot('ws_1')

    expect(snapshot, `${table} errored and the snapshot was still returned`).toBeNull()
  })

  test('readLoop reports unreadable, never an empty Loop', async () => {
    state.failing = table

    const read = await readLoop()

    // `ok` here is the bug: the page would print "Connect a channel first" over
    // two live connections, or "No week has been reported yet" over a running
    // cycle. `no-workspace` would be worse still — a remedy for a problem the
    // customer does not have.
    expect(read.status, `${table} errored and /loop would have rendered a claim`).toBe('unreadable')
  })
})
