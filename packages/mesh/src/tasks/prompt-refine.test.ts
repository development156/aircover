import { describe, it, expect } from 'vitest'
import type { BrandSignal, MeshContext, PromptRefineSettings } from '@sahoda/shared'
import type { ChatRequest, ChatResponse, Provider } from '../providers/types'
import { createMeshRunner } from '../engine'
import {
  promptRefineTask,
  PromptRefineInputSchema,
  NO_INVENTION_RULE,
  NO_SETTINGS_RULE,
  stripSettingsLanguage,
  settingsGuidance,
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

/** Base settings for a plain on-brand press: stamp off, no reference, square canvas. */
const BASE_SETTINGS: PromptRefineSettings = {
  mode: 'on_brand',
  shape: 'square',
  hasReference: false,
  stampEnabled: false,
  stampAnchor: 'bottom-right',
}

function input(overrides: {
  wanted?: string
  signals?: BrandSignal[]
  settings?: Partial<PromptRefineSettings>
}) {
  return PromptRefineInputSchema.parse({
    wanted: overrides.wanted ?? 'a cosy corner cafe',
    signals: overrides.signals ?? [],
    settings: { ...BASE_SETTINGS, ...overrides.settings },
  })
}

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
    expect(promptRefineTask.def.cachePrefix).toBeUndefined()
  })

  it('states the two rules the system prompt must carry', () => {
    const system = promptRefineTask.buildMessages(input({}), ctx)[0]!.content
    expect(system).toContain(NO_INVENTION_RULE)
    expect(system).toContain(NO_SETTINGS_RULE)
  })

  it('puts the brand block after the system contract, cacheable, before the (uncached) settings guidance, with the typed words last', () => {
    const messages = promptRefineTask.buildMessages(input({ signals: [confirmed] }), ctx)
    expect(messages[0]!.role).toBe('system')
    expect(messages[1]!.content).toContain('warm and direct')
    expect(messages[1]!.cache).toBe(true)
    const last = messages[messages.length - 1]!
    expect(last.role).toBe('user')
    expect(last.content).toBe('a cosy corner cafe')
  })

  it('sends no brand block when there are no signals, but still sends settings guidance', () => {
    const messages = promptRefineTask.buildMessages(input({}), ctx)
    // system contract, settings guidance, user — no brand block.
    expect(messages).toHaveLength(3)
    expect(messages[1]!.cache).toBeUndefined()
  })

  it("keeps the person's own words untouched in the outgoing request (reversibility starts here)", () => {
    const messages = promptRefineTask.buildMessages(
      input({ wanted: 'a plate on a wooden table' }),
      ctx,
    )
    expect(messages[messages.length - 1]!.content).toBe('a plate on a wooden table')
  })

  it('resolves a valid model response into the refined text', async () => {
    const runner = runnerFor(
      fixedProvider(['{"refined":"A cosy corner cafe, warm morning light."}']),
    )
    const result = await runner.run(promptRefineTask, input({}), ctx)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.refined).toBe('A cosy corner cafe, warm morning light.')
  })

  /**
   * THE GUARANTEE THE BRIEF NAMES BY NAME: an aspect ratio that slips into the
   * model's answer must never reach the caller, for EVERY combination of
   * settings. Mutation: comment out the `refined.length === 0` branch's strip
   * call (replace `stripSettingsLanguage(val.refined)` with `val.refined` in
   * the schema transform) and every one of these goes red.
   */
  it.each<Partial<PromptRefineSettings>>([
    { shape: 'square', stampEnabled: false },
    { shape: 'tall', stampEnabled: true, stampAnchor: 'top-left' },
    { shape: 'wide', hasReference: true, referenceFollow: 'close' },
    { mode: 'explore', hasReference: false },
  ])('strips a ratio, a size and a count regardless of settings %o', async (settings) => {
    const runner = runnerFor(
      fixedProvider([
        '{"refined":"A cosy corner cafe, warm morning light. Render at 1:1 aspect ratio, ' +
          '1024x1024 pixels, generate 4 images."}',
      ]),
    )
    const result = await runner.run(promptRefineTask, input({ settings }), ctx)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.refined).not.toMatch(/1:1/)
      expect(result.data.refined).not.toMatch(/aspect ratio/i)
      expect(result.data.refined).not.toMatch(/1024\s*x\s*1024/i)
      expect(result.data.refined).not.toMatch(/\b4\s+images?\b/i)
      expect(result.data.refined).toContain('A cosy corner cafe, warm morning light.')
    }
  })

  it('strips size, count, model and logo language the same way', () => {
    expect(stripSettingsLanguage('A cosy scene. Make it 1024x1024 pixels.')).toBe('A cosy scene.')
    expect(stripSettingsLanguage('A cosy scene. Generate 4 images.')).toBe('A cosy scene.')
    expect(stripSettingsLanguage('A cosy scene. Use DALL-E for this.')).toBe('A cosy scene.')
    expect(stripSettingsLanguage('A cosy scene. Put the logo bottom right.')).toBe('A cosy scene.')
  })

  /**
   * MUTATION: remove the `/\bavoid\s+including\b/i` pattern from
   * `SETTINGS_SENTENCE_PATTERNS` and this goes red — a bolted-on exclusion
   * clause would then survive alongside whatever `conditionPrompt` appends
   * downstream, stating the same exclusion twice in the prompt actually sent.
   */
  it('strips a bolted-on "Avoid including" clause, so an exclusion is stated once, not twice', () => {
    expect(
      stripSettingsLanguage('A cosy scene with no birds in view. Avoid including: birds.'),
    ).toBe('A cosy scene with no birds in view.')
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
    const result = await runner.run(promptRefineTask, input({}), ctx)

    expect(result.ok).toBe(false)
  })

  it('returns PROVIDER_ERROR on a double JSON failure (no mock-success)', async () => {
    const runner = runnerFor(fixedProvider(['nope', 'still nope']))
    const result = await runner.run(promptRefineTask, input({}), ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('PROVIDER_ERROR')
  })

  it('bounds the input the same way the image conditioning prompt is bounded', () => {
    expect(
      PromptRefineInputSchema.safeParse({ wanted: 'ab', signals: [], settings: BASE_SETTINGS })
        .success,
    ).toBe(false)
    expect(
      PromptRefineInputSchema.safeParse({
        wanted: 'a'.repeat(1001),
        signals: [],
        settings: BASE_SETTINGS,
      }).success,
    ).toBe(false)
    expect(
      PromptRefineInputSchema.safeParse({
        wanted: 'a plate of food',
        signals: [],
        settings: BASE_SETTINGS,
      }).success,
    ).toBe(true)
  })

  it('requires settings: an input with none is rejected, never defaulted silently', () => {
    expect(
      PromptRefineInputSchema.safeParse({ wanted: 'a plate of food', signals: [] }).success,
    ).toBe(false)
  })
})

