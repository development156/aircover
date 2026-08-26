import { describe, it, expect } from 'vitest'
import type { MeshContext } from '@sahoda/shared'
import type { ChatRequest, ChatResponse, Provider } from '../providers/types'
import { createMeshRunner } from '../engine'
import { contentVariantsTask, ContentVariantsInputSchema } from './content-variants'

const input = ContentVariantsInputSchema.parse({
  body: 'We just restocked the classics shelf — come browse this weekend.',
  channels: ['x', 'gbp'],
})
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

const validOut = JSON.stringify({
  variants: [
    { channel: 'x', body: 'Classics shelf restocked — browse this weekend.' },
    {
      channel: 'gbp',
      body: 'The classics shelf is restocked. Visit us this weekend!',
      extras: { gbpCta: 'LEARN_MORE' },
    },
  ],
})

describe('contentVariantsTask', () => {
  it('is the economy-tier, brand-grounded content_variants task', () => {
    expect(contentVariantsTask.def.name).toBe('content_variants')
    expect(contentVariantsTask.def.tier).toBe('economy')
    expect(contentVariantsTask.def.cachePrefix).toBe('brand_context')
    expect(contentVariantsTask.def.maxTokens).toBeGreaterThan(0)
  })

  it('puts the system contract first, the brand block next, the payload last', () => {
    const brand = { role: 'system' as const, content: 'BRAND', cache: true }
    const messages = contentVariantsTask.buildMessages(input, ctx, brand)
    expect(messages[0]!.role).toBe('system')
    expect(messages[1]).toBe(brand)
    const last = messages[messages.length - 1]!
    expect(last.role).toBe('user')
    expect(last.content).toContain(input.body)
  })

  it('embeds each requested channel limit from the shared Constraint Engine', () => {
    const user = contentVariantsTask.buildMessages(input, ctx).at(-1)!.content
    expect(user).toContain('280') // x max chars
    expect(user).toContain('1500') // gbp max chars
    expect(user).toContain('x')
    expect(user).toContain('gbp')
  })

  it('resolves a valid model response into per-channel variants', async () => {
    const result = await runnerFor(fixedProvider([validOut])).run(contentVariantsTask, input, ctx)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.variants.map((v) => v.channel)).toEqual(['x', 'gbp'])
      expect(result.fallback).toBeUndefined()
    }
  })

  it('returns a typed error on a double JSON failure (no mock-success)', async () => {
    const result = await runnerFor(fixedProvider(['nope', 'still nope'])).run(
      contentVariantsTask,
      input,
      ctx,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('PROVIDER_ERROR')
  })
  it('retrieves library passages against the canonical body only', () => {
    // Not the channel limits: those are our own framing, and words like
    // "hashtags" and "chars" would match passages about nothing the post is for.
    const query = contentVariantsTask.knowledgeQuery?.(input)
    expect(query).toBe(input.body)
    expect(query).not.toContain('hashtags')
  })
})
