import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `planMyWeek` charges 20 credits (`loop_cycle`) for one model call plus five
 * draft inserts. The honesty-critical properties pinned here:
 *  - inserts happen INSIDE the withCredits callback — an insert failure throws,
 *    the HOLD releases, and "you were not charged" stays true;
 *  - the objectRef is server-minted and fresh per invocation;
 *  - the drafts that land are `origin: 'plan_week'`, `status: 'draft'`, with a
 *    normalized future `scheduled_at` and channels clamped to the request.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'

interface WithCreditsConfig {
  workspaceId: string
  action: string
  objectRef: string
}

const state = vi.hoisted(() => ({
  meshResult: null as
    | { ok: true; data: { briefs: Array<Record<string, unknown>> } }
    | { ok: false; error: { code: string; message: string } }
    | null,
  insertResult: {
    data: null as Array<{ id: string }> | null,
    error: null as { code: string } | null,
  },
  insufficient: false,
  /** Callback runs to completion, then the wrapper still reports failure (lost ack). */
  lostAck: false,
  /** `loadBillingEnv` throws its fail-fast error (SUPABASE_DB_URL unset on the deployment). */
  billingEnvMissing: false,
  /** `createMesh` throws its fail-fast error (a mesh key unset on the deployment). */
  meshEnvMissing: false,
  calls: {
    configs: [] as WithCreditsConfig[],
    insertedRows: null as Array<Record<string, unknown>> | null,
    meshRuns: 0,
    meshInput: null as { goals: string; channels: string[] } | null,
  },
}))

function brief(i: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: `Brief ${i}`,
    body: `Idea ${i}`,
    channels: ['x'],
    suggestedSlot: new Date(Date.now() + (i + 1) * 86_400_000).toISOString(),
    ...overrides,
  }
}

const FIVE_BRIEFS = [0, 1, 2, 3, 4].map((i) => brief(i))
const FIVE_IDS = [0, 1, 2, 3, 4].map((i) => ({ id: `00000000-0000-4000-8000-00000000000${i}` }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: 'user_abc' }),
}))

vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve({ id: WS_ID }),
  // Derived from the SAME value the two-way mock returns, so every assertion in
  // this file still means what it meant. `workspaceForWrite` carries the REFUSAL
  // SENTENCE as well as the workspace — the split run 24 made, because "Create a
  // workspace first." was being said to people who had one.
  workspaceForWrite: async () => {
    const w = await Promise.resolve({ id: WS_ID })
    return w ? { ok: true, workspace: w } : { ok: false, message: 'Create a workspace first.' }
  },
}))

vi.mock('@sahoda/billing', () => ({
  loadBillingEnv: () => {
    if (state.billingEnvMissing) {
      throw new Error('@sahoda/billing: missing required env — SUPABASE_DB_URL')
    }
    return { databaseUrl: 'postgres://test' }
  },
  createPgLedgerPort: () => ({}),
  createWithCredits:
    () => async (config: WithCreditsConfig, callback: (ctx: unknown) => Promise<unknown>) => {
      state.calls.configs.push(config)
      if (state.insufficient) {
        return {
          ok: false,
          error: { code: 'CREDIT_INSUFFICIENT', details: { required: 20, available: 3 } },
        }
      }
      try {
        await callback({ actionType: config.action, creditsCharged: 20 })
        // Lost ack: the DEBIT may have committed but the wrapper reports
        // failure. The error deliberately wears a config-prefixed message: the
        // action's `!delivered` guard must keep the unconfirmed-charge warning
        // in front of it — deleting that guard fails the lost-ack test.
        if (state.lostAck) {
          return {
            ok: false,
            error: {
              code: 'PROVIDER_ERROR',
              message: '@sahoda/billing: missing required env — SUPABASE_DB_URL',
            },
          }
        }
        return { ok: true, data: { balanceAfter: 80 } }
      } catch (thrown) {
        // Real withCredits RELEASES the hold when the callback throws, and its
        // PROVIDER_ERROR carries `messageOf(runErr)` — mirrored here so the
        // config-classification seam sees the same shape it does in prod.
        const message = thrown instanceof Error ? thrown.message : String(thrown)
        return { ok: false, error: { code: 'PROVIDER_ERROR', message } }
      }
    },
}))

