import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * The typed-name check is re-run SERVER-SIDE. A `'use server'` export is a
 * callable endpoint whatever the browser renders, so the disabled button is a
 * courtesy and this is the control.
 */

const rpc = vi.fn()
const requireOpsAdmin = vi.fn(async () => undefined)

vi.mock('@/lib/ops/guard', () => ({ requireOpsAdmin }))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => ({ rpc }) }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { resetWorkspace } = await import('./ops-reset')

// A real gen_random_uuid() shape — v4, correct variant nibble.
const WS = '9f8b1c2d-4e5a-4b7c-9d1e-2f3a4b5c6d7e'

beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockResolvedValue({ data: null, error: null })
})

describe('resetWorkspace', () => {
  test('resets when the typed name matches', async () => {
    const result = await resetWorkspace(WS, 'Acme Chai', 'acme chai')

    expect(result).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('ops_workspace_reset', { p_workspace_id: WS })
  })

  test('refuses — and writes NOTHING — when the name does not match', async () => {
    const result = await resetWorkspace(WS, 'Acme Chai', 'Acme')

    expect(result).toEqual({ ok: false, message: 'The name did not match, so nothing was reset.' })
    expect(rpc, 'the RPC must never be reached').not.toHaveBeenCalled()
  })

  test('a non-uuid workspace never reaches the database', async () => {
    const result = await resetWorkspace('not-a-uuid', 'Acme Chai', 'Acme Chai')

    expect(result.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('a non-owner is stopped by the guard, before any check', async () => {
    requireOpsAdmin.mockRejectedValueOnce(new Error('not found'))

    const result = await resetWorkspace(WS, 'Acme Chai', 'Acme Chai')

    expect(result.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('says so plainly when the migration has not landed', async () => {
    // The remedy belongs to wt-db, not to the operator. "Something went wrong"
    // would send them looking in the wrong place.
    rpc.mockResolvedValue({ error: { code: 'PGRST202', message: 'could not find function' } })

    const result = await resetWorkspace(WS, 'Acme Chai', 'Acme Chai')

    expect(result).toEqual({
      ok: false,
      message:
        'Reset is not available yet. The ops_workspace_reset function has not been applied to this database.',
    })
  })

  test('maps the database role refusal to a sentence', async () => {
    rpc.mockResolvedValue({ error: { code: '42501', message: 'not permitted' } })

    const result = await resetWorkspace(WS, 'Acme Chai', 'Acme Chai')

    expect(result).toEqual({ ok: false, message: 'Only an ops owner can reset a workspace.' })
  })
})
