import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * ONE ROUND TRIP FOR THE SUBSCRIPTION, NOT TWO IN SERIES.
 *
 * MEASURED 2026-09-06 on production edge logs: every /home render made two
 * `subscriptions` selects one after the other — the plan columns, then the
 * lifecycle columns — because the lifecycle migration was once optional. It
 * has been applied on production (20260819213000) and staging (20260904072448)
 * since, so the guarded second read is a whole extra round trip in front of
 * every dashboard for a case that no longer occurs. The single select is the
 * normal path; the split read survives ONLY as the fallback for a database
 * that answers "no such column".
 */
const state = vi.hoisted(() => ({
  selects: [] as string[],
  /** Per select, in order: the result to hand back. */
  answers: [] as { data: unknown[] | null; error: { code: string; message: string } | null }[],
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/workspaces', () => ({
  activeWorkspaceRead: () =>
    Promise.resolve({
      status: 'ok',
      workspace: { id: '22222222-2222-4222-8222-222222222222', name: 'W', slug: 'w' },
    }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: (columns: string) => {
        state.selects.push(columns)
        const answer = state.answers.shift() ?? { data: [], error: null }
        const builder: Record<string, unknown> = {}
        for (const key of ['eq', 'order']) builder[key] = () => builder
        builder.limit = () => Promise.resolve(answer)
        return builder
      },
    }),
  }),
}))

import { readSubscription } from './read'

const ROW = {
  workspace_id: '22222222-2222-4222-8222-222222222222',
  plan_id: 'growth',
  status: 'active',
  current_period_start: '2026-09-01T00:00:00.000Z',
  current_period_end: '2026-10-01T00:00:00.000Z',
  cancel_at_period_end: false,
  pending_plan_id: 'starter',
  pending_plan_effective_at: '2026-10-01T00:00:00.000Z',
  grace_ends_at: null,
  dunning_attempts: 0,
  last_failure_at: null,
  last_failure_code: null,
}

beforeEach(() => {
  state.selects = []
  state.answers = []
  vi.resetModules()
})

async function read() {
  const mod = await import('./read')
  return mod.readSubscription()
}

describe('readSubscription', () => {
  test('reads the plan and its lifecycle in ONE select', async () => {
    state.answers = [{ data: [ROW], error: null }]
    const result = await read()
    expect(state.selects).toHaveLength(1)
    expect(state.selects[0]).toMatch(/plan_id/)
    expect(state.selects[0]).toMatch(/pending_plan_id/)
    expect(result).toMatchObject({
      status: 'ok',
      data: { planId: 'growth', pendingPlanId: 'starter' },
    })
  })

  test('falls back to the plan columns alone when the lifecycle columns do not exist', async () => {
    state.answers = [
      { data: null, error: { code: '42703', message: 'column "grace_ends_at" does not exist' } },
      { data: [{ ...ROW, pending_plan_id: undefined, grace_ends_at: undefined }], error: null },
    ]
    const result = await read()
    expect(state.selects).toHaveLength(2)
    expect(state.selects[1]).not.toMatch(/pending_plan_id/)
    expect(result).toMatchObject({
      status: 'ok',
      data: { planId: 'growth', pendingPlanId: null, dunningAttempts: 0 },
    })
  })

  test('any other failure is unreadable, never a silent Free', async () => {
    state.answers = [{ data: null, error: { code: '57014', message: 'statement timeout' } }]
    await expect(read()).resolves.toEqual({ status: 'unreadable' })
    expect(state.selects).toHaveLength(1)
  })

  test('no row is Free, read once', async () => {
    state.answers = [{ data: [], error: null }]
    const result = await read()
    expect(state.selects).toHaveLength(1)
    expect(result).toMatchObject({ status: 'ok', data: { planId: 'free', status: 'active' } })
  })
})

// `readSubscription` is imported above so the module graph is warm; the tests
// go through `read()` so `vi.resetModules` gives each one a fresh `cache`.
void readSubscription