vi.mock('@sahoda/mesh', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sahoda/mesh')>()
  return {
    ...original,
    createMesh: () => {
      if (state.meshEnvMissing) {
        throw new Error('@sahoda/mesh: missing required env var(s): OPENAI_API_KEY')
      }
      return {
        runTask: (_def: unknown, input: { goals: string; channels: string[] }) => {
          state.calls.meshRuns += 1
          state.calls.meshInput = input
          return Promise.resolve(state.meshResult)
        },
      }
    },
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      insert: (rows: Array<Record<string, unknown>>) => {
        state.calls.insertedRows = rows
        return { select: () => Promise.resolve(state.insertResult) }
      },
    }),
  }),
}))

const { planMyWeek } = await import('./plan-week')

beforeEach(async () => {
  state.meshResult = { ok: true, data: { briefs: FIVE_BRIEFS } }
  state.insertResult = { data: FIVE_IDS, error: null }
  state.insufficient = false
  state.lostAck = false
  state.billingEnvMissing = false
  state.meshEnvMissing = false
  state.calls = { configs: [], insertedRows: null, meshRuns: 0, meshInput: null }
  vi.mocked((await import('next/cache')).revalidatePath).mockClear()
})

describe('planMyWeek', () => {
  test('happy path: 5 drafts land and the charge is reported', async () => {
    const result = await planMyWeek('More footfall on weekends', ['x', 'gbp'])

    expect(result).toEqual({
      ok: true,
      created: 5,
      clamped: 0,
      balanceAfter: 80,
      creditsCharged: 20,
    })
  })

  test('charges loop_cycle with a fresh server-minted objectRef each run', async () => {
    await planMyWeek('', ['x'])
    await planMyWeek('', ['x'])

    const [first, second] = state.calls.configs
    expect(first?.action).toBe('loop_cycle')
    expect(first?.objectRef).toMatch(new RegExp(`^${WS_ID}:plan_week:`))
    expect(first?.objectRef).not.toBe(second?.objectRef)
  })

  test('inserted rows are honest drafts: plan_week origin, draft status, future slots, clamped channels', async () => {
    state.meshResult = {
      ok: true,
      data: {
        briefs: [
          brief(0, { channels: ['linkedin'] }), // not requested → clamps to request
          brief(1, { suggestedSlot: 'garbage' }), // unusable slot → normalized
          brief(2),
          brief(3),
          brief(4),
        ],
      },
    }

    const result = await planMyWeek('', ['x', 'gbp'])

    const rows = state.calls.insertedRows ?? []
    expect(rows).toHaveLength(5)
    for (const row of rows) {
      expect(row.origin).toBe('plan_week')
      expect(row.status).toBe('draft')
      expect(row.workspace_id).toBe(WS_ID)
      expect(row.created_by).toBe('user_abc')
      expect(new Date(row.scheduled_at as string).getTime()).toBeGreaterThan(Date.now())
    }
    expect(rows[0]?.channels).toEqual(['x', 'gbp'])
    expect(result).toMatchObject({ ok: true, clamped: 1 })
  })

  test('mesh failure: nothing inserted, hold released, "not charged" is claimed', async () => {
    state.meshResult = { ok: false, error: { code: 'PROVIDER_ERROR', message: 'provider text' } }

    const result = await planMyWeek('', ['x'])

    expect(state.calls.insertedRows).toBeNull()
    // BOTH discriminants, not just `ok`. Asserting only `ok: false` left
    // `insufficient` free — and an action that answered `insufficient: true` would
    // skip every assertion in the branch below and pass, having checked neither
    // that the customer was told they were not charged nor that provider text
    // stayed out of the message. Those are the two things these tests exist for.
    expect(result).toMatchObject({ ok: false, insufficient: false })
    if (!result.ok && !result.insufficient) {
      expect(result.message).toContain('not charged')
      // Provider text must never surface.
      expect(result.message).not.toContain('provider text')
    }
  })

  test('insert failure: callback threw AFTER the model ran, so "not charged" is still true', async () => {
    state.insertResult = { data: null, error: { code: '42501' } }

    const result = await planMyWeek('', ['x'])

    // BOTH discriminants, not just `ok`. Asserting only `ok: false` left
    // `insufficient` free — and an action that answered `insufficient: true` would
    // skip every assertion in the branch below and pass, having checked neither
    // that the customer was told they were not charged nor that provider text
    // stayed out of the message. Those are the two things these tests exist for.
    expect(result).toMatchObject({ ok: false, insufficient: false })
    if (!result.ok && !result.insufficient) {
      expect(result.message).toContain('not charged')
    }
  })

  test('insufficient credits: exact shortfall, model never runs', async () => {
    state.insufficient = true

    const result = await planMyWeek('', ['x'])

    expect(result).toEqual({ ok: false, insufficient: true, required: 20, available: 3 })
    expect(state.calls.meshRuns).toBe(0)
  })

  test('invalid channels never reach the ledger', async () => {
    const result = await planMyWeek('', [])

    expect(result.ok).toBe(false)
    expect(state.calls.configs).toHaveLength(0)
  })

  test('duplicated channels collapse before the model call — no prompt amplification', async () => {
    await planMyWeek('', ['x', 'x', 'x', 'gbp', 'x'])

    expect(state.calls.meshInput?.channels).toEqual(['x', 'gbp'])
  })

  test('model text is capped before insert — a degenerate 50KB body cannot become a row', async () => {
    state.meshResult = {
      ok: true,
      data: {
        briefs: [
          brief(0, { title: 'T'.repeat(5_000), body: 'B'.repeat(50_000) }),
          ...FIVE_BRIEFS.slice(1),
        ],
      },
    }

    await planMyWeek('', ['x'])

    const first = state.calls.insertedRows?.[0]
    expect((first?.title as string).length).toBeLessThanOrEqual(160)
    expect((first?.body as string).length).toBeLessThanOrEqual(4_000)
  })

  test('lost ack: drafts EXIST, so the page revalidates even though the charge is unconfirmed', async () => {
    state.lostAck = true

    const result = await planMyWeek('', ['x'])

    // The narrowing guard cannot skip silently: this pins the exact arm first.
    expect(result).toMatchObject({ ok: false, insufficient: false })
    if (!result.ok && !result.insufficient) {
      expect(result.message).toMatch(/could not confirm/i)
      // Delivered runs keep the warning even when the failure LOOKS like a
      // config error — the mock's lost-ack message is config-prefixed.
      expect(result.message).not.toMatch(/not fully configured/i)
    }
    // The user must SEE the five drafts under the warning — a stale page invites
    // a retry, and a retry with a fresh objectRef is a second charge.
    const { revalidatePath } = await import('next/cache')
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/planner')
  })

  test('mesh failure does NOT revalidate — nothing changed on disk', async () => {
    state.meshResult = { ok: false, error: { code: 'PROVIDER_ERROR', message: 'x' } }

    await planMyWeek('', ['x'])

    const { revalidatePath } = await import('next/cache')
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled()
  })
})

