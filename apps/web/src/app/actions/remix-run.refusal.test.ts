import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * NOTHING SPENDS WITHOUT AN APPROVAL, AND THE PROOF IS THAT NOTHING MOVES.
 *
 * ── WHY THE ASSERTION IS "withCredits WAS NEVER CALLED" ──────────────────────
 * A refusal that returns a message is easy to write and easy to believe. The
 * question that matters is whether the money moved, and the only place that can
 * be answered is at the wrapper: `withCredits` is the ONLY path to a HOLD, so a
 * run in which it was never invoked is a run in which no credit was reserved,
 * charged or released. Every refusal below asserts that emptiness, not the
 * sentence.
 *
 * ── AND WHY THE BATCH IS FORCED, NOT ASKED ──────────────────────────────────
 * The interesting failure is not "a planned batch refuses" — that is the happy
 * path of the guard. It is a batch whose STATUS SAYS IT IS RUNNING while nobody
 * ever approved it, which is the state a bug, a stray write or a second tab can
 * produce. The gate reads `approved_at`, not the status string, so that batch
 * still spends nothing. The Loop's own suite proves its halt the same way.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'
const BATCH_ID = '11111111-1111-4111-8111-111111111111'
const POST_ID = '33333333-3333-4333-8333-333333333333'

interface WithCreditsConfig {
  workspaceId: string
  action: string
  objectRef: string
}

const state = vi.hoisted(() => ({
  batch: null as Record<string, unknown> | null,
  derivatives: [] as Array<Record<string, unknown>>,
  available: 1_000,
  balanceStatus: 'ok' as 'ok' | 'unreadable' | 'no-workspace',
  /** Whether THIS request won the run claim. False models a second tab. */
  claimWon: true,
  sourceBody: 'A long piece about the bakery, with more in it than one caption can hold.',
  calls: {
    configs: [] as WithCreditsConfig[],
    statuses: [] as string[],
  },
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
  readBalance: async () =>
    state.balanceStatus === 'ok'
      ? {
          status: 'ok',
          balance: { total: state.available, held: 0, available: state.available },
        }
      : { status: state.balanceStatus },
}))

vi.mock('@/lib/remix/store', () => ({
  readBatch: async () => state.batch,
  readDerivatives: async () => state.derivatives,
  // The compare-and-swap. `state.claimWon` is what a test sets to be the SECOND
  // tab: the row was already claimed, the UPDATE matched nothing, and this
  // returns false.
  startBatchRun: async () => {
    state.calls.statuses.push('running')
    return state.claimWon
  },
  setBatchStatus: async (_id: string, _ws: string, status: string) => {
    state.calls.statuses.push(status)
  },
  settleDerivative: async () => {},
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { body: state.sourceBody } }) }),
        }),
      }),
    }),
  }),
}))

vi.mock('@sahoda/mesh', () => ({ createMesh: () => ({ runTask: async () => ({ ok: false }) }) }))

vi.mock('@sahoda/billing', () => ({
  loadBillingEnv: () => ({ databaseUrl: 'postgres://test' }),
  createPgLedgerPort: () => ({}),
  createWithCredits:
    () => async (config: WithCreditsConfig, callback: (ctx: unknown) => Promise<unknown>) => {
      // Every invocation is recorded BEFORE anything else, so a refusal that
      // reached the wrapper is visible even if the wrapper then failed.
      state.calls.configs.push(config)
      try {
        const data = await callback({ actionType: config.action, creditsCharged: 1 })
        return { ok: true, data: { ...(data as object), balanceAfter: 0 } }
      } catch {
        return { ok: false, error: { code: 'PROVIDER_ERROR' } }
      }
    },
}))

import { runRemixBatch } from './remix-run'
import { previewBatch } from '@/lib/remix/cost'

function derivative(kind: string, channel: string, id: string): Record<string, unknown> {
  return {
    id,
    workspace_id: WS_ID,
    batch_id: BATCH_ID,
    kind,
    channel,
    format: 'text',
    included: true,
    status: 'pending',
    post_id: null,
    failure: null,
    created_at: '2026-08-21T00:00:00Z',
    updated_at: '2026-08-21T00:00:00Z',
  }
}

