import { afterEach, describe, expect, it, vi } from 'vitest'

import { NOT_PERMITTED, WRITE_FAILED } from '@/lib/ops/action-state'

const state = vi.hoisted(() => ({
  /** What the RPC answers. `{ error: null }` unless a test says otherwise. */
  rpc: { data: null as unknown, error: null as { code?: string; message?: string } | null },
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  revalidated: [] as string[],
  adminThrows: false,
}))

vi.mock('@/lib/ops/guard', () => ({
  requireOpsAdmin: () => {
    if (state.adminThrows) throw new Error('NEXT_NOT_FOUND')
    return Promise.resolve({ id: 'a', role: 'admin', status: 'active' })
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.calls.push({ fn, args })
      return Promise.resolve(state.rpc)
    },
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => state.revalidated.push(path),
}))

vi.mock('@/lib/observability/report', () => ({ reportServerError: () => {} }))

const { moveTask, editTask, createTask, archiveTask } = await import('./ops-board')

afterEach(() => {
  state.rpc = { data: null, error: null }
  state.calls.length = 0
  state.revalidated.length = 0
  state.adminThrows = false
})

describe('the database decides, and a refusal is reported as one', () => {
  it('tells a viewer their change was NOT applied when Postgres raises 42501', async () => {
    // app.ops_writer() raises insufficient_privilege for a viewer, a revoked
    // seat and a stranger alike. The message must say the outcome without
    // confirming which of the three the caller is.
    state.rpc = { data: null, error: { code: '42501', message: 'not permitted' } }

    const result = await moveTask({ code: 'SL-011', column: 'done' })

    expect(result).toEqual({ ok: false, message: NOT_PERMITTED })
    expect(state.revalidated).toEqual([])
  })

  it('never forwards a raw Postgres message to the caller', async () => {
    state.rpc = {
      data: null,
      error: { code: 'P0001', message: 'relation "ops_tasks" violates constraint xyz' },
    }

    const result = await moveTask({ code: 'SL-011', column: 'review' })

    expect(result).toEqual({ ok: false, message: WRITE_FAILED })
    expect(JSON.stringify(result)).not.toContain('ops_tasks')
    expect(JSON.stringify(result)).not.toContain('constraint')
  })

  it.each([
    ['moveTask', () => moveTask({ code: 'SL-011', column: 'done' })],
    ['editTask', () => editTask('SL-011', { title: 'x' })],
    ['archiveTask', () => archiveTask('SL-011')],
  ])('%s reports failure rather than success when the write is refused', async (_n, run) => {
    state.rpc = { data: null, error: { code: '42501' } }

    const result = await run()

    expect(result.ok).toBe(false)
  })

  it('re-reads the board only after a write that actually landed', async () => {
    const ok = await moveTask({ code: 'SL-011', column: 'done' })

    expect(ok).toEqual({ ok: true })
    expect(state.revalidated).toContain('/admin/dev')
  })
})

describe('a blocked card must carry a reason', () => {
  it('refuses to block without one, and does not ask the database', async () => {
    // A crimson blocked ribbon with nothing behind it is the board lying
    // (doc 13 §10). Refused before the round trip, so there is nothing to undo.
    const result = await editTask('SL-011', { blocked: true, blockedReason: '   ' })

    expect(result.ok).toBe(false)
    expect(state.calls).toEqual([])
  })

  it('allows blocking WITH a reason', async () => {
    const result = await editTask('SL-011', {
      blocked: true,
      blockedReason: 'waiting on the Clerk webhook secret',
    })

    expect(result).toEqual({ ok: true })
    expect(state.calls[0]?.args.p_blocked_reason).toBe('waiting on the Clerk webhook secret')
  })

  it('allows UNblocking without one', async () => {
    const result = await editTask('SL-011', { blocked: false })

    expect(result).toEqual({ ok: true })
  })
})

describe('input that cannot be a card is rejected before the round trip', () => {
  it.each(['', 'SL', 'sl-11', 'SL-11111', '../../etc', 'SL-11; drop table'])(
    'rejects %j as a task code',
    async (code) => {
      const result = await archiveTask(code)

      expect(result.ok).toBe(false)
      expect(state.calls).toEqual([])
    },
  )

  it('rejects a column that is not one of the four', async () => {
    const result = await moveTask({
      code: 'SL-011',
      column: 'archived' as unknown as 'done',
    })

    expect(result.ok).toBe(false)
    expect(state.calls).toEqual([])
  })

  it('rejects an unknown field rather than silently dropping it', async () => {
    // `.strict()`: an edit that thinks it can set moved_by or commit_sha must
    // fail loudly, not be stripped and applied in part.
    const result = await editTask('SL-011', {
      title: 'x',
      movedBy: 'claude',
    } as unknown as { title: string })

    expect(result.ok).toBe(false)
    expect(state.calls).toEqual([])
  })
})

describe('createTask', () => {
  it('returns the code the database allocated', async () => {
    state.rpc = { data: 'SL-040', error: null }

    const result = await createTask({ title: 'A new card' })

    expect(result).toEqual({ ok: true, code: 'SL-040' })
  })

  it('reports failure when the database returns no code', async () => {
    // A create that cannot say which card it made has not succeeded, whatever
    // the absence of an error suggests.
    state.rpc = { data: null, error: null }

    const result = await createTask({ title: 'A new card' })

    expect(result).toEqual({ ok: false, message: WRITE_FAILED })
  })

  it('refuses an empty title', async () => {
    const result = await createTask({ title: '   ' })

    expect(result.ok).toBe(false)
    expect(state.calls).toEqual([])
  })
})

describe('the agent stamp is not reachable from here', () => {
  it('never sends moved_by — the RPC stamps human itself', async () => {
    await moveTask({ code: 'SL-011', column: 'done' })

    const args = state.calls[0]?.args ?? {}
    expect(Object.keys(args)).toEqual(['p_code', 'p_column', 'p_note'])
    expect(JSON.stringify(args)).not.toContain('moved_by')
  })
})
