import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * The onboarding intake has to reach `brand_memory.payload` AND survive there.
 *
 * The refusal gate resolves its rule set from `regime × locale`. Until this
 * shipped, onboarding classified the three picks, folded them into a prose
 * sentence for the resolve prompt and kept nothing — so `intakeFrom()` found no
 * intake on any workspace, every one resolved to `consumer` / `default`, and the
 * MANDATED tier was the floor pack alone. A clinic that picked "Health & care"
 * was judged by the general advertising floor.
 *
 * Two halves, and the second is the one that rots quietly:
 *
 *  1. onboarding's Finish writes it.
 *  2. every LATER write carries it forward. `BrandMemoryPayloadSchema` has no
 *     `intake` key and `saveBrandMemory` parses through it, so without an
 *     explicit carry-forward the first single-field edit from /brain would strip
 *     the regime and quietly return that clinic to the floor pack — with nothing
 *     on any screen to say it had happened.
 */

const rpc = vi.fn()
const readBrain = vi.hoisted(() => vi.fn())

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: 'user_1' })) }))
vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: vi.fn(async () => ({ id: 'ws_1', slug: 'ws', name: 'Workspace' })),
  // Derived from the SAME value the two-way mock returns, so every assertion in
  // this file still means what it meant. `workspaceForWrite` carries the REFUSAL
  // SENTENCE as well as the workspace — the split run 24 made, because "Create a
  // workspace first." was being said to people who had one.
  workspaceForWrite: async () => {
    const w = await Promise.resolve({ id: 'ws_1', slug: 'ws', name: 'Workspace' })
    return w ? { ok: true, workspace: w } : { ok: false, message: 'Create a workspace first.' }
  },
}))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: () => ({ rpc }) }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/brand/read-brain', () => ({ readBrain }))

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
  taboo: { red_lines: ['never promise a recovery time'] },
  alignment: { signal_lock: 'moderate', note: 'ok' },
}

const CLINIC = { model: 'service', regime: 'healthcare', locale: 'IN', basis: 'declared' } as const

/** What `readBrain` returns for a workspace that already declared its trade. */
const withStoredIntake = () => ({
  status: 'ok' as const,
  active: BRAIN,
  version: 3,
  provenance: { confirmed: [], total: 0 },
  meta: undefined,
  intake: CLINIC,
})

const noBrain = () => ({ status: 'no-brain' as const })

let saveBrandMemory: typeof import('./brand-resolve').saveBrandMemory

const payloadSent = () =>
  (rpc.mock.calls[0]![1] as { p_payload: Record<string, unknown> }).p_payload

beforeEach(async () => {
  vi.clearAllMocks()
  rpc.mockResolvedValue({ data: { version: 2, replayed: false }, error: null })
  readBrain.mockResolvedValue(noBrain())
  saveBrandMemory = (await import('./brand-resolve')).saveBrandMemory
})

describe('writing the intake', () => {
  test("onboarding's declaration reaches the payload", async () => {
    await saveBrandMemory(BRAIN, 'resolved', [], CLINIC)

    expect(payloadSent().intake).toEqual(CLINIC)
  })

  test('a derived regime is stored as derived, never upgraded on the way in', async () => {
    // The gate's refusal copy branches on this: `declared` may say "the trade you
    // told us you are in", and a regime we read out of their sentence may not.
    await saveBrandMemory(BRAIN, 'resolved', [], { ...CLINIC, basis: 'derived' })

    expect(payloadSent().intake).toMatchObject({ regime: 'healthcare', basis: 'derived' })
  })

  test('nothing is written when the caller has nothing to declare', async () => {
    await saveBrandMemory(BRAIN, 'resolved', [])

    expect(payloadSent()).not.toHaveProperty('intake')
  })

  test('a malformed stored intake is dropped rather than re-persisted for ever', async () => {
    readBrain.mockResolvedValue({ ...withStoredIntake(), intake: { regime: 'healthcare' } })

    await saveBrandMemory(BRAIN, 'manual', ['voice.descriptor'])

    expect(payloadSent()).not.toHaveProperty('intake')
  })
})

describe('keeping it', () => {
  test('a single-field edit from /brain does not strip the regime', async () => {
    // The whole point. `BrandMemoryPayloadSchema` has no `intake` key, so this
    // write parses it away unless it is deliberately carried forward — and the
    // symptom would be a clinic silently back on the floor pack.
    readBrain.mockResolvedValue(withStoredIntake())

    await saveBrandMemory(BRAIN, 'manual', ['voice.descriptor'])

    expect(payloadSent().intake).toEqual(CLINIC)
  })

  test('a re-resolve that declares nothing keeps what was declared before', async () => {
    // Returning to onboarding on a saved brain leaves the classifier with an
    // empty sentence, so `storedIntakeFrom` returns null. That must read as "say
    // nothing", not as "they are a consumer business now".
    readBrain.mockResolvedValue(withStoredIntake())

    await saveBrandMemory(BRAIN, 'resolved', [], null)

    expect(payloadSent().intake).toEqual(CLINIC)
  })

  test('a fresh declaration replaces the stored one', async () => {
    readBrain.mockResolvedValue(withStoredIntake())
    const corrected = { model: 'product', regime: 'food', locale: 'IN', basis: 'declared' } as const

    await saveBrandMemory(BRAIN, 'resolved', [], corrected)

    expect(payloadSent().intake).toEqual(corrected)
  })
})
