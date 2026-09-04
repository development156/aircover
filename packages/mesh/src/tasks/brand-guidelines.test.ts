import { describe, it, expect } from 'vitest'
import {
  BrandMemoryPayloadSchema,
  DEMO_FALLBACK_PAYLOAD,
  ResolveInputSchema,
  type MeshContext,
} from '@sahoda/shared'
import type { ChatRequest, ChatResponse, Provider } from '../providers/types'
import { createMeshRunner } from '../engine'
import { brandGuidelinesTask } from './brand-guidelines'

const input = ResolveInputSchema.parse({ source: { name: 'Chai & Chapters' } })

const ctx: MeshContext = {
  workspaceId: '11111111-1111-1111-1111-111111111111',
  traceId: 't',
}

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

describe('brandGuidelinesTask', () => {
  it('is the economy-tier brand_guidelines task with an explicit token budget', () => {
    // ECONOMY since 2026-09-04, applying a bake-off measured 2026-08-12 that had
    // been written into `TASK_TIER` and never into the definition that routes the
    // call. The tier lives in TWO places and `routing.test.ts` asserts they agree,
    // so this line and that table move together or the suite says so.
    expect(brandGuidelinesTask.def.name).toBe('brand_guidelines')
    expect(brandGuidelinesTask.def.tier).toBe('economy')
    expect(brandGuidelinesTask.def.maxTokens).toBeGreaterThan(0)
  })

  it('emits the Brand Brain payload schema as its output contract', () => {
    expect(brandGuidelinesTask.def.outputSchema.safeParse(DEMO_FALLBACK_PAYLOAD).success).toBe(true)
  })

  it('builds a system-contract prefix and puts the resolve signals in the last user turn', () => {
    const messages = brandGuidelinesTask.buildMessages(input, ctx)
    expect(messages[0]!.role).toBe('system')
    const last = messages[messages.length - 1]!
    expect(last.role).toBe('user')
    expect(last.content).toContain('Chai & Chapters')
  })

  it('serves the shared DEMO_FALLBACK_PAYLOAD as its demo-fallback', () => {
    expect(brandGuidelinesTask.fallbackPayload).toBeDefined()
    expect(brandGuidelinesTask.fallbackPayload!(input)).toEqual(DEMO_FALLBACK_PAYLOAD)
  })

  it('resolves a valid model response into a parsed Brand Brain payload', async () => {
    const good = JSON.stringify(DEMO_FALLBACK_PAYLOAD)
    const runner = runnerFor(fixedProvider([good]))

    const result = await runner.run(brandGuidelinesTask, input, ctx)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(BrandMemoryPayloadSchema.safeParse(result.data).success).toBe(true)
      expect(result.fallback).toBeUndefined()
    }
  })

  it('serves the flagged demo-fallback after a double JSON failure', async () => {
    const runner = runnerFor(fixedProvider(['nope', 'still nope']))

    const result = await runner.run(brandGuidelinesTask, input, ctx)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual(DEMO_FALLBACK_PAYLOAD)
      expect(result.fallback).toBe(true)
    }
  })
})