describe('planMyWeek — deployment config failures', () => {
  // Both tests re-import the action: its billing/mesh singletons are memoized
  // module-level, so the already-imported instance would never re-run the env
  // loaders after the happy-path tests built them.

  test('missing billing env → honest config copy, cause logged server-side', async () => {
    state.billingEnvMissing = true
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.resetModules()
    const fresh = await import('./plan-week')
    const result = await fresh.planMyWeek('', ['x'])

    expect(result).toMatchObject({ ok: false, insufficient: false })
    if (!result.ok && !result.insufficient) {
      expect(result.message).toMatch(/not fully configured/i)
      expect(result.message).toMatch(/not charged/i)
      expect(result.message).not.toMatch(/try again/i)
    }
    expect(errorSpy.mock.calls.map((call) => String(call[0])).join('\n')).toContain(
      'SUPABASE_DB_URL',
    )
    errorSpy.mockRestore()
  })

  test('missing mesh env inside the callback → hold released, honest config copy', async () => {
    state.meshEnvMissing = true
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.resetModules()
    const fresh = await import('./plan-week')
    const result = await fresh.planMyWeek('', ['x'])

    expect(result).toMatchObject({ ok: false, insufficient: false })
    if (!result.ok && !result.insufficient) {
      expect(result.message).toMatch(/not fully configured/i)
      expect(result.message).toMatch(/not charged/i)
    }
    expect(errorSpy.mock.calls.map((call) => String(call[0])).join('\n')).toContain(
      '@sahoda/mesh: missing required env',
    )
    errorSpy.mockRestore()
  })
})
