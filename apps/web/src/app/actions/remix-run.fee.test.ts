import { beforeEach, describe, expect, test, vi } from 'vitest'
import { creditCost } from '@sahoda/shared'

import { RemixReadError } from '@/lib/remix/read-error'

/**
 * THE BATCH FEE STANDS ONLY WHEN THE RUN MADE SOMETHING.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * `remix_pack` was charged through `withCredits` with a callback of
 * `async () => ({ started: true })`, before any model call. That callback cannot
 * throw, so its HOLD always became a DEBIT. Every kind after it released its own
 * hold when the model failed, and nothing released the fee: a run in which
 * every derivative failed produced zero drafts and cost fifteen credits.
 *
 * ── WHAT IS ASSERTED, AND WHERE ──────────────────────────────────────────────
 * The ledger, not the sentence. The `@sahoda/billing` mock below is a small
 * ledger: one HOLD per `withCredits` call, then a DEBIT when the callback
 * returns and a RELEASE when it throws. Each test reads the rows and asks
 * whether a DEBIT for `remix_pack` exists, which is the only question that
 * decides whether the customer paid.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'
const BATCH_ID = '11111111-1111-4111-8111-111111111111'
const POST_ID = '33333333-3333-4333-8333-333333333333'
const NEW_POST_ID = '55555555-5555-4555-8555-555555555555'

interface Entry {
  type: 'HOLD' | 'DEBIT' | 'RELEASE'
  action: string
  objectRef: string
}

const state = vi.hoisted(() => ({
  /** Which rewrite instructions the model fails. `shorten` is `short`, `hookify` is `hook`. */
  failing: new Set<string>(),
  /** An action whose HOLD the ledger refuses outright. */
  holdRefused: null as string | null,
  /** The database refuses to read the derivatives. */
  derivativesUnreadable: false,
  ledger: [] as Entry[],
  modelCalls: [] as string[],
  settled: [] as Array<{ id: string; status: string }>,
  statuses: [] as string[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: 'user_abc' }),
}))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: async () => ({ ok: true, workspace: { id: WS_ID } }),
}))
vi.mock('@/lib/actions/revalidate-balance', () => ({ revalidateBalance: vi.fn() }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/actions/paid-failure', () => ({
  reportPaidActionFailure: vi.fn(),
  isDeploymentConfigCause: () => false,
  DEPLOYMENT_CONFIG_MESSAGE: 'not configured',
}))
vi.mock('@/lib/wallet/read', () => ({
  readBalance: async () => ({
    status: 'ok',
    balance: { total: 1_000, held: 0, available: 1_000 },
  }),
}))

vi.mock('@/lib/remix/store', () => ({
  readBatch: async () => ({
    id: BATCH_ID,
    workspace_id: WS_ID,
    source_post_id: POST_ID,
    source_title: 'The long one',
    source_credit: null,
    status: 'approved',
    approved_credits: creditCost('remix_pack') + creditCost('caption_rewrite') * 2,
    approved_at: '2026-08-21T00:01:00Z',
    approved_by: 'user_abc',
    created_by: 'user_abc',
    created_at: '2026-08-21T00:00:00Z',
    updated_at: '2026-08-21T00:00:00Z',
  }),
  readDerivatives: async () => {
    if (state.derivativesUnreadable) throw new RemixReadError('remix_derivatives')
    return DERIVATIVES
  },
  startBatchRun: async () => true,
  setBatchStatus: async (_id: string, _ws: string, status: string) => {
    state.statuses.push(status)
  },
  markWritten: async (id: string) => {
    state.settled.push({ id, status: 'written' })
  },
  markFailed: async (id: string) => {
    state.settled.push({ id, status: 'failed' })
  },
  markSkipped: async (id: string) => {
    state.settled.push({ id, status: 'skipped' })
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                body: 'A long piece about the bakery, with more in it than one caption can hold.',
              },
            }),
          }),
        }),
      }),
      insert: () =>
        table === 'posts'
          ? { select: () => ({ single: async () => ({ data: { id: NEW_POST_ID }, error: null }) }) }
          : Promise.resolve({ error: null }),
    }),
  }),
}))

vi.mock('@sahoda/mesh', () => ({
  captionRewriteTask: { def: { name: 'caption_rewrite' } },
  contentVariantsTask: { def: { name: 'content_variants' } },
  createMesh: () => ({
    runTask: async (def: { name: string }, input: { instruction?: string }) => {
      const instruction = input.instruction ?? def.name
      state.modelCalls.push(instruction)
      if (state.failing.has(instruction)) return { ok: false, error: { code: 'MESH_ERROR' } }
      return { ok: true, data: { text: `The bakery piece, ${instruction} style.` } }
    },
  }),
}))

vi.mock('@sahoda/billing', () => ({
  loadBillingEnv: () => ({ databaseUrl: 'postgres://test' }),
  createPgLedgerPort: () => ({}),
  createWithCredits:
    () =>
    async (
      config: { workspaceId: string; action: string; objectRef: string },
      callback: (ctx: unknown) => Promise<unknown>,
    ) => {
      if (state.holdRefused === config.action) {
        return { ok: false, error: { code: 'PROVIDER_ERROR' } }
      }
      state.ledger.push({ type: 'HOLD', action: config.action, objectRef: config.objectRef })
      try {
        const data = await callback({
          actionType: config.action,
          creditsCharged: creditCost(config.action as never),
        })
        state.ledger.push({ type: 'DEBIT', action: config.action, objectRef: config.objectRef })
        return { ok: true, data: { ...(data as object), balanceAfter: 0 } }
      } catch {
        state.ledger.push({ type: 'RELEASE', action: config.action, objectRef: config.objectRef })
        return { ok: false, error: { code: 'PROVIDER_ERROR' } }
      }
    },
}))

