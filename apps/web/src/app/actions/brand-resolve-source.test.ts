import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `saveBrandMemory` must not launder a demo fallback into a genuine resolve.
 *
 * `packages/shared/src/brand/resolve.ts` states the contract: a fallback
 * payload "persists with `source='system'` … never presented as a genuine
 * resolve". The call hardcoded `p_source: 'resolved'`, which was survivable
 * only while nothing could re-save a fallback. Onboarding now loads a saved
 * brain and offers Approve on it, so a sample the model fell back to could be
 * approved straight back in as the user's real brand — destroying the one flag
 * that says it is not.
 */

const rpc = vi.fn()

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_1' })) }))
vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: vi.fn(async () => ({ id: 'ws_1', slug: 'ws', name: 'Workspace' })),
}))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => ({ rpc }) }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))

const BRAIN = {
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
}

let saveBrandMemory: typeof import('./brand-resolve').saveBrandMemory

beforeEach(async () => {
  vi.clearAllMocks()
  rpc.mockResolvedValue({ data: { version: 2, replayed: false }, error: null })
  saveBrandMemory = (await import('./brand-resolve')).saveBrandMemory
})

describe('saveBrandMemory provenance', () => {
  test('defaults to a genuine resolve', async () => {
    await saveBrandMemory(BRAIN)

    expect(rpc).toHaveBeenCalledWith(
      'resolve_brand_memory',
      expect.objectContaining({ p_source: 'resolved' }),
    )
  })

  test('keeps a demo fallback flagged as a sample', async () => {
    await saveBrandMemory(BRAIN, 'system')

    expect(rpc).toHaveBeenCalledWith(
      'resolve_brand_memory',
      expect.objectContaining({ p_source: 'system' }),
    )
  })

  test('never writes a source outside the two it names', async () => {
    // The RPC rejects anything outside resolved | manual | system, so a value
    // smuggled through here fails the write rather than corrupting the row —
    // but it should not reach the RPC at all.
    await saveBrandMemory(BRAIN, 'manual' as never)

    const call = rpc.mock.calls[0]?.[1] as { p_source: string }
    expect(['resolved', 'system']).toContain(call.p_source)
  })
})
