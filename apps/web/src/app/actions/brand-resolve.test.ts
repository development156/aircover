import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `resolveBrand` wiring tests for the deployment-config seam. Unlike the other
 * paid actions it gates the config copy on `meshOutcome === null` (its
 * delivered-marker) rather than a `delivered` boolean — pinned here so the
 * odd-one-out guard cannot drift: a delivered resolve must never be replaced
 * by the config copy, and both env-loader failures must surface it.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'

interface WithCreditsConfig {
  workspaceId: string
  action: string
  objectRef: string
}

const state = vi.hoisted(() => ({
  meshResult: null as
    { ok: true; data: unknown } | { ok: false; error: { message: string } } | null,
  billingEnvMissing: false,
  meshEnvMissing: false,
  /** Callback delivers, then the wrapper reports failure with a config-looking message. */
  lostAck: false,
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: 'user_abc' }),
}))

vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve({ id: WS_ID }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({ rpc: () => Promise.resolve({ data: null, error: null }) }),
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
    () => async (_config: WithCreditsConfig, callback: (ctx: unknown) => Promise<unknown>) => {
      try {
        await callback({ actionType: 'brand_research', creditsCharged: 50 })
        if (state.lostAck) {
          return {
            ok: false,
            error: {
              code: 'PROVIDER_ERROR',
              message: '@sahoda/billing: missing required env — SUPABASE_DB_URL',
            },
          }
        }
        return { ok: true, data: { balanceAfter: 50 } }
      } catch (thrown) {
        // Real withCredits RELEASES the hold and carries `messageOf(runErr)`.
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
      return { runTask: () => Promise.resolve(state.meshResult) }
    },
  }
})

/** The action memoizes billing/mesh singletons — every test gets a fresh module. */
async function loadResolveBrand() {
  vi.resetModules()
  const mod = await import('./brand-resolve')
  return mod.resolveBrand
}

function sparkForm(): FormData {
  const form = new FormData()
  form.set('name', 'Marigold Coffee Roasters')
  return form
}

const BRAIN = { placeholder: 'brain' }

beforeEach(() => {
  state.meshResult = { ok: true, data: BRAIN }
  state.billingEnvMissing = false
  state.meshEnvMissing = false
  state.lostAck = false
})

describe('resolveBrand — deployment config failures', () => {
  test('missing billing env → honest config copy, cause logged server-side', async () => {
    state.billingEnvMissing = true
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const resolveBrand = await loadResolveBrand()
    const result = await resolveBrand(null, sparkForm())

    expect(result).toMatchObject({ ok: false, kind: 'error' })
    if (!result.ok && result.kind === 'error') {
      expect(result.message).toMatch(/not fully configured/i)
      expect(result.message).toMatch(/not charged/i)
    }
    expect(errorSpy.mock.calls.map((call) => String(call[0])).join('\n')).toContain(
      'SUPABASE_DB_URL',
    )
    errorSpy.mockRestore()
  })

  test('missing mesh env inside the callback → hold released, honest config copy', async () => {
    state.meshEnvMissing = true
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const resolveBrand = await loadResolveBrand()
    const result = await resolveBrand(null, sparkForm())

    expect(result).toMatchObject({ ok: false, kind: 'error' })
    if (!result.ok && result.kind === 'error') {
      expect(result.message).toMatch(/not fully configured/i)
      expect(result.message).toMatch(/not charged/i)
    }
    expect(errorSpy.mock.calls.map((call) => String(call[0])).join('\n')).toContain(
      '@sahoda/mesh: missing required env',
    )
    errorSpy.mockRestore()
  })

  test('delivered resolve + config-looking wrapper error → NEVER the config copy', async () => {
    // The model delivered a real brain, then the wrapper failed with a message
    // that LOOKS like a config error (lost-ack shape). `meshOutcome` is no
    // longer null, so the config copy — which claims "nothing ran" — would be
    // a lie. The generic resolve error must win.
    state.lostAck = true
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const resolveBrand = await loadResolveBrand()
    const result = await resolveBrand(null, sparkForm())

    expect(result).toMatchObject({ ok: false, kind: 'error' })
    if (!result.ok && result.kind === 'error') {
      expect(result.message).not.toMatch(/not fully configured/i)
    }
    errorSpy.mockRestore()
  })

  test('happy path still resolves — the config seam adds no false positives', async () => {
    const resolveBrand = await loadResolveBrand()
    const result = await resolveBrand(null, sparkForm())

    expect(result).toMatchObject({ ok: true, kind: 'resolved', balanceAfter: 50 })
    if (result.ok && result.kind === 'resolved') {
      expect(result.brain).toEqual(BRAIN)
    }
  })
})
