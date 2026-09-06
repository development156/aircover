import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE STOP SWITCH REPORTS WHAT THE DATABASE DID, NOT WHAT THE REFUND DID.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * `loop_kill_switch` commits the stop: cycles cancelled, posts unscheduled, the
 * Loop paused. The action then refunded any open holds through the ledger
 * pool, and it opened that pool BEFORE looking at whether there was a hold to
 * refund. On the wt-core preview, whose environment has no SUPABASE_DB_URL,
 * `loadBillingEnv()` threw for a workspace with zero holds and the person read
 * "Could not stop the Loop. Try again." over a Loop that a reload showed
 * stopped (MEASURED 2026-09-06, QA workspace 83bcafc4).
 */

const h = vi.hoisted(() => ({
  rpc: vi.fn<(name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>>(),
  loadBillingEnv: vi.fn<() => { databaseUrl: string }>(),
  apply: vi.fn<(entry: unknown) => Promise<unknown>>(),
  close: vi.fn(async () => undefined),
  createPgLedgerPort: vi.fn(),
  reportServerError: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_a' }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/actions/revalidate-balance', () => ({ revalidateBalance: vi.fn() }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: h.reportServerError }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: async () => ({ ok: true, workspace: { id: 'ws_a' } }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({ rpc: h.rpc }),
}))
vi.mock('@sahoda/billing', () => ({
  loadBillingEnv: h.loadBillingEnv,
  createPgLedgerPort: h.createPgLedgerPort,
}))

import { killLoop } from './loop-controls'

const STOPPED = {
  cycles_cancelled: 1,
  briefs_skipped: 3,
  posts_unscheduled: 0,
  variants_unscheduled: 0,
  paused: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  h.createPgLedgerPort.mockReturnValue({ apply: h.apply, close: h.close })
  h.loadBillingEnv.mockImplementation(() => {
    throw new Error('@sahoda/billing: missing required env — SUPABASE_DB_URL')
  })
})

describe('killLoop — the refund cannot undo the report of the stop', () => {
  it('reports the stop as done, and never opens the ledger pool, when there is nothing to refund', async () => {
    h.rpc.mockResolvedValue({ data: { ...STOPPED, outstanding_holds: [] }, error: null })

    const out = await killLoop(true)

    expect(out).toMatchObject({ ok: true, cyclesCancelled: 1, holdsFound: 0, holdsReleased: 0 })
    expect(h.loadBillingEnv).not.toHaveBeenCalled()
    expect(h.createPgLedgerPort).not.toHaveBeenCalled()
    expect(h.reportServerError).not.toHaveBeenCalled()
  })

  it('still reports the stop as done when a refund cannot run, and says so to the log', async () => {
    h.rpc.mockResolvedValue({
      data: { ...STOPPED, outstanding_holds: [{ entry_id: 'hold_1', amount: 20 }] },
      error: null,
    })

    const out = await killLoop(true)

    // The database committed the stop. A person must not be told otherwise.
    expect(out).toMatchObject({ ok: true, cyclesCancelled: 1, holdsFound: 1, holdsReleased: 0 })
    expect(h.reportServerError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ action: 'killLoop.releasePort', workspaceId: 'ws_a' }),
    )
  })

  it('refunds each hold, counts them, and closes the pool it opened', async () => {
    h.loadBillingEnv.mockReturnValue({ databaseUrl: 'postgres://example' })
    h.apply.mockResolvedValue({ ok: true })
    h.rpc.mockResolvedValue({
      data: {
        ...STOPPED,
        outstanding_holds: [
          { entry_id: 'hold_1', amount: 20 },
          { entry_id: 'hold_2', amount: 3 },
        ],
      },
      error: null,
    })

    const out = await killLoop(true)

    expect(out).toMatchObject({ ok: true, holdsFound: 2, holdsReleased: 2 })
    expect(h.apply).toHaveBeenCalledTimes(2)
    expect(h.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        entryType: 'RELEASE',
        settlesEntryId: 'hold_1',
        idempotencyKey: 'loop-kill:release:hold_1',
      }),
    )
    // The previous version leaked one pool per press.
    expect(h.close).toHaveBeenCalledTimes(1)
  })

  it('reports a refused stop as refused', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'FORBIDDEN_ROLE' } })

    const out = await killLoop(true)

    expect(out.ok).toBe(false)
    expect(h.createPgLedgerPort).not.toHaveBeenCalled()
  })
})
