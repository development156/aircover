import { describe, it, expect } from 'vitest'
import type { BrandSignal, MeshContext } from '@sahoda/shared'
import type { ChatRequest, ChatResponse, Provider } from '../providers/types'
import { createMeshRunner } from '../engine'
import {
  promptRefineTask,
  PromptRefineInputSchema,
  NO_INVENTION_RULE,
  NO_SETTINGS_RULE,
  stripSettingsLanguage,
} from './prompt-refine'

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

const confirmed: BrandSignal = { field: 'voice', certainty: 'confirmed', value: 'warm and direct' }

describe('promptRefineTask', () => {
  it('is the economy-tier studio_prompt_refine task with an explicit token budget', () => {
    expect(promptRefineTask.def.name).toBe('studio_prompt_refine')
    expect(promptRefineTask.def.tier).toBe('economy')
    expect(promptRefineTask.def.maxTokens).toBeGreaterThan(0)
  })

  it('has no demo-fallback (only brand_guidelines does)', () => {
    expect(promptRefineTask.fallbackPayload).toBeUndefined()
  })

  it('does not use the engine’s own brand-context grounding', () => {
    // See the file header: the engine's cachePrefix mechanism cannot tell an
    // empty brain from an unreadable one, and this task needs to. Grounding
    // arrives through `input.signals` instead.
    expect(promptRefineTask.def.cachePrefix).toBeUndefined()
  })

  it('states the two rules the system prompt must carry', () => {
    const input = PromptRefineInputSchema.parse({ wanted: 'a cosy corner cafe', signals: [] })
    const system = promptRefineTask.buildMessages(input, ctx)[0]!.content
    expect(system).toContain(NO_INVENTION_RULE)
    expect(system).toContain(NO_SETTINGS_RULE)
  })

  it('puts the brand block after the system contract, cacheable, and the typed words last', () => {
    const input = PromptRefineInputSchema.parse({
      wanted: 'a cosy corner cafe',
      signals: [confirmed],
    })
    const messages = promptRefineTask.buildMessages(input, ctx)
    expect(messages[0]!.role).toBe('system')
    expect(messages[1]!.content).toContain('warm and direct')
    expect(messages[1]!.cache).toBe(true)
    const last = messages[messages.length - 1]!
    expect(last.role).toBe('user')
    expect(last.content).toBe('a cosy corner cafe')
  })

  it('sends no brand block at all when there are no signals (empty and unreadable look the same to the model)', () => {
    const input = PromptRefineInputSchema.parse({ wanted: 'a cosy corner cafe', signals: [] })
    const messages = promptRefineTask.buildMessages(input, ctx)
    expect(messages).toHaveLength(2)
  })

  it("keeps the person's own words untouched in the outgoing request (reversibility starts here)", () => {
    const input = PromptRefineInputSchema.parse({
      wanted: 'a plate on a wooden table',
      signals: [],
    })
    const messages = promptRefineTask.buildMessages(input, ctx)
    expect(messages[messages.length - 1]!.content).toBe('a plate on a wooden table')
  })

  it('resolves a valid model response into the refined text', async () => {
    const runner = runnerFor(
      fixedProvider(['{"refined":"A cosy corner cafe, warm morning light."}']),
    )
    const input = PromptRefineInputSchema.parse({ wanted: 'a cosy corner cafe', signals: [] })

    const result = await runner.run(promptRefineTask, input, ctx)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.refined).toBe('A cosy corner cafe, warm morning light.')
  })

  /**
   * THE GUARANTEE THE BRIEF NAMES BY NAME: an aspect ratio that slips into the
   * model's answer must never reach the caller. Mutation: comment out the
   * `refined.length === 0` branch's strip call (replace `stripSettingsLanguage(val.refined)`
   * with `val.refined` in the schema transform) and this goes red.
   */
  it('strips a sentence naming an aspect ratio from the refined prompt', async () => {
    const runner = runnerFor(
      fixedProvider([
        '{"refined":"A cosy corner cafe, warm morning light. Render at 1:1 aspect ratio."}',
      ]),
    )
    const input = PromptRefineInputSchema.parse({ wanted: 'a cosy corner cafe', signals: [] })

    const result = await runner.run(promptRefineTask, input, ctx)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.refined).not.toMatch(/1:1/)
      expect(result.data.refined).not.toMatch(/aspect ratio/i)
      expect(result.data.refined).toContain('A cosy corner cafe, warm morning light.')
    }
  })

  it('strips size, count, model and logo language the same way', () => {
    expect(stripSettingsLanguage('A cosy scene. Make it 1024x1024 pixels.')).toBe('A cosy scene.')
    expect(stripSettingsLanguage('A cosy scene. Generate 4 images.')).toBe('A cosy scene.')
    expect(stripSettingsLanguage('A cosy scene. Use DALL-E for this.')).toBe('A cosy scene.')
    expect(stripSettingsLanguage('A cosy scene. Put the logo bottom right.')).toBe('A cosy scene.')
  })

  it('leaves ordinary prose with no settings language completely alone', () => {
    const prose = 'A cosy corner cafe. Warm morning light through the window.'
    expect(stripSettingsLanguage(prose)).toBe(prose)
  })

  /**
   * A refinement that is NOTHING BUT settings language strips to empty, which
   * is a schema failure (spends the one repair) rather than a plausible empty
   * string. Mutation: return `{ refined: val.refined }` unconditionally from
   * the transform and this goes red (result.ok becomes true).
   */
  it('treats an output that is only settings language as unparseable, not as an empty success', async () => {
    const runner = runnerFor(
      fixedProvider(['{"refined":"1:1 aspect ratio."}', '{"refined":"Square format only."}']),
    )
    const input = PromptRefineInputSchema.parse({ wanted: 'a cosy corner cafe', signals: [] })

    const result = await runner.run(promptRefineTask, input, ctx)

    expect(result.ok).toBe(false)
  })

  it('returns PROVIDER_ERROR on a double JSON failure (no mock-success)', async () => {
    const runner = runnerFor(fixedProvider(['nope', 'still nope']))
    const input = PromptRefineInputSchema.parse({ wanted: 'a cosy corner cafe', signals: [] })

    const result = await runner.run(promptRefineTask, input, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('PROVIDER_ERROR')
  })

  it('bounds the input the same way the image conditioning prompt is bounded', () => {
    expect(PromptRefineInputSchema.safeParse({ wanted: 'ab', signals: [] }).success).toBe(false)
    expect(
      PromptRefineInputSchema.safeParse({ wanted: 'a'.repeat(1001), signals: [] }).success,
    ).toBe(false)
    expect(
      PromptRefineInputSchema.safeParse({ wanted: 'a plate of food', signals: [] }).success,
    ).toBe(true)
  })
})