const DERIVATIVES = [derivative('short', 'x', 'd1'), derivative('short', 'linkedin', 'd2')]

function batch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: BATCH_ID,
    workspace_id: WS_ID,
    source_post_id: POST_ID,
    source_title: 'The long one',
    source_credit: 'Remixed from “The long one” in this workspace.',
    status: 'planned',
    approved_credits: null,
    approved_at: null,
    approved_by: null,
    created_by: 'user_abc',
    created_at: '2026-08-21T00:00:00Z',
    updated_at: '2026-08-21T00:00:00Z',
    ...overrides,
  }
}

/** What an approval of this exact batch would have recorded. */
function approvedTotal(): number {
  return previewBatch(DERIVATIVES as never).totalCredits
}

beforeEach(() => {
  state.claimWon = true
  state.batch = batch()
  state.derivatives = DERIVATIVES
  state.available = 1_000
  state.balanceStatus = 'ok'
  state.calls.configs = []
  state.calls.statuses = []
})

describe('the halt', () => {
  test('a batch nobody approved spends nothing', async () => {
    const result = await runRemixBatch(BATCH_ID)

    expect(result).toEqual({
      ok: false,
      insufficient: false,
      message: expect.stringMatching(/approve the cost first/i),
    })
    // THE PROOF. Not the sentence — the ledger.
    expect(state.calls.configs).toEqual([])
    expect(state.calls.statuses).toEqual([])
  })

  test('a batch FORCED to running with no approval still spends nothing', async () => {
    // The state a stray write or a second tab can produce. The gate reads
    // `approved_at`, not the status string, so the forcing buys nothing.
    state.batch = batch({ status: 'running' })

    const result = await runRemixBatch(BATCH_ID)

    // The MESSAGE is asserted, not merely the refusal. Two guards stand here —
    // the approval gate and the price re-check — and a batch with no approval
    // also has no approved total, so the second one refuses it too. Pinning only
    // `ok: false` would pass with the approval gate deleted, which is exactly how
    // a guard that shares its subject's blind spot goes unnoticed. MEASURED:
    // swapping the gate for `status === 'planned'` fails this line, and nothing
    // else in the file noticed.
    expect(result).toEqual({
      ok: false,
      insufficient: false,
      message: expect.stringMatching(/approve the cost first/i),
    })
    expect(state.calls.configs).toEqual([])
  })

  test('a status of approved with no timestamp is not an approval', async () => {
    // The CHECK constraint forbids this row, and the guard does not rely on the
    // CHECK: a database that had never had it would still refuse here.
    state.batch = batch({ status: 'approved', approved_credits: null, approved_at: null })

    const result = await runRemixBatch(BATCH_ID)

    // Same discrimination as above: it must be refused BY THE GATE.
    expect(result).toEqual({
      ok: false,
      insufficient: false,
      message: expect.stringMatching(/approve the cost first/i),
    })
    expect(state.calls.configs).toEqual([])
  })

  test('an approval at a different total is refused rather than charged', async () => {
    state.batch = batch({
      status: 'approved',
      approved_at: '2026-08-21T00:01:00Z',
      approved_credits: approvedTotal() + 1,
    })

    const result = await runRemixBatch(BATCH_ID)

    expect(result).toEqual({
      ok: false,
      insufficient: false,
      message: expect.stringMatching(/price has changed/i),
    })
    expect(state.calls.configs).toEqual([])
  })

  test('a batch already made is not charged a second time', async () => {
    state.batch = batch({
      status: 'done',
      approved_at: '2026-08-21T00:01:00Z',
      approved_credits: approvedTotal(),
    })

    const result = await runRemixBatch(BATCH_ID)

    expect(result).toMatchObject({ ok: false })
    expect(state.calls.configs).toEqual([])
  })

  test('a batch with everything trimmed out is refused', async () => {
    state.batch = batch({
      status: 'approved',
      approved_at: '2026-08-21T00:01:00Z',
      approved_credits: approvedTotal(),
    })
    state.derivatives = DERIVATIVES.map((d) => ({ ...d, included: false }))

    const result = await runRemixBatch(BATCH_ID)

    expect(result).toMatchObject({ ok: false, insufficient: false })
    expect(state.calls.configs).toEqual([])
  })
})

