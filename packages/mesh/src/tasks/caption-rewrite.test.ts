import { describe, it, expect } from 'vitest'
import {
  CaptionRewriteInputSchema,
  type CaptionRewriteInput,
  type MeshContext,
} from '@sahoda/shared'
import type { ChatRequest, ChatResponse, Provider } from '../providers/types'
import { createMeshRunner } from '../engine'
import { captionRewriteTask } from './caption-rewrite'

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

describe('captionRewriteTask', () => {
  it('is the economy-tier caption_rewrite task with an explicit token budget', () => {
    expect(captionRewriteTask.def.name).toBe('caption_rewrite')
    expect(captionRewriteTask.def.tier).toBe('economy')
    expect(captionRewriteTask.def.maxTokens).toBeGreaterThan(0)
  })

  it('has no demo-fallback (only brand_guidelines does)', () => {
    expect(captionRewriteTask.fallbackPayload).toBeUndefined()
  })

  it('gives each instruction a distinct directive and puts the caption last', () => {
    const base = { text: 'Come visit our new shop today!' }
    const systems = (['rewrite', 'shorten', 'hookify'] as const).map((instruction) => {
      const input = CaptionRewriteInputSchema.parse({ ...base, instruction })
      const messages = captionRewriteTask.buildMessages(input, ctx)
      expect(messages[0]!.role).toBe('system')
      const last = messages[messages.length - 1]!
      expect(last.role).toBe('user')
      expect(last.content).toContain('new shop')
      return messages[0]!.content
    })
    // the three instructions must not produce identical prompts
    expect(new Set(systems).size).toBe(3)
  })

  it('rewrites the selection when one is supplied', () => {
    const input: CaptionRewriteInput = CaptionRewriteInputSchema.parse({
      text: 'The whole caption here',
      instruction: 'shorten',
      selection: 'whole caption',
    })
    const messages = captionRewriteTask.buildMessages(input, ctx)
    const last = messages[messages.length - 1]!
    expect(last.content).toContain('whole caption')
  })

  it('resolves a valid model response into the rewritten text', async () => {
    const runner = runnerFor(fixedProvider(['{"text":"Visit us today ☕"}']))
    const input = CaptionRewriteInputSchema.parse({ text: 'x', instruction: 'hookify' })

    const result = await runner.run(captionRewriteTask, input, ctx)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.text).toBe('Visit us today ☕')
  })

  it('returns PROVIDER_ERROR on a double JSON failure (no demo-fallback)', async () => {
    const runner = runnerFor(fixedProvider(['nope', 'still nope']))
    const input = CaptionRewriteInputSchema.parse({ text: 'x', instruction: 'rewrite' })

    const result = await runner.run(captionRewriteTask, input, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('PROVIDER_ERROR')
  })
})
