import { describe, it, expect } from 'vitest'
import { appError, ok, type PlanWeekOutput, type WithCreditsFn } from '@sahoda/shared'
import { runPlanWeekJob, type PlanWeekJobDeps, type BriefInsert } from './plan-week-job'

const payload = {
  workspaceId: '22222222-2222-4222-8222-222222222222',
  traceId: 'trace-1',
  goals: 'weekend footfall',
  channels: ['x' as const],
}

const brief = (i: number) => ({
  title: `Brief ${i}`,
  body: 'Something to post.',
  channels: ['x' as const],
  suggestedSlot: '2026-07-20T10:00:00.000Z',
})

const output: PlanWeekOutput = { briefs: [1, 2, 3, 4, 5].map(brief) }

interface Harness {
  deps: PlanWeekJobDeps
  charged: { action: string; objectRef: string }[]
  inserted: BriefInsert[][]
  meshRuns: number
}

function harness(over: Partial<PlanWeekJobDeps> = {}): Harness {
  const charged: { action: string; objectRef: string }[] = []
  const inserted: BriefInsert[][] = []
  let meshRuns = 0

  const withCredits: WithCreditsFn = async (opts, fn) => {
    charged.push({ action: opts.action, objectRef: opts.objectRef })
    try {
      return ok({
        data: await fn({ actionType: opts.action, creditsCharged: 20 }),
        balanceAfter: 80,
      })
    } catch (e) {
      // Mirrors the real wrapper: a throw inside the callback RELEASEs the hold.
      return { ok: false, error: appError('PROVIDER_ERROR', String(e), 'trace-1') }
    }
  }

  const deps: PlanWeekJobDeps = {
    withCredits,
    runPlanWeek: async () => {
      meshRuns += 1
      return ok(output)
    },
    insertBriefs: async (_ws, briefs) => {
      inserted.push(briefs)
      return briefs.length
    },
    ...over,
  }

  return {
    deps,
    charged,
    inserted,
    get meshRuns() {
      return meshRuns
    },
  } as Harness
}

describe('runPlanWeekJob', () => {
  it('charges loop_cycle and inserts the five briefs as posts', async () => {
    const h = harness()

    const r = await runPlanWeekJob(payload, h.deps)

    expect(r.ok).toBe(true)
    expect(h.charged).toHaveLength(1)
    expect(h.charged[0]!.action).toBe('loop_cycle')
    expect(h.inserted[0]).toHaveLength(5)
    expect(h.inserted[0]![0]).toMatchObject({ status: 'idea', origin: 'plan_week' })
  })

  it('rejects a bad payload before any credit is reserved', async () => {
    // The mesh runner validates OUTPUT only, so an unvalidated input would reserve
    // credits and burn a paid provider call before failing.
    const h = harness()

    const r = await runPlanWeekJob({ ...payload, channels: [] }, h.deps)

    expect(r.ok).toBe(false)
    expect(h.charged).toHaveLength(0)
    expect(h.meshRuns).toBe(0)
  })

  it('releases the hold when the model call fails', async () => {
    const h = harness({
      runPlanWeek: async () => ({
        ok: false,
        error: appError('PROVIDER_ERROR', 'model down', 'trace-1'),
      }),
    })

    const r = await runPlanWeekJob(payload, h.deps)

    expect(r.ok).toBe(false)
    // Charged is recorded because the HOLD was taken; the wrapper released it on throw.
    expect(h.charged).toHaveLength(1)
    expect(h.inserted).toHaveLength(0)
  })

  it('uses a fresh objectRef per run so a second plan is not a silent replay', async () => {
    // withCredits derives attempt from (action, objectRef). A stable ref would let the
    // second run replay the spent HOLD+DEBIT — no charge, but the paid call still runs.
    const h = harness()

    await runPlanWeekJob(payload, h.deps)
    await runPlanWeekJob(payload, h.deps)

    expect(h.charged[0]!.objectRef).not.toBe(h.charged[1]!.objectRef)
  })

  it('does not insert posts when the model returns nothing usable', async () => {
    const h = harness({
      runPlanWeek: async () => ({
        ok: false,
        error: appError('VALIDATION_ERROR', 'bad shape', 'trace-1'),
      }),
    })

    const r = await runPlanWeekJob(payload, h.deps)

    expect(r.ok).toBe(false)
    expect(h.inserted).toHaveLength(0)
  })
})
