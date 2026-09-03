import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import type { MeshContext, MeshTaskDef } from '@sahoda/shared'
import type { ChatRequest, ChatResponse, Provider, ProviderUsage } from './providers/types'
import { ProviderCallError } from './providers/types'
import type { LogSink, ProviderLogRow } from './telemetry'
import { createMeshRunner, isUnparseableOutput, type Attempt, type MeshTaskSpec } from './engine'
import { createOpenRouterProvider } from './providers/openrouter'
import { chatTimeoutMsFor } from './timeouts'

// ── Test fixtures ─────────────────────────────────────────────────────────────

const OutSchema = z.object({ value: z.string() })
type Out = z.infer<typeof OutSchema>

const def: MeshTaskDef<{ q: string }, Out> = {
  name: 'test_task',
  tier: 'economy',
  inputSchema: z.object({ q: z.string() }),
  outputSchema: OutSchema,
  maxTokens: 256,
}

const ctx: MeshContext = {
  workspaceId: '11111111-1111-1111-1111-111111111111',
  traceId: 'trace-1',
  creditsCharged: 2,
}

const usage = (provider: string): ProviderUsage => ({
  provider,
  model: 'm',
  tokensIn: 10,
  tokensOut: 5,
  cachedTokens: 0,
})

const resp = (provider: string, text: string): ChatResponse => ({ text, usage: usage(provider) })

/** A provider driven by a script of responses/errors, one consumed per chat() call. */
function scriptedProvider(name: string, script: Array<ChatResponse | Error>): Provider {
  let i = 0
  return {
    name,
    async chat(_req: ChatRequest): Promise<ChatResponse> {
      const next = script[i++]
      if (next === undefined) throw new Error(`${name}: no scripted response for call ${i}`)
      if (next instanceof Error) throw next
      return next
    },
  }
}

function capturingSink(): { sink: LogSink; rows: ProviderLogRow[]; failNext?: boolean } {
  const rows: ProviderLogRow[] = []
  const state = { sink: {} as LogSink, rows, failNext: false }
  state.sink = {
    async write(row: ProviderLogRow) {
      if (state.failNext) throw new Error('sink boom')
      rows.push(row)
    },
  }
  return state
}

function clock(): () => number {
  let t = 1000
  return () => (t += 100)
}

const spec = (
  fallbackPayload?: (input: { q: string }) => Out,
): MeshTaskSpec<{ q: string }, Out> => ({
  def,
  buildMessages: (input) => [{ role: 'user', content: input.q }],
  fallbackPayload,
})

