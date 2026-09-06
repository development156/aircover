import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE FREE, BEST-EFFORT WRITE. NO HOLD, NO LEDGER, NEVER A REASON TO FAIL A SAVE.
 *
 * The founder's ruling: `brand_starters` is folded into what resolving a Brand
 * Brain already costs, so this file must never import `withCredits`, never
 * touch the ledger, and never let a failure anywhere inside it escape to its
 * caller (`saveBrandMemory`). These tests pin all three, plus the "check
 * first" contract: a version already served must not spend a second model
 * call, ever, regardless of what the unique constraint would have done.
 *
 * ── WHAT IT CANNOT SEE, STATED SO NOBODY READS SILENCE AS COVERAGE ──────────
 * The last test reads `write-starters.ts` as TEXT, and text is a weak proof of
 * an absence:
 *  · it reads ONE file. A hold reached through a helper in another module, a
 *    re-export, or a dynamic import built from a variable is invisible to it,
 *    and the charge would happen with this test green.
 *  · it matches three spellings. `withCredits`, `@sahoda/billing`, and a
 *    `creditCost` import from shared. A fourth way to spend a credit that
 *    nobody has written yet is not in the list.
 *  · it cannot see a RUNTIME charge. It proves the module does not name the
 *    ledger, never that no credit moved: only the ledger's own tests can say
 *    that, and they are in `packages/db`.
 *
 * The other tests here are behavioural and do not share these limits: they
 * drive the real function and assert that a throw never escapes and that a
 * second call is not made.
 */

vi.mock('server-only', () => ({}))

const WORKSPACE = 'ws_1'

const state = vi.hoisted(() => ({
  existingRow: null as { id: string } | null,
  existingError: null as { code: string } | null,
  inserted: [] as Record<string, unknown>[],
  insertError: null as { code: string } | null,
}))

const runTask = vi.fn()
vi.mock('@sahoda/mesh', () => ({
  createMesh: () => ({ runTask }),
  brandStartersTask: { def: { name: 'brand_starters' } },
}))

vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      if (table !== 'brand_starters') throw new Error(`unexpected table: ${table}`)
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.existingRow, error: state.existingError }),
            }),
          }),
        }),
        insert: async (row: Record<string, unknown>) => {
          state.inserted.push(row)
          return { error: state.insertError }
        },
      }
    },
  }),
}))

const BRAIN = {
  voice: {
    descriptor: 'Warm',
    formality_label: 'Relaxed',
    signature_phrases: [],
    banned_phrases: [],
  },
  brand_persona: { archetype: 'Caregiver', one_liner: 'Dependable.', core_values: [] },
  customer_persona: {
    one_liner: 'A busy owner.',
    primary_pain_point: '',
    primary_fear: '',
    desired_identity: '',
  },
  hook: { core_promise: 'Show up.', primary_emotion: 'Relief', sample_hooks: [] },
  taboo: { red_lines: [] },
  alignment: { signal_lock: 'moderate', note: '' },
} as never

const IDEAS = [
  { label: 'One', prompt: 'A first idea.' },
  { label: 'Two', prompt: 'A second idea.' },
  { label: 'Three', prompt: 'A third idea.' },
]

beforeEach(() => {
  vi.clearAllMocks()
  state.existingRow = null
  state.existingError = null
  state.inserted = []
  state.insertError = null
  runTask.mockResolvedValue({
    ok: true,
    data: { starters: IDEAS },
    usage: { model: 'anthropic/claude-haiku-4.5' },
  })
})

describe('writeBrandStartersBestEffort', () => {
  it('writes exactly one row from the mesh output when nothing is stored yet', async () => {
    const { writeBrandStartersBestEffort } = await import('./write-starters')

    await writeBrandStartersBestEffort({
      workspaceId: WORKSPACE,
      brandVersion: 3,
      payload: BRAIN,
      fieldMeta: undefined,
    })

    expect(runTask).toHaveBeenCalledTimes(1)
    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0]).toEqual(
      expect.objectContaining({
        workspace_id: WORKSPACE,
        brand_version: 3,
        starters: IDEAS,
        model_id: 'anthropic/claude-haiku-4.5',
      }),
    )
  })

  /**
   * "CHECK FIRST, NEVER RELY ON THE CONSTRAINT." Mutation: delete the
   * `if (existing.data) return` branch in `write-starters.ts` and this goes
   * red — the model would be called a second time for a version already
   * served.
   */
  it('never calls the mesh when a row already exists for this version', async () => {
    state.existingRow = { id: 'row_1' }
    const { writeBrandStartersBestEffort } = await import('./write-starters')

    await writeBrandStartersBestEffort({
      workspaceId: WORKSPACE,
      brandVersion: 3,
      payload: BRAIN,
      fieldMeta: undefined,
    })

    expect(runTask).not.toHaveBeenCalled()
    expect(state.inserted).toHaveLength(0)
  })

  it('does not write when the existence check itself fails (including an unapplied table)', async () => {
    state.existingError = { code: '42P01' }
    const { writeBrandStartersBestEffort } = await import('./write-starters')

    await writeBrandStartersBestEffort({
      workspaceId: WORKSPACE,
      brandVersion: 3,
      payload: BRAIN,
      fieldMeta: undefined,
    })

    expect(runTask).not.toHaveBeenCalled()
  })

  /**
   * "A FAILURE HERE CAN NEVER FAIL A BRAND BRAIN SAVE." Mutation: remove the
   * try/catch in `writeBrandStartersBestEffort` (or the `if (!result.ok)
   * return` branch) and this goes red — a mesh failure would throw out of the
   * function instead of being reported and swallowed.
   */
  it('never throws when the mesh call fails', async () => {
    runTask.mockResolvedValue({ ok: false, error: { code: 'PROVIDER_ERROR', message: 'nope' } })
    const { writeBrandStartersBestEffort } = await import('./write-starters')

    await expect(
      writeBrandStartersBestEffort({
        workspaceId: WORKSPACE,
        brandVersion: 3,
        payload: BRAIN,
        fieldMeta: undefined,
      }),
    ).resolves.toBeUndefined()
    expect(state.inserted).toHaveLength(0)
  })

  it('never throws when the mesh call itself throws', async () => {
    runTask.mockRejectedValue(new Error('network reset'))
    const { writeBrandStartersBestEffort } = await import('./write-starters')

    await expect(
      writeBrandStartersBestEffort({
        workspaceId: WORKSPACE,
        brandVersion: 3,
        payload: BRAIN,
        fieldMeta: undefined,
      }),
    ).resolves.toBeUndefined()
  })

  it('never throws when the insert itself fails', async () => {
    state.insertError = { code: '23505' }
    const { writeBrandStartersBestEffort } = await import('./write-starters')

    await expect(
      writeBrandStartersBestEffort({
        workspaceId: WORKSPACE,
        brandVersion: 3,
        payload: BRAIN,
        fieldMeta: undefined,
      }),
    ).resolves.toBeUndefined()
  })

  it('never imports or calls a credit hold on this path', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./write-starters.ts', import.meta.url), 'utf8'),
    )
    expect(source).not.toContain('withCredits')
    expect(source).not.toContain('@sahoda/billing')
    expect(source).not.toMatch(/import.*['"]@sahoda\/shared['"].*creditCost/)
  })
})