import { runRemixBatch } from './remix-run'

function derivative(kind: string, id: string) {
  return {
    id,
    workspace_id: WS_ID,
    batch_id: BATCH_ID,
    kind,
    channel: 'x',
    format: 'text',
    included: true,
    status: 'pending',
    post_id: null,
    failure: null,
    created_at: '2026-08-21T00:00:00Z',
    updated_at: '2026-08-21T00:00:00Z',
  }
}

const DERIVATIVES = [derivative('short', 'd-short'), derivative('hook', 'd-hook')]

const rows = (type: Entry['type'], action: string) =>
  state.ledger.filter((e) => e.type === type && e.action === action)

beforeEach(() => {
  state.failing = new Set()
  state.holdRefused = null
  state.derivativesUnreadable = false
  state.ledger = []
  state.modelCalls = []
  state.settled = []
  state.statuses = []
})

describe('a run in which every kind fails', () => {
  beforeEach(() => {
    state.failing = new Set(['shorten', 'hookify'])
  })

  test('costs nothing: the fee is released, not debited', async () => {
    const result = await runRemixBatch(BATCH_ID)

    expect(result).toEqual({ ok: true, drafts: 0, failedKinds: 2, spent: 0 })
    // THE PROOF. No DEBIT row for the pack, and the hold it took went back.
    expect(rows('DEBIT', 'remix_pack')).toHaveLength(0)
    expect(rows('RELEASE', 'remix_pack')).toHaveLength(1)
    expect(rows('DEBIT', 'caption_rewrite')).toHaveLength(0)
    expect(rows('RELEASE', 'caption_rewrite')).toHaveLength(2)
    expect(state.statuses).toEqual(['failed'])
  })

  test('still asked the model for every kind, so the failures are real ones', async () => {
    // Without this a fee-first refusal that never called the model would pass
    // the test above for the wrong reason.
    await runRemixBatch(BATCH_ID)
    expect(state.modelCalls).toEqual(['shorten', 'hookify'])
    expect(state.settled.map((s) => s.status)).toEqual(['failed', 'failed'])
  })
})

describe('a run in which one kind is made', () => {
  beforeEach(() => {
    state.failing = new Set(['hookify'])
  })

  test('keeps the fee and charges only the kind that was written', async () => {
    const result = await runRemixBatch(BATCH_ID)

    expect(result).toEqual({
      ok: true,
      drafts: 1,
      failedKinds: 1,
      spent: creditCost('remix_pack') + creditCost('caption_rewrite'),
    })
    expect(rows('DEBIT', 'remix_pack')).toHaveLength(1)
    expect(rows('RELEASE', 'remix_pack')).toHaveLength(0)
    expect(rows('DEBIT', 'caption_rewrite')).toHaveLength(1)
    expect(rows('RELEASE', 'caption_rewrite')).toHaveLength(1)
    expect(state.statuses).toEqual(['done'])
  })
})

describe('a run in which everything is made', () => {
  test('spends exactly the approved total, and the fee is held before the first kind', async () => {
    const result = await runRemixBatch(BATCH_ID)

    expect(result).toEqual({
      ok: true,
      drafts: 2,
      failedKinds: 0,
      spent: creditCost('remix_pack') + creditCost('caption_rewrite') * 2,
    })
    // The fee still buys the run: its HOLD is the first row, so a wallet that
    // empties mid-batch has paid for the run it got and not for a kind it did
    // not.
    expect(state.ledger[0]).toMatchObject({ type: 'HOLD', action: 'remix_pack' })
    // And it settles LAST, after every kind has answered, which is what makes
    // "at least one draft" a thing the fee's own callback can know.
    expect(state.ledger.at(-1)).toMatchObject({ type: 'DEBIT', action: 'remix_pack' })
    expect(state.ledger.filter((e) => e.type === 'RELEASE')).toHaveLength(0)
  })
})

describe('a fee that cannot be held', () => {
  test('asks the model for nothing and charges nothing', async () => {
    // The fee buys the run. If the ledger will not reserve it, there is no run
    // to make kinds inside of, and the customer is told so at the top.
    state.holdRefused = 'remix_pack'

    const result = await runRemixBatch(BATCH_ID)

    expect(result).toEqual({ ok: true, drafts: 0, failedKinds: 0, spent: 0 })
    expect(state.modelCalls).toEqual([])
    expect(state.ledger).toEqual([])
  })
})

describe('a batch whose drafts cannot be read', () => {
  test('is refused as a READ failure, before anything is held', async () => {
    // Not "everything is trimmed out" and not "not here any more": both are
    // claims about the batch, and the database declined to make either.
    state.derivativesUnreadable = true

    const result = await runRemixBatch(BATCH_ID)

    expect(result).toEqual({
      ok: false,
      insufficient: false,
      message: expect.stringMatching(/could not read this batch/i),
    })
    expect(result).toMatchObject({
      message: expect.stringMatching(/nothing was started or charged/i),
    })
    expect(state.ledger).toEqual([])
    expect(state.modelCalls).toEqual([])
  })
})
