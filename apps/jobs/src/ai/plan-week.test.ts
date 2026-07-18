import { describe, it, expect } from 'vitest'
import { PlanWeekInputSchema } from '@sahoda/mesh'
import type { Mesh } from '@sahoda/mesh'
import { appError } from '@sahoda/shared'
import type { MeshContext, MeshTaskDef, Result } from '@sahoda/shared'
import { runPlanWeek } from './plan-week'

const input = PlanWeekInputSchema.parse({ goals: 'weekend footfall', channels: ['x'] })
const ctx: MeshContext = { workspaceId: 'w', traceId: 't' }

describe('runPlanWeek', () => {
  it('delegates to the injected mesh using the plan_week def', async () => {
    let seenName = ''
    const stub: Mesh = {
      async runTask<I, O>(def: MeshTaskDef<I, O>, _input: I, c: MeshContext): Promise<Result<O>> {
        seenName = def.name
        return { ok: false, error: appError('VALIDATION_ERROR', 'stub', c.traceId) }
      },
    }
    const r = await runPlanWeek(input, ctx, stub)
    expect(seenName).toBe('plan_week')
    expect(r.ok).toBe(false)
  })
})
