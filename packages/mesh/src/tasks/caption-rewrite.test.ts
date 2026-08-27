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
import { captionRewriteTask, MEANING_RULE, TONE_MODES } from './caption-rewrite'

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
    const instructions = CaptionRewriteInputSchema.shape.instruction.options
    const systems = instructions.map((instruction) => {
      const input = CaptionRewriteInputSchema.parse({ ...base, instruction })
      const messages = captionRewriteTask.buildMessages(input, ctx)
      expect(messages[0]!.role).toBe('system')
      const last = messages[messages.length - 1]!
      expect(last.role).toBe('user')
      expect(last.content).toContain('new shop')
      return messages[0]!.content
    })
    // Read off the schema rather than hardcoded, so an instruction added to the
    // contract without a directive of its own cannot slip past by matching a
    // number written here. Every one must produce its OWN prompt.
    expect(new Set(systems).size).toBe(instructions.length)
  })

  /**
   * THE ONE THING EVERY TONE MODE MUST NOT DO.
   *
   * The four tone modes send the WHOLE caption, and the caption is a real
   * business owner's words about their own business. A mode that invented a
   * claim would put a sentence nobody said in front of their customers, on a
   * screen whose entire premise is that the writer's words are the writer's.
   *
   * Asserted per mode rather than once, because the failure this guards against
   * is exactly one of the four losing the rule in a later edit.
   */
  it('tells every tone mode to keep the meaning and fix the grammar', () => {
    for (const instruction of TONE_MODES) {
      const input = CaptionRewriteInputSchema.parse({ text: 'We open at 8', instruction })
      const system = captionRewriteTask.buildMessages(input, ctx)[0]!.content

      expect(system, `${instruction} lost the meaning rule`).toContain(MEANING_RULE)
    }
  })

  it('says outright that creative must not add anything the author did not write', () => {
    // The mode most likely to invent, and the founder's own word for it. Its
    // directive states the rule in its OWN terms as well as carrying
    // MEANING_RULE, so softening either one is still caught.
    const input = CaptionRewriteInputSchema.parse({ text: 'We open at 8', instruction: 'creative' })
    const system = captionRewriteTask.buildMessages(input, ctx)[0]!.content

    expect(system).toMatch(/do NOT add details, examples, benefits or claims they did not write/)
  })

  /**
   * A WHOLE-BODY BUDGET, NOT A FRAGMENT ONE.
   *
   * 512 tokens was right while the only caller sent a phrase. LinkedIn's limit
   * is 3,000 characters, which is roughly 750 to 1,000 tokens of English before
   * JSON escaping — so the old ceiling would have truncated a long caption
   * mid-sentence and returned the fragment as a finished rewrite. That is a
   * silent corruption of the writer's post rather than a visible failure, which
   * is the worst shape a defect can take on a paid action.
   */
  it('budgets enough output tokens for the longest caption any channel allows', () => {
    // 3,000 characters at the pessimistic ~3 chars/token, plus JSON overhead.
    expect(captionRewriteTask.def.maxTokens).toBeGreaterThanOrEqual(1_000)
  })

  /**
   * `caption_rewrite` is a FLAT one-credit charge whatever it is handed, so an
   * unbounded input is an unbounded provider bill against a fixed price. There
   * was no cap at all: a 50,000-character selection cost the same one credit as
   * a phrase.
   */
  it('refuses an input longer than any real caption, because the price is flat', () => {
    const tooLong = 'a'.repeat(8_001)

    expect(
      CaptionRewriteInputSchema.safeParse({ text: tooLong, instruction: 'polish' }).success,
    ).toBe(false)
    // And the cap is clear of every channel's own limit, so no legal caption
    // hits it. LinkedIn's 3,000 is the largest.
    expect(
      CaptionRewriteInputSchema.safeParse({ text: 'a'.repeat(3_000), instruction: 'polish' })
        .success,
    ).toBe(true)
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
