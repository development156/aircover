import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `saveBrandMemory` must revalidate the app layout.
 *
 * MEASURED 2026-09-06 on the wt-core preview: a workspace with no brain ran
 * onboarding, the resolve landed as version 1, and "Review Brand Brain" opened
 * /brain showing "Version 1", "0 of 15" and five populated sections — while the
 * topbar beside it still read "No brain yet" and linked to /onboarding. A hard
 * reload fixed it. The per-field actions (`brand-field.ts`,
 * `brain-resolve-fields.ts`) each call `revalidatePath('/', 'layout')` for
 * exactly this reason; the save that CREATES the brain did not, so the one
 * arrival where the ring changes the most was the one that served the old one.
 */

const state = vi.hoisted(() => ({ revalidated: [] as string[], rpcArgs: [] as unknown[] }))

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    state.revalidated.push(path)
  },
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_1' })) }))
vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: vi.fn(async () => ({ id: 'ws_1', slug: 'ws', name: 'Workspace' })),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    rpc: vi.fn(async (_name: string, args: unknown) => ({
      ...((state.rpcArgs.push(args), {}) as object),
      data: {
        version: 1,
        replayed: false,
        brand_memory: {
          id: '11111111-1111-4111-8111-111111111111',
          workspace_id: '22222222-2222-4222-8222-222222222222',
          version: 1,
          status: 'active',
          payload: BRAIN,
          source: 'resolved',
          created_by: 'user_1',
          created_at: '2026-09-06T00:00:00Z',
          updated_at: '2026-09-06T00:00:00Z',
        },
      },
      error: null,
    })),
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
  }),
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/brand/read-brain', () => ({
  readBrain: async () => ({ status: 'no-brain' }),
}))
vi.mock('@/lib/onboarding/pending-brain', () => ({ clearPendingBrain: vi.fn(async () => {}) }))

const BRAIN = vi.hoisted(() => ({
  voice: {
    descriptor: 'Warm',
    formality_label: 'Relaxed',
    signature_phrases: ['a', 'b', 'c'],
    banned_phrases: [],
  },
  brand_persona: { archetype: 'Caregiver', one_liner: 'Dependable.', core_values: ['a', 'b', 'c'] },
  customer_persona: {
    one_liner: 'A busy owner.',
    primary_pain_point: 'No time.',
    primary_fear: 'Looking amateur.',
    desired_identity: 'Established.',
  },
  hook: { core_promise: 'Show up.', primary_emotion: 'Relief', sample_hooks: ['a', 'b', 'c'] },
  taboo: { red_lines: [] },
  alignment: { signal_lock: 'moderate', note: 'ok' },
}))

beforeEach(() => {
  state.revalidated.length = 0
  state.rpcArgs.length = 0
})

describe('saveBrandMemory revalidation', () => {
  test('a successful save revalidates the layout, so the topbar ring stops saying "No brain yet"', async () => {
    const { saveBrandMemory } = await import('./brand-resolve')

    const result = await saveBrandMemory(BRAIN, 'resolved', [])

    expect(result).toEqual(expect.objectContaining({ ok: true }))
    expect(state.revalidated).toContain('/')
    expect(state.revalidated).toContain('/brain')
  })
})

describe('saveBrandMemory optimistic version', () => {
  test('omits p_expected_version by default (onboarding Finish must replay, not conflict)', async () => {
    const { saveBrandMemory } = await import('./brand-resolve')
    await saveBrandMemory(BRAIN, 'resolved', [])
    expect(state.rpcArgs[0]).not.toHaveProperty('p_expected_version')
  })

  test('sends p_expected_version when a hand edit names the version it read', async () => {
    const { saveBrandMemory } = await import('./brand-resolve')
    await saveBrandMemory(BRAIN, 'manual', ['voice.descriptor'], null, { expectedVersion: 4 })
    expect(state.rpcArgs[0]).toMatchObject({ p_expected_version: 4 })
  })

  test('stamps intake-seeded paths with source intake', async () => {
    const { saveBrandMemory } = await import('./brand-resolve')
    await saveBrandMemory(BRAIN, 'resolved', [], null, { intakePaths: ['taboo.red_lines'] })
    const payload = (
      state.rpcArgs[0] as { p_payload: { field_meta: Record<string, { source: string }> } }
    ).p_payload
    expect(payload.field_meta['taboo.red_lines']?.source).toBe('intake')
    expect(payload.field_meta['voice.descriptor']?.source).toBe('model:brand_guidelines')
  })
})