describe('an empty wallet, before the first charge', () => {
  beforeEach(() => {
    state.batch = batch({
      status: 'approved',
      approved_at: '2026-08-21T00:01:00Z',
      approved_credits: approvedTotal(),
    })
  })

  test('refuses with BOTH numbers, and takes no hold at all', async () => {
    state.available = 0

    const result = await runRemixBatch(BATCH_ID)

    expect(result).toEqual({
      ok: false,
      insufficient: true,
      required: approvedTotal(),
      available: 0,
    })
    // "Before spending any of it" means before charge ONE, not on charge four
    // with three already spent.
    expect(state.calls.configs).toEqual([])
  })

  test('one credit short is still short — the check is the WHOLE total', async () => {
    state.available = approvedTotal() - 1

    const result = await runRemixBatch(BATCH_ID)

    expect(result).toMatchObject({ ok: false, insufficient: true })
    expect(state.calls.configs).toEqual([])
  })

  test('a balance that cannot be read starts nothing', async () => {
    // Distinct from an empty wallet, and it must not be reported as one: "you
    // have 0 credits" to somebody with a full wallet is a false diagnosis.
    state.balanceStatus = 'unreadable'

    const result = await runRemixBatch(BATCH_ID)

    expect(result).toMatchObject({ ok: false, insufficient: false })
    expect(result).not.toMatchObject({ insufficient: true })
    expect(state.calls.configs).toEqual([])
  })
})

describe('an approved, affordable batch does spend', () => {
  test('the charges are exactly the ones the preview quoted', async () => {
    state.batch = batch({
      status: 'approved',
      approved_at: '2026-08-21T00:01:00Z',
      approved_credits: approvedTotal(),
    })

    await runRemixBatch(BATCH_ID)

    // The positive control. Without it every assertion above would pass on a
    // function that refuses everything — which is the way a refusal test lies.
    const actions = state.calls.configs.map((c) => c.action)
    expect(actions).toEqual(['remix_pack', 'caption_rewrite'])
    // Each ref is fresh and namespaced, so a re-run cannot replay a spent hold.
    for (const config of state.calls.configs) {
      expect(config.objectRef.startsWith('remix:')).toBe(true)
      expect(config.workspaceId).toBe(WS_ID)
    }
    expect(new Set(state.calls.configs.map((c) => c.objectRef)).size).toBe(2)
  })

  test('a second tab that loses the run claim charges nothing', async () => {
    // ── THE READ-THEN-WRITE GAP, AND WHY THE OLD CODE PAID TWICE ────────────
    // The gate above reads `batch.status` and refuses `running`. Two tabs both
    // passed that read before either wrote, and `setBatchStatus` carried no
    // status predicate and returned void — so both went on to spend. The batch
    // was charged twice for one set of drafts, and `withCredits` could not stop
    // it because `object-ref.ts` mints a fresh uuid per run, so exactly-once
    // never matched.
    //
    // `startBatchRun` is now a compare-and-swap. This is the tab that lost it.
    // APPROVED, so the run gets past the cost gate and actually reaches the
    // claim. The default fixture is `planned` with no approval, which refuses
    // three checks earlier — this test passed against the unguarded code until
    // that was noticed, which is the whole reason the mutation is run.
    state.batch = batch({
      status: 'approved',
      approved_at: '2026-08-21T01:00:00Z',
      approved_credits: approvedTotal(),
    })
    state.claimWon = false

    const result = await runRemixBatch(BATCH_ID)

    expect(result.ok).toBe(false)
    // The assertion this file exists for: no hold, no debit, no release.
    expect(state.calls.configs).toHaveLength(0)
  })
})
