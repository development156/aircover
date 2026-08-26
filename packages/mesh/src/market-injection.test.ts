import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import type { MeshContext, MeshTaskDef } from '@sahoda/shared'
import { createMeshRunner, type MeshTaskSpec } from './engine'
import type { MarketContextProvider } from './market-context'
import type { ChatMessage, ChatRequest, ChatResponse, Provider } from './providers/types'

/**
 * THE SEAM, not the observations. `market-context.test.ts` proves the rows are
 * the right workspace's and correctly fenced; this proves they reach the
 * provider, that a task which did not ask for them does not pay for a read, and
 * that an outage in the Marketing Brain cannot fail a paid action.
 *
 * Modelled on `knowledge-injection.test.ts` deliberately: three grounding blocks
 * with three lifetimes now share one seam, and the day one of them stops being
 * best-effort is the day somebody is charged a credit for our database being
 * down.
 */

const OutSchema = z.object({ ok: z.boolean() })
type Out = z.infer<typeof OutSchema>
interface In {
  body: string
}

const def: MeshTaskDef<In, Out> = {
  name: 'test_task',
  tier: 'economy',
  inputSchema: z.object({ body: z.string() }),
  outputSchema: OutSchema,
  maxTokens: 64,
}

function capturingProvider(): { provider: Provider; seen: ChatRequest[] } {
  const seen: ChatRequest[] = []
  return {
    seen,
    provider: {
      name: 'cap',
      async chat(req: ChatRequest): Promise<ChatResponse> {
        seen.push(req)
        return {
          text: '{"ok":true}',
          usage: { provider: 'cap', model: 'm', tokensIn: 1, tokensOut: 1, cachedTokens: 0 },
        }
      },
    },
  }
}

const marketMsg: ChatMessage = { role: 'system', content: 'WHAT SAHODA HAS MEASURED block' }

const grounded: MeshTaskSpec<In, Out> = {
  def,
  buildMessages: (input, _ctx, brand, _knowledge, market) => [
    { role: 'system', content: 'sys' },
    ...(brand ? [brand] : []),
    ...(market ? [market] : []),
    { role: 'user', content: input.body },
  ],
  wantsMarketContext: true,
}

const ungrounded: MeshTaskSpec<In, Out> = {
  def,
  buildMessages: (input) => [{ role: 'user', content: input.body }],
}

const ctx: MeshContext = { workspaceId: 'ws', traceId: 't' }

function runnerWith(marketContext: MarketContextProvider | undefined, provider: Provider) {
  return createMeshRunner({
    planAttempts: () => [{ provider, model: 'm' }],
    logSink: { write: async () => {} },
    now: () => 0,
    price: () => 0,
    marketContext,
  })
}

describe('engine market injection', () => {
  it('puts the observations in front of the provider', async () => {
    const { provider, seen } = capturingProvider()
    const r = await runnerWith({ get: async () => marketMsg }, provider).run(
      grounded,
      { body: 'plan my week' },
      ctx,
    )

    expect(r.ok).toBe(true)
    expect(seen[0]!.messages.some((m) => m.content.includes('WHAT SAHODA HAS MEASURED'))).toBe(true)
  })

  it('reads for the caller’s workspace and asks for nothing else', async () => {
    const asked: string[] = []
    const { provider } = capturingProvider()
    await runnerWith(
      {
        get: async (workspaceId) => {
          asked.push(workspaceId)
          return null
        },
      },
      provider,
    ).run(grounded, { body: 'x' }, ctx)

    expect(asked).toEqual(['ws'])
  })

  it('sends nothing extra when nothing has been noticed', async () => {
    const { provider, seen } = capturingProvider()
    await runnerWith({ get: async () => null }, provider).run(grounded, { body: 'x' }, ctx)

    expect(seen[0]!.messages.some((m) => m.content.includes('MEASURED'))).toBe(false)
    expect(seen[0]!.messages).toHaveLength(2)
  })

  it('still produces the plan when the observation read throws', async () => {
    // Grounding is best-effort. An outage here that failed a paid action would
    // charge somebody a credit for our own database being down.
    const failing: MarketContextProvider = {
      get: async () => {
        throw new Error('down')
      },
    }
    const { provider, seen } = capturingProvider()
    const r = await runnerWith(failing, provider).run(grounded, { body: 'x' }, ctx)

    expect(r.ok).toBe(true)
    expect(seen[0]!.messages.some((m) => m.content.includes('MEASURED'))).toBe(false)
  })

  it('does not read for a task that did not declare it', async () => {
    // Every writing task could plausibly want this and only one asks. A read a
    // task never requested is a database call on every one of its calls, and the
    // build order's whole point is that ONE task reads it so the effect is
    // attributable.
    let called = false
    const spy: MarketContextProvider = {
      get: async () => {
        called = true
        return marketMsg
      },
    }
    const { provider } = capturingProvider()
    await runnerWith(spy, provider).run(ungrounded, { body: 'x' }, ctx)

    expect(called).toBe(false)
  })
})