describe('settingsGuidance', () => {
  it('always composes for the shape, even with every other setting off', () => {
    expect(settingsGuidance(BASE_SETTINGS)).toMatch(/square crop/i)
    expect(settingsGuidance({ ...BASE_SETTINGS, shape: 'tall' })).toMatch(/tall crop/i)
    expect(settingsGuidance({ ...BASE_SETTINGS, shape: 'wide' })).toMatch(/wide crop/i)
  })

  /**
   * THE FOUNDER'S OWN EXAMPLE. Mutation: force `stampEnabled` to `false`
   * inside `settingsGuidance` (ignore the argument) and this goes red.
   */
  it('with the stamp ON, asks for calm space in the chosen corner', () => {
    const guidance = settingsGuidance({
      ...BASE_SETTINGS,
      stampEnabled: true,
      stampAnchor: 'top-left',
    })
    expect(guidance).toMatch(/calm, uncluttered space/i)
    expect(guidance).toMatch(/top-left corner/i)
    expect(guidance).not.toMatch(/\blogo\b/i)
    expect(guidance).not.toMatch(/watermark/i)
  })

  /** Mutation: force `stampEnabled` to `true` regardless of the argument and this goes red. */
  it('with the stamp OFF, never mentions a corner or asks for quiet space', () => {
    const guidance = settingsGuidance({ ...BASE_SETTINGS, stampEnabled: false })
    expect(guidance).not.toMatch(/calm, uncluttered space/i)
    expect(guidance).not.toMatch(/corner/i)
  })

  it('a reference attached changes the instruction from a fresh-scene default', () => {
    const withReference = settingsGuidance({ ...BASE_SETTINGS, hasReference: true })
    const withoutReference = settingsGuidance({ ...BASE_SETTINGS, hasReference: false })
    expect(withReference).not.toBe(withoutReference)
    expect(withReference).toMatch(/variation on the picture already attached/i)
    expect(withoutReference).not.toMatch(/variation on the picture already attached/i)
  })

  it('never describes what the attached reference shows', () => {
    const guidance = settingsGuidance({ ...BASE_SETTINGS, hasReference: true })
    expect(guidance).not.toMatch(/the reference shows|the picture shows a/i)
  })

  it('explore favors a loose interpretation instead of the reference-variation line', () => {
    const guidance = settingsGuidance({ ...BASE_SETTINGS, mode: 'explore', hasReference: false })
    expect(guidance).toMatch(/loose, varied interpretation/i)
  })

  it('matches the intensity of "follow how closely" without naming the control', () => {
    const close = settingsGuidance({
      ...BASE_SETTINGS,
      hasReference: true,
      referenceFollow: 'close',
    })
    const loose = settingsGuidance({
      ...BASE_SETTINGS,
      hasReference: true,
      referenceFollow: 'loose',
    })
    const balanced = settingsGuidance({ ...BASE_SETTINGS, hasReference: true })
    expect(close).toMatch(/stay close/i)
    expect(loose).toMatch(/freedom to vary/i)
    expect(balanced).not.toMatch(/stay close|freedom to vary/i)
    expect(close).not.toMatch(/follow how closely/i)
  })

  it('folds the exclusion into the instruction once, never as a bolted-on clause', () => {
    const guidance = settingsGuidance({ ...BASE_SETTINGS, excludeText: 'birds' })
    expect(guidance).toMatch(/never includes birds/i)
    expect(guidance).not.toMatch(/avoid including/i)
  })

  it('adds nothing for an exclusion when none was given', () => {
    const guidance = settingsGuidance(BASE_SETTINGS)
    expect(guidance).not.toMatch(/never includes/i)
  })
})
