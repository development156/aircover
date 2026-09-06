import { creditCost } from '@sahoda/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE REFINE BUTTON'S MONEY CLAIMS.
 *
 * This action used to run with NO credit hold at all — a real, unbounded
 * provider cost with no revenue attached (see this file's own git history via
 * `studio-prompt.ts`'s prior header). These tests pin the wiring that closed
 * that gap: a HOLD before the model runs, a RELEASE on a thrown failure, and a
 * DEBIT only once a refinement is actually in hand — the same contract
 * `posts-ai.ts`'s `rewriteCaption` proves for `caption_rewrite`.
 */

const auth = vi.fn(async (): Promise<{ userId: string | null }> => ({ userId: 'user_1' }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => auth() }))

const WS = 'ws_1'
const workspaceForWrite = vi.fn(async () => ({ ok: true as const, workspace: { id: WS } }))
vi.mock('@/lib/workspaces', () => ({ workspaceForWrite: () => workspaceForWrite() }))

const runTask = vi.fn()
vi.mock('@sahoda/mesh', () => ({
  createMesh: () => ({ runTask }),
  promptRefineTask: { def: { name: 'studio_prompt_refine' } },
}))

const withCredits = vi.fn()
vi.mock('@sahoda/billing', () => ({
  createWithCredits: () => withCredits,
  createPgLedgerPort: () => ({}),
  loadBillingEnv: () => ({ databaseUrl: 'postgres://unused' }),
}))

const resolveRefineContext = vi.fn(async (_workspaceId: string) => ({
  brainState: 'ok' as const,
  signals: [],
}))
vi.mock('@/lib/studio/prompt-refine', () => ({
  resolveRefineContext: (workspaceId: string) => resolveRefineContext(workspaceId),
  describeRefineContext: () => ({ headline: 'Built from your words alone', body: 'placeholder' }),
}))

vi.mock('@/lib/actions/revalidate-balance', () => ({ revalidateBalance: vi.fn() }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))

const { refineStudioPrompt } = await import('./studio-prompt')

const ACTION = 'studio_prompt_refine'

/** A complete, valid settings object: the shape a real press from the composer sends. */
const SETTINGS = {
  mode: 'on_brand' as const,
  shape: 'square' as const,
  hasReference: false,
  stampEnabled: false,
  stampAnchor: 'bottom-right' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue({ userId: 'user_1' })
  workspaceForWrite.mockResolvedValue({ ok: true as const, workspace: { id: WS } })
  resolveRefineContext.mockResolvedValue({ brainState: 'ok', signals: [] })
  runTask.mockResolvedValue({ ok: true, data: { refined: 'a warmly lit shopfront' } })

  withCredits.mockImplementation(
    async (
      _opts: { workspaceId: string; action: string; objectRef: string },
      cb: (ctx: { actionType: string; creditsCharged: number }) => Promise<unknown>,
    ) => {
      try {
        await cb({ actionType: ACTION, creditsCharged: creditCost(ACTION) })
      } catch {
        return { ok: false as const, error: { code: 'CALLBACK_THREW' } }
      }
      return { ok: true as const, data: { balanceAfter: 99 } }
    },
  )
})

describe('priced like caption_rewrite', () => {
  it('holds and debits exactly the configured price', async () => {
    const out = await refineStudioPrompt({ wanted: 'a shopfront', settings: SETTINGS })

    expect(withCredits).toHaveBeenCalledTimes(1)
    const [opts] = withCredits.mock.calls[0]!
    expect(opts.action).toBe(ACTION)
    expect(opts.workspaceId).toBe(WS)
    expect(out).toMatchObject({ ok: true, creditsCharged: creditCost(ACTION), balanceAfter: 99 })
  })

  /**
   * MUTATION: reuse a stable objectRef (e.g. `${workspaceId}:refine`) instead
   * of minting a fresh one per call, and this goes red: both calls pass the
   * SAME objectRef, which would let a second press replay the first charge.
   */
  it('mints a fresh objectRef on every press', async () => {
    await refineStudioPrompt({ wanted: 'a shopfront', settings: SETTINGS })
    await refineStudioPrompt({ wanted: 'a different shopfront', settings: SETTINGS })

    const [first] = withCredits.mock.calls[0]!
    const [second] = withCredits.mock.calls[1]!
    expect(first.objectRef).not.toBe(second.objectRef)
  })

  /**
   * MUTATION: drop the `throw new Error('MESH_ERROR')` in the callback (just
   * `return` on a mesh failure instead) and this goes red: `withCredits`
   * would then DEBIT for a call that produced no refinement.
   */
  it('never charges when the model call fails', async () => {
    runTask.mockResolvedValue({ ok: false, error: { code: 'PROVIDER_ERROR' } })
    withCredits.mockImplementation(
      async (
        _opts: unknown,
        cb: (ctx: { actionType: string; creditsCharged: number }) => Promise<unknown>,
      ) => {
        try {
          await cb({ actionType: ACTION, creditsCharged: creditCost(ACTION) })
        } catch {
          return { ok: false as const, error: { code: 'CALLBACK_THREW' } }
        }
        return { ok: true as const, data: { balanceAfter: 99 } }
      },
    )

    const out = await refineStudioPrompt({ wanted: 'a shopfront', settings: SETTINGS })

    expect(out.ok).toBe(false)
    if (!out.ok && !out.insufficient) {
      expect(out.message).toMatch(/not charged/i)
    }
  })

  /** The exact shortfall, both numbers, never a generic refusal. */
  it('states both numbers on an insufficient balance', async () => {
    withCredits.mockResolvedValue({
      ok: false,
      error: { code: 'CREDIT_INSUFFICIENT', details: { required: 1, available: 0 } },
    })

    const out = await refineStudioPrompt({ wanted: 'a shopfront', settings: SETTINGS })

    expect(out).toMatchObject({ ok: false, insufficient: true, required: 1, available: 0 })
  })

  it('never spends when nobody is signed in', async () => {
    auth.mockResolvedValue({ userId: null })

    const out = await refineStudioPrompt({ wanted: 'a shopfront', settings: SETTINGS })

    expect(out.ok).toBe(false)
    expect(withCredits).not.toHaveBeenCalled()
  })
})

describe('composing for the settings', () => {
  /**
   * MUTATION: drop `settings: parsed.data.settings` from the `runTask` call
   * in `studio-prompt.ts` (pass only `wanted` and `signals`) and this goes
   * red — the task would then never see the corner, the shape, the mode or
   * the exclusion the screen actually holds.
   */
  it('passes the settings straight through to the mesh task, unchanged', async () => {
    const settings = {
      mode: 'match' as const,
      shape: 'tall' as const,
      hasReference: true,
      stampEnabled: true,
      stampAnchor: 'top-left' as const,
      excludeText: 'birds',
      referenceFollow: 'close' as const,
    }

    await refineStudioPrompt({ wanted: 'a shopfront', settings })

    expect(runTask).toHaveBeenCalledTimes(1)
    const [, taskInput] = runTask.mock.calls[0]!
    expect(taskInput.settings).toEqual(settings)
  })

  it('never spends on a request with no settings at all', async () => {
    const out = await refineStudioPrompt({ wanted: 'a shopfront' })

    expect(out.ok).toBe(false)
    expect(withCredits).not.toHaveBeenCalled()
  })
})
