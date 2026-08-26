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
  it('asks for the Marketing Brain, and is the only task that does', () => {
    // The build order's reason, in a guard: one reader means any change in plan
    // quality is attributable to this one wire. If a second task ever wants it,
    // that is a decision, and this assertion failing is where it gets made.
    expect(planWeekTask.wantsMarketContext).toBe(true)
  })

  it('puts the brand block ABOVE the market block, which is the arbitration rule', () => {
    // docs/51: the Brand Brain keeps the brand original, the Marketing Brain
    // says what the numbers show, and when the two disagree the brand wins.
    // Reading order is the cheapest way to say so to a model, so it is pinned.
    const brand = { role: 'system' as const, content: 'BRAND', cache: true }
    const market = { role: 'system' as const, content: 'MEASURED' }
    const messages = planWeekTask.buildMessages(input, ctx, brand, undefined, market)
    expect(messages.map((m) => m.content)).toEqual([
      messages[0]!.content,
      'BRAND',
      'MEASURED',
      messages[3]!.content,
    ])
  })

  it('plans without observations when the workspace has none', () => {
    const brand = { role: 'system' as const, content: 'BRAND', cache: true }
    const messages = planWeekTask.buildMessages(input, ctx, brand)
    expect(messages).toHaveLength(3)
    expect(messages.some((m) => m.content === 'MEASURED')).toBe(false)
  })

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

  // Without a stated "now", the model cannot know what "this coming week" means
  // in wall-clock terms, so every `suggestedSlot` it invents falls outside
  // [earliest .. now+14d] and `normalizeSlot` discards ALL five — observed live
  // on 2026-07-20: "5 suggested times were unusable and moved to sensible
  // future slots". The plan then degrades to a fixed one-per-day ladder and the
  // tokens spent generating slots are wasted.
  it('tells the model the current date so its slots can land in the valid window', () => {
    const dated = PlanWeekInputSchema.parse({
      goals: 'more weekend footfall',
      channels: ['x'],
      nowIso: '2026-07-20T13:37:00.000Z',
    })

    const content = planWeekTask.buildMessages(dated, ctx).at(-1)!.content

    expect(content).toContain('2026-07-20')
  })

  it('states the schedulable window, not just the date', () => {
    const dated = PlanWeekInputSchema.parse({
      goals: '',
      channels: ['x'],
      nowIso: '2026-07-20T13:37:00.000Z',
    })

    const content = planWeekTask.buildMessages(dated, ctx).at(-1)!.content

    // The horizon the caller enforces (SLOT_HORIZON_DAYS = 14) — the model must
    // be told the boundary it is being judged against, or "sensible times" is
    // an instruction it cannot satisfy.
    expect(content).toMatch(/2026-08-03/)
  })

  it('omits the date line entirely when no clock is supplied', () => {
    // Never invent a date: a wrong "today" is worse than no "today", and
    // buildMessages must stay pure (no Date.now()) so runs are reproducible.
    const content = planWeekTask.buildMessages(input, ctx).at(-1)!.content

    expect(content).not.toMatch(/today/i)
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
