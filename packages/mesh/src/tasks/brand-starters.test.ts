import { describe, it, expect } from 'vitest'
import type { BrandSignal, MeshContext } from '@sahoda/shared'
import type { ChatRequest, ChatResponse, Provider } from '../providers/types'
import { createMeshRunner } from '../engine'
import {
  brandStartersTask,
  BrandStartersInputSchema,
  NO_INVENTION_RULE,
  SERVICE_BUSINESS_RULE,
} from './brand-starters'

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

const confirmed: BrandSignal = {
  field: 'what the business is',
  certainty: 'confirmed',
  value: 'software training for clinics',
}

const idea = (label: string, prompt: string) => ({ label, prompt })

describe('brandStartersTask', () => {
  it('is the economy-tier brand_starters task with an explicit token budget', () => {
    expect(brandStartersTask.def.name).toBe('brand_starters')
    expect(brandStartersTask.def.tier).toBe('economy')
    expect(brandStartersTask.def.maxTokens).toBeGreaterThan(0)
  })

  it('never declares a demo-fallback (only brand_guidelines has one)', () => {
    expect(brandStartersTask.fallbackPayload).toBeUndefined()
  })

  it('states the no-invention and service-business rules in the system contract', () => {
    const input = BrandStartersInputSchema.parse({ signals: [] })
    const system = brandStartersTask.buildMessages(input, ctx)[0]!.content
    expect(system).toContain(NO_INVENTION_RULE)
    expect(system).toContain(SERVICE_BUSINESS_RULE)
  })

  it('puts the brand block after the system contract, cacheable, and a user message last', () => {
    const input = BrandStartersInputSchema.parse({ signals: [confirmed] })
    const messages = brandStartersTask.buildMessages(input, ctx)
    expect(messages[0]!.role).toBe('system')
    expect(messages[1]!.content).toContain('software training for clinics')
    expect(messages[1]!.cache).toBe(true)
    const last = messages[messages.length - 1]!
    expect(last.role).toBe('user')
  })

  it('sends no brand block at all when there are no signals, and still asks for ideas', () => {
    const input = BrandStartersInputSchema.parse({ signals: [] })
    const messages = brandStartersTask.buildMessages(input, ctx)
    expect(messages).toHaveLength(2)
    expect(messages[1]!.role).toBe('user')
  })

  it('resolves a valid model response into label/prompt ideas', async () => {
    const runner = runnerFor(
      fixedProvider([
        JSON.stringify({
          starters: [
            idea(
              'Clinic training in session',
              'A trainer walking clinic staff through a new process, mid-explanation.',
            ),
            idea(
              'Whiteboard planning',
              'A whiteboard covered in a session plan, nobody in the shot.',
            ),
            idea(
              'Handshake after a session',
              'Two people shaking hands after a training session, warm light.',
            ),
          ],
        }),
      ]),
    )
    const input = BrandStartersInputSchema.parse({ signals: [confirmed] })

    const result = await runner.run(brandStartersTask, input, ctx)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.starters).toHaveLength(3)
      expect(result.data.starters[0]).toEqual({
        label: 'Clinic training in session',
        prompt: 'A trainer walking clinic staff through a new process, mid-explanation.',
      })
    }
  })

  /**
   * THE BOUND THE MIGRATION'S OWN CHECK ASSERTS: 3 TO 8. Mutation: change
   * `BrandStarterIdeasSchema` (packages/shared/src/studio/starters.ts) to
   * `.min(1)` and this goes red (the two-idea response starts parsing).
   */
  it('rejects an output with fewer than 3 ideas, spending the repair retry, then fails', async () => {
    const twoIdeas = JSON.stringify({
      starters: [idea('One', 'A single idea.'), idea('Two', 'Another single idea.')],
    })
    const runner = runnerFor(fixedProvider([twoIdeas, twoIdeas]))
    const input = BrandStartersInputSchema.parse({ signals: [] })

    const result = await runner.run(brandStartersTask, input, ctx)

    expect(result.ok).toBe(false)
  })

  it('rejects an output with more than 8 ideas the same way', async () => {
    const nineIdeas = JSON.stringify({
      starters: Array.from({ length: 9 }, (_, i) => idea(`Idea ${i}`, `A prompt for idea ${i}.`)),
    })
    const runner = runnerFor(fixedProvider([nineIdeas, nineIdeas]))
    const input = BrandStartersInputSchema.parse({ signals: [] })

    const result = await runner.run(brandStartersTask, input, ctx)

    expect(result.ok).toBe(false)
  })

  it('recovers on the repair retry when the first answer is malformed but the second is in bounds', async () => {
    const threeIdeas = JSON.stringify({
      starters: [
        idea('One', 'A single idea.'),
        idea('Two', 'Another single idea.'),
        idea('Three', 'A third single idea.'),
      ],
    })
    const runner = runnerFor(fixedProvider(['not json at all', threeIdeas]))
    const input = BrandStartersInputSchema.parse({ signals: [] })

    const result = await runner.run(brandStartersTask, input, ctx)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.starters).toHaveLength(3)
  })

  it('returns PROVIDER_ERROR on a double JSON failure (no mock-success)', async () => {
    const runner = runnerFor(fixedProvider(['nope', 'still nope']))
    const input = BrandStartersInputSchema.parse({ signals: [] })

    const result = await runner.run(brandStartersTask, input, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('PROVIDER_ERROR')
  })

  it('bounds the number of signals it will read', () => {
    const many = Array.from({ length: 17 }, (_, i) => ({
      field: `field_${i}`,
      certainty: 'guessed' as const,
      value: 'x',
    }))
    expect(BrandStartersInputSchema.safeParse({ signals: many }).success).toBe(false)
  })
})