function runnerWith(attempts: Attempt[], sink: LogSink): ReturnType<typeof createMeshRunner> {
  return createMeshRunner({
    planAttempts: () => attempts,
    logSink: sink,
    now: clock(),
    price: (u) => u.tokensOut * 0.001,
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createMeshRunner', () => {
  it('returns parsed output and ok telemetry on a clean primary response', async () => {
    const primary = scriptedProvider('openrouter', [resp('openrouter', '{"value":"hi"}')])
    const { sink, rows } = capturingSink()
    const runner = runnerWith([{ provider: primary, model: 'or-model' }], sink)

    const result = await runner.run(spec(), { q: 'go' }, ctx)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toEqual({ value: 'hi' })
    expect(result.usage?.provider).toBe('openrouter')
    expect(result.usage?.costUsd).toBeGreaterThan(0)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('ok')
    expect(rows[0]!.task).toBe('test_task')
    expect(rows[0]!.workspace_id).toBe(ctx.workspaceId)
    expect(rows[0]!.credits_charged).toBe(2)
  })

  it('performs exactly one repair retry on the same provider, then succeeds', async () => {
    const primary = scriptedProvider('openrouter', [
      resp('openrouter', 'not json at all'),
      resp('openrouter', '{"value":"repaired"}'),
    ])
    const { sink, rows } = capturingSink()
    const runner = runnerWith([{ provider: primary, model: 'or-model' }], sink)

    const result = await runner.run(spec(), { q: 'go' }, ctx)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toEqual({ value: 'repaired' })
    expect(rows[0]!.status).toBe('ok')
    // token usage summed across initial + repair
    expect(rows[0]!.tokens_in).toBe(20)
  })

  it('returns PROVIDER_ERROR after a double JSON failure when no demo-fallback exists', async () => {
    const primary = scriptedProvider('openrouter', [
      resp('openrouter', 'garbage'),
      resp('openrouter', 'still garbage'),
    ])
    const { sink, rows } = capturingSink()
    const runner = runnerWith([{ provider: primary, model: 'or-model' }], sink)

    const result = await runner.run(spec(), { q: 'go' }, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('PROVIDER_ERROR')
      // MARKED, so the refusal gate can hold the post for a person instead of
      // re-asking a model that failed the schema twice on every tick.
      expect(isUnparseableOutput(result.error)).toBe(true)
      expect(result.error.message).toBe('model returned unparseable output')
    }
    expect(rows[0]!.status).toBe('error')
    expect(rows[0]!.error_code).toBeTruthy()
  })

  it('serves the demo-fallback payload (flagged) on a double JSON failure for brand tasks', async () => {
    const primary = scriptedProvider('openrouter', [
      resp('openrouter', 'garbage'),
      resp('openrouter', 'still garbage'),
    ])
    const { sink, rows } = capturingSink()
    const runner = runnerWith([{ provider: primary, model: 'or-model' }], sink)

    const result = await runner.run(
      spec(() => ({ value: 'DEMO' })),
      { q: 'go' },
      ctx,
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual({ value: 'DEMO' })
      expect(result.fallback).toBe(true)
    }
    expect(rows[0]!.status).toBe('fallback')
  })

  it('falls back to the alternate provider when the primary call fails', async () => {
    const primary = scriptedProvider('openrouter', [
      new ProviderCallError('openrouter', 503, 'down'),
    ])
    const alternate = scriptedProvider('openai', [resp('openai', '{"value":"from-openai"}')])
    const { sink, rows } = capturingSink()
    const runner = runnerWith(
      [
        { provider: primary, model: 'or-model' },
        { provider: alternate, model: 'oai-model' },
      ],
      sink,
    )

    const result = await runner.run(spec(), { q: 'go' }, ctx)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toEqual({ value: 'from-openai' })
    expect(result.usage?.provider).toBe('openai')
    expect(rows[0]!.status).toBe('fallback')
    expect(rows[0]!.provider).toBe('openai')
  })

  it('returns PROVIDER_ERROR and logs when every provider call fails', async () => {
    const primary = scriptedProvider('openrouter', [
      new ProviderCallError('openrouter', 503, 'down'),
    ])
    const alternate = scriptedProvider('openai', [new ProviderCallError('openai', 500, 'down')])
    const { sink, rows } = capturingSink()
    const runner = runnerWith(
      [
        { provider: primary, model: 'or-model' },
        { provider: alternate, model: 'oai-model' },
      ],
      sink,
    )

    const result = await runner.run(spec(), { q: 'go' }, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('error')
  })

  it('converts an unexpected non-ProviderCallError throw into a typed PROVIDER_ERROR with one telemetry row', async () => {
    // A provider that throws a plain Error (not a ProviderCallError) stands in for a
    // latent bug that bypassed the adapter's error normalization. It must never escape
    // run() as a raw rejection: the frozen guarantees still require a typed error and
    // an ai_provider_logs row on this path too.
    const primary = scriptedProvider('openrouter', [new Error('kaboom')])
    const { sink, rows } = capturingSink()
    const runner = runnerWith([{ provider: primary, model: 'or-model' }], sink)

    const result = await runner.run(spec(), { q: 'go' }, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('error')
    expect(rows[0]!.error_code).toBe('UNEXPECTED_ERROR')
    expect(rows[0]!.task).toBe('test_task')
  })

  /**
   * `ai_provider_logs.repaired` shipped to production and nothing wrote it, so the
   * column read `false` forever and the repair rate it was added to expose stayed
   * invisible. These pin the write.
   *
   * The first test is the one that matters: two runs of the SAME task, differing
   * only in whether the first attempt parsed. If the rows come back identical on
   * this field, the column is decorative again.
   */
  describe('repaired', () => {
    it('separates a repaired call from a clean one — the same task, two different rows', async () => {
      const cleanSink = capturingSink()
      await runnerWith(
        [
          {
            provider: scriptedProvider('openrouter', [resp('openrouter', '{"value":"hi"}')]),
            model: 'or-model',
          },
        ],
        cleanSink.sink,
      ).run(spec(), { q: 'go' }, ctx)

      const repairedSink = capturingSink()
      await runnerWith(
        [
          {
            provider: scriptedProvider('openrouter', [
              resp('openrouter', 'not json at all'),
              resp('openrouter', '{"value":"repaired"}'),
            ]),
            model: 'or-model',
          },
        ],
        repairedSink.sink,
      ).run(spec(), { q: 'go' }, ctx)

      expect(cleanSink.rows[0]!.repaired).toBe(false)
      expect(repairedSink.rows[0]!.repaired).toBe(true)
      // Both succeeded. `status` cannot tell them apart — that is the whole reason
      // `repaired` is a separate column rather than a fourth status value.
      expect(cleanSink.rows[0]!.status).toBe('ok')
      expect(repairedSink.rows[0]!.status).toBe('ok')
    })

    it('stays true when the repair itself failed — it records the spend, not the outcome', async () => {
      const { sink, rows } = capturingSink()
      const primary = scriptedProvider('openrouter', [
        resp('openrouter', 'garbage'),
        resp('openrouter', 'still garbage'),
      ])

      await runnerWith([{ provider: primary, model: 'or-model' }], sink).run(
        spec(),
        { q: 'go' },
        ctx,
      )

      expect(rows[0]!.status).toBe('error')
      expect(rows[0]!.repaired).toBe(true)
    })

    it('stays true underneath a demo-fallback payload, which would otherwise look clean', async () => {
      const { sink, rows } = capturingSink()
      const primary = scriptedProvider('openrouter', [
        resp('openrouter', 'garbage'),
        resp('openrouter', 'still garbage'),
      ])

      await runnerWith([{ provider: primary, model: 'or-model' }], sink).run(
        spec(() => ({ value: 'DEMO' })),
        { q: 'go' },
        ctx,
      )

      expect(rows[0]!.status).toBe('fallback')
      expect(rows[0]!.repaired).toBe(true)
    })

    it('is false when a provider outage means no output ever existed to fail a schema', async () => {
      const { sink, rows } = capturingSink()
      const primary = scriptedProvider('openrouter', [
        new ProviderCallError('openrouter', 503, 'down'),
      ])

      await runnerWith([{ provider: primary, model: 'or-model' }], sink).run(
        spec(),
        { q: 'go' },
        ctx,
      )

      expect(rows[0]!.status).toBe('error')
      expect(rows[0]!.repaired).toBe(false)
    })
  })

  it('never lets a telemetry write failure break the model result', async () => {
    const primary = scriptedProvider('openrouter', [resp('openrouter', '{"value":"ok"}')])
    const state = capturingSink()
    state.failNext = true
    const runner = runnerWith([{ provider: primary, model: 'or-model' }], state.sink)

    const result = await runner.run(spec(), { q: 'go' }, ctx)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toEqual({ value: 'ok' })
  })
})

/**
 * A STALLED PROVIDER ENDS INSIDE THE CEILING, AS A TYPED FAILURE.
 *
 * The transport here is the real OpenRouter client over a fetch that settles
 * only when its signal fires, which is how `fetch` behaves. The runner must come
 * back with PROVIDER_ERROR, because that is the return `withCredits` releases the
 * hold on; a promise that never settles is a hold nobody releases.
 */
describe('createMeshRunner — ceilings', () => {
  const hangUntilAborted = (_url: string, init: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true })
    })

  it('hands every chat call the ceiling for its task', async () => {
    const seen: ChatRequest[] = []
    const capturing: Provider = {
      name: 'openrouter',
      async chat(req) {
        seen.push(req)
        return resp('openrouter', '{"value":"hi"}')
      },
    }
    const { sink } = capturingSink()
    const runner = runnerWith([{ provider: capturing, model: 'or-model' }], sink)

    await runner.run(spec(), { q: 'go' }, ctx)

    expect(seen[0]!.timeoutMs).toBe(chatTimeoutMsFor(def.name))
    expect(chatTimeoutMsFor('gate_classify')).toBe(12_000)
    expect(chatTimeoutMsFor('site_generate')).toBeGreaterThan(chatTimeoutMsFor('caption_rewrite'))
  })

  it('returns PROVIDER_ERROR and logs PROVIDER_TIMEOUT when the transport never answers', async () => {
    const { sink, rows } = capturingSink()
    const runner = createMeshRunner({
      planAttempts: () => [
        { provider: createOpenRouterProvider('k', hangUntilAborted), model: 'or-model' },
      ],
      logSink: sink,
      now: clock(),
      price: () => 0,
      chatTimeoutMs: () => 20,
    })

    const result = await runner.run(spec(), { q: 'go' }, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('PROVIDER_ERROR')
      expect(result.error.message).toBe('all providers failed to respond')
      // An outage, not a schema failure: the gate may retry this one.
      expect(isUnparseableOutput(result.error)).toBe(false)
    }
    expect(rows[0]!.status).toBe('error')
    expect(rows[0]!.error_code).toBe('PROVIDER_TIMEOUT')
  })

  it('an image generation that never answers fails inside the ceiling and logs TIMEOUT', async () => {
    const { sink, rows } = capturingSink()
    const runner = createMeshRunner({
      planAttempts: () => [],
      logSink: sink,
      now: clock(),
      price: () => 0,
      planImage: () => ({
        provider: createOpenRouterProvider('k', hangUntilAborted),
        model: 'img-model',
      }),
      imageTimeoutMs: 20,
    })

    const result = await runner.runImage(
      { ...def, name: 'image_generate', tier: 'standard' } as MeshTaskDef<unknown, unknown>,
      { prompt: 'p', width: 1024, height: 1024 },
      ctx,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe('image generation failed')
    expect(rows[0]!.error_code).toBe('TIMEOUT')
  })
})
