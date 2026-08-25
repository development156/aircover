import { describe, it, expect } from 'vitest'
import {
  CaptionRewriteInputSchema,
  DEMO_FALLBACK_PAYLOAD,
  type BrandMemoryPayload,
  type CaptionRewriteInput,
  type MeshContext,
} from '@sahoda/shared'
import type { ChatRequest, ChatResponse, Provider } from '../providers/types'
import { createMeshRunner } from '../engine'
import { buildBrandMessage, type BrandContextProvider } from '../brand-context'
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

// ── Brand grounding ───────────────────────────────────────────────────────────
// Verified BY OUTCOME, not by asserting `def.cachePrefix === 'brand_context'`.
// That assertion passes even when buildMessages drops its third parameter and
// throws the fetched brain away — which is exactly the defect this task had. The
// only thing that proves grounding is what the provider was actually sent.

function capturingProvider(): { provider: Provider; seen: ChatRequest[] } {
  const seen: ChatRequest[] = []
  return {
    seen,
    provider: {
      name: 'cap',
      async chat(req: ChatRequest): Promise<ChatResponse> {
        seen.push(req)
        return {
          text: '{"text":"grounded"}',
          usage: { provider: 'cap', model: 'm', tokensIn: 1, tokensOut: 1, cachedTokens: 0 },
        }
      },
    },
  }
}

/** A brain with a voice and a red line that a generic rewrite would not know. */
const BRAIN: BrandMemoryPayload = {
  ...DEMO_FALLBACK_PAYLOAD,
  voice: {
    ...DEMO_FALLBACK_PAYLOAD.voice,
    descriptor: 'Dry, understated, allergic to exclamation marks',
    banned_phrases: ['revolutionary', 'game-changer'],
  },
}

function runnerWithBrand(provider: Provider, payload: BrandMemoryPayload | null) {
  const brandContext: BrandContextProvider = {
    get: async () => (payload ? { version: 7, message: buildBrandMessage(payload) } : null),
  }
  return createMeshRunner({
    planAttempts: () => [{ provider, model: 'm' }],
    logSink: { write: async () => {} },
    now: () => 0,
    price: () => 0,
    brandContext,
  })
}

describe('captionRewriteTask brand grounding', () => {
  const input = CaptionRewriteInputSchema.parse({
    text: 'Our revolutionary new blend!',
    instruction: 'rewrite',
  })

  it('sends the voice descriptor and the banned phrases to the provider', async () => {
    const { provider, seen } = capturingProvider()

    const result = await runnerWithBrand(provider, BRAIN).run(captionRewriteTask, input, ctx)

    expect(result.ok).toBe(true)
    const sent = seen[0]!.messages
    const brandBlock = sent.find((m) => m.content.includes('BRAND BRAIN'))
    expect(brandBlock).toBeDefined()
    expect(brandBlock!.content).toContain('Dry, understated, allergic to exclamation marks')
    expect(brandBlock!.content).toContain('Never use: revolutionary, game-changer')
    // Red lines are the load-bearing half (doc 18 §1) — they must ride along too.
    expect(brandBlock!.content).toContain('No competitor bashing')
  })

  it('marks the brand block cacheable and orders it system → brand → caption', async () => {
    const { provider, seen } = capturingProvider()

    await runnerWithBrand(provider, BRAIN).run(captionRewriteTask, input, ctx)

    const sent = seen[0]!.messages
    const brandIndex = sent.findIndex((m) => m.content.includes('BRAND BRAIN'))
    expect(sent[0]!.content).toContain('You edit social captions')
    expect(brandIndex).toBe(1)
    expect(sent[brandIndex]!.cache).toBe(true)
    // The caption stays last — the thing being edited is never buried mid-prompt.
    expect(sent[sent.length - 1]!.content).toBe('Our revolutionary new blend!')
  })

  it('still rewrites when the workspace has no brain yet (grounding is best-effort)', async () => {
    const { provider, seen } = capturingProvider()

    const result = await runnerWithBrand(provider, null).run(captionRewriteTask, input, ctx)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.text).toBe('grounded')
    expect(seen[0]!.messages.some((m) => m.content.includes('BRAND BRAIN'))).toBe(false)
    expect(seen[0]!.messages).toHaveLength(2)
  })
  it('retrieves library passages against the text it is asked to rewrite', () => {
    // The selection when the editor sends one, the whole caption otherwise —
    // the same target buildMessages puts last, so the passages are chosen from
    // what the model is actually editing and not from something beside it.
    expect(captionRewriteTask.knowledgeQuery?.(input)).toBe('Our revolutionary new blend!')
    expect(captionRewriteTask.knowledgeQuery?.({ ...input, selection: 'the tasting menu' })).toBe(
      'the tasting menu',
    )
  })
})
