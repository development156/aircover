import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * The manual Loop cycle's one paid step is a `plan_week` model call. The model
 * only knows what "the coming week" means if the input carries `nowIso`; the
 * action parsed it into the schema and then called `runTask` without it, so the
 * model planned in an arbitrary era and `normalizeSlot` clamped every slot to
 * the fallback ladder. Pinned here: the mesh input carries the cycle's clock.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'
const CYCLE_ID = '33333333-3333-4333-8333-333333333333'

const state = vi.hoisted(() => ({
  meshInput: null as { goals: string; channels: string[]; nowIso?: string } | null,
  reported: [] as unknown[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: 'user_abc' }),
}))

vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: async () => ({ ok: true, workspace: { id: WS_ID } }),
}))

vi.mock('@sahoda/billing', () => ({
  loadBillingEnv: () => ({ databaseUrl: 'postgres://test' }),
  createPgLedgerPort: () => ({}),
  createWithCredits:
    () =>
    async (
      config: { action: string },
      callback: (ctx: { actionType: string; creditsCharged: number }) => Promise<unknown>,
    ) => {
      try {
        await callback({ actionType: config.action, creditsCharged: 20 })
        return { ok: true, data: { balanceAfter: 80 } }
      } catch (thrown) {
        const message = thrown instanceof Error ? thrown.message : String(thrown)
        return { ok: false, error: { code: 'PROVIDER_ERROR', message } }
      }
    },
}))

vi.mock('@sahoda/mesh', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sahoda/mesh')>()
  return {
    ...original,
    createMesh: () => ({
      runTask: (_def: unknown, input: { goals: string; channels: string[]; nowIso?: string }) => {
        state.meshInput = input
        return Promise.resolve({
          ok: true,
          data: {
            briefs: [0, 1, 2, 3, 4].map((i) => ({
              title: `Brief ${i}`,
              body: `Idea ${i}`,
              channels: ['x'],
              suggestedSlot: new Date(Date.now() + (i + 1) * 86_400_000).toISOString(),
            })),
          },
        })
      },
    }),
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve(
              table === 'loop_settings'
                ? { data: { paused: false, weekly_budget_credits: null }, error: null }
                : { data: null, error: null },
            ),
          in: () =>
            Promise.resolve(
              table === 'connections'
                ? { data: [{ platform: 'x', status: 'active' }], error: null }
                : { data: [], error: null },
            ),
          // The brain gate reads `brand_memory` with two eq() and a head count.
          // A resolved brain (count 1) lets the cycle proceed, which is what
          // this suite exercises.
          eq: () =>
            Promise.resolve(
              table === 'brand_memory' ? { count: 1, error: null } : { count: 0, error: null },
            ),
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/loop/store', () => ({
  openCycle: () => Promise.resolve({ cycle: { id: CYCLE_ID }, created: true }),
  setCycleStatus: () => Promise.resolve(true),
  readObservations: () => Promise.resolve([]),
  proposeLearning: () => Promise.resolve(),
  writeBriefs: (_cycleId: string, _wsId: string, rows: unknown[]) =>
    Promise.resolve(rows.map((_, i) => ({ id: `brief-${i}` }))),
  readBriefs: () => Promise.resolve([]),
  haltForCostApproval: () => Promise.resolve(true),
  addSpend: () => Promise.resolve(),
}))

// Recorded rather than swallowed: the action's catch turns any throw into
// "Could not run the cycle", which would let a broken mock pass for a defect.
vi.mock('@/lib/observability/report', () => ({
  reportServerError: (error: unknown) => {
    state.reported.push(error)
  },
}))

const { runCycleToPreview } = await import('./loop-cycle')

beforeEach(() => {
  state.meshInput = null
  state.reported = []
})

describe('runCycleToPreview — the plan step is anchored in time', () => {
  test('the mesh input carries the nowIso the cycle was given', async () => {
    const nowIso = '2026-09-02T10:00:00.000Z'

    const result = await runCycleToPreview('manual', nowIso)

    expect(state.reported).toEqual([])
    expect(result).toEqual({ ok: true, cycleId: CYCLE_ID })
    expect(state.meshInput?.nowIso).toBe(nowIso)
  })

  test('with no clock given, the mesh input carries a nowIso within 1s of now', async () => {
    const before = Date.now()
    await runCycleToPreview('manual')
    const after = Date.now()

    expect(state.reported).toEqual([])
    const nowIso = state.meshInput?.nowIso
    expect(typeof nowIso).toBe('string')
    const at = new Date(nowIso as string).getTime()
    expect(Number.isNaN(at)).toBe(false)
    expect(at).toBeGreaterThanOrEqual(before - 1_000)
    expect(at).toBeLessThanOrEqual(after + 1_000)
  })
})
