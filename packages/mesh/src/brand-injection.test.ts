import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import type { MeshContext, MeshTaskDef } from '@sahoda/shared'
import { createMeshRunner, type MeshTaskSpec } from './engine'
import type { BrandContextProvider } from './brand-context'
import type { ChatMessage, ChatRequest, ChatResponse, Provider } from './providers/types'

const OutSchema = z.object({ ok: z.boolean() })
type Out = z.infer<typeof OutSchema>
interface In {
  x: number
}

const def: MeshTaskDef<In, Out> = {
  name: 'test_task',
  tier: 'economy',
  inputSchema: z.object({ x: z.number() }),
  outputSchema: OutSchema,
  maxTokens: 64,
  cachePrefix: 'brand_context',
}

function capturingProvider(): { provider: Provider; seen: ChatRequest[] } {
  const seen: ChatRequest[] = []
  const provider: Provider = {
    name: 'cap',
    async chat(req: ChatRequest): Promise<ChatResponse> {
      seen.push(req)
      return {
        text: '{"ok":true}',
        usage: { provider: 'cap', model: 'm', tokensIn: 1, tokensOut: 1, cachedTokens: 0 },
      }
    },
  }
  return { provider, seen }
}

const brandMsg: ChatMessage = { role: 'system', content: 'BRAND BRAIN block', cache: true }
const spec: MeshTaskSpec<In, Out> = {
  def,
  buildMessages: (input, _ctx, brand) => [
    { role: 'system', content: 'sys' },
    ...(brand ? [brand] : []),
    { role: 'user', content: JSON.stringify(input) },
  ],
}
const ctx: MeshContext = { workspaceId: 'ws', traceId: 't' }

function runnerWith(brandContext: BrandContextProvider | undefined, provider: Provider) {
  return createMeshRunner({
    planAttempts: () => [{ provider, model: 'm' }],
    logSink: { write: async () => {} },
    now: () => 0,
    price: () => 0,
    brandContext,
  })
}

describe('engine brand-context injection', () => {
  it('injects the cache-controlled brand prefix for a cachePrefix task', async () => {
    const brandContext: BrandContextProvider = {
      get: async () => ({ version: 1, message: brandMsg }),
    }
    const { provider, seen } = capturingProvider()
    const r = await runnerWith(brandContext, provider).run(spec, { x: 1 }, ctx)
    expect(r.ok).toBe(true)
    expect(
      seen[0]!.messages.some((m) => m.cache === true && m.content.includes('BRAND BRAIN')),
    ).toBe(true)
  })

  it('proceeds brand-less when the brand fetch throws (best-effort)', async () => {
    const failing: BrandContextProvider = {
      get: async () => {
        throw new Error('down')
      },
    }
    const { provider, seen } = capturingProvider()
    const r = await runnerWith(failing, provider).run(spec, { x: 1 }, ctx)
    expect(r.ok).toBe(true)
    expect(seen[0]!.messages.some((m) => m.cache === true)).toBe(false)
  })

  it('does not fetch brand for tasks without cachePrefix', async () => {
    let called = false
    const brand: BrandContextProvider = {
      get: async () => {
        called = true
        return null
      },
    }
    const noPrefix: MeshTaskSpec<In, Out> = { ...spec, def: { ...def, cachePrefix: undefined } }
    const { provider } = capturingProvider()
    await runnerWith(brand, provider).run(noPrefix, { x: 1 }, ctx)
    expect(called).toBe(false)
  })
})
