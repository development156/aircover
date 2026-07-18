import { describe, it, expect } from 'vitest'
import type { MeshContext } from '@sahoda/shared'
import type { ChatRequest, ChatResponse, Provider } from '../providers/types'
import { createMeshRunner } from '../engine'
import { planWeekTask, PlanWeekInputSchema } from './plan-week'

const input = PlanWeekInputSchema.parse({ goals: 'more weekend footfall', channels: ['x', 'gbp'] })
const ctx: MeshContext = { workspaceId: '11111111-1111-1111-1111-111111111111', traceId: 't' }

function fixedProvider(script: string[]): Provider {
  let i = 0
  return {
    name: 'fake',
    async chat(_req: ChatRequest): Promise<ChatResponse> {
      return {
        text: script[i++] ?? '',
        usage: { provider: 'fake', model: 'm', tokensIn: 1, tokensOut: 1, cachedTokens: 0 },
      }
    },
  }
}

function runnerFor(provider: Provider) {
  return createMeshRunner({
    planAttempts: () => [{ provider, model: 'm' }],
    logSink: { write: async () => {} },
    now: () => 0,
    price: () => 0,
  })
}

const brief = (i: number) => ({
  title: `t${i}`,
  body: `b${i}`,
  channels: ['x'],
  suggestedSlot: '2026-07-20T09:00:00Z',
})
const briefsJson = (n: number) =>
  JSON.stringify({ briefs: Array.from({ length: n }, (_, i) => brief(i)) })

describe('planWeekTask', () => {
  it('is the standard-tier, brand-grounded plan_week task', () => {
    expect(planWeekTask.def.name).toBe('plan_week')
    expect(planWeekTask.def.tier).toBe('standard')
    expect(planWeekTask.def.cachePrefix).toBe('brand_context')
    expect(planWeekTask.def.maxTokens).toBeGreaterThan(0)
  })

  it('puts the system contract first, the brand block next, the payload last', () => {
    const brand = { role: 'system' as const, content: 'BRAND', cache: true }
    const messages = planWeekTask.buildMessages(input, ctx, brand)
    expect(messages[0]!.role).toBe('system')
    expect(messages[1]).toBe(brand)
    const last = messages.at(-1)!
    expect(last.role).toBe('user')
    expect(last.content).toContain('more weekend footfall')
    expect(last.content).toContain('gbp')
  })

  it('resolves a valid 5-brief response', async () => {
    const result = await runnerFor(fixedProvider([briefsJson(5)])).run(planWeekTask, input, ctx)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.briefs).toHaveLength(5)
  })

  it('repairs a wrong-length response (4 → 5) via the single repair retry', async () => {
    const result = await runnerFor(fixedProvider([briefsJson(4), briefsJson(5)])).run(
      planWeekTask,
      input,
      ctx,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.briefs).toHaveLength(5)
  })

  it('returns a typed error on a double JSON failure (no mock-success)', async () => {
    const result = await runnerFor(fixedProvider(['nope', 'still nope'])).run(
      planWeekTask,
      input,
      ctx,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('PROVIDER_ERROR')
  })
})
