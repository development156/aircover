import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import type { MeshContext, MeshTaskDef } from '@sahoda/shared'
import type { ChatRequest, ChatResponse, Provider, ProviderUsage } from './providers/types'
import { ProviderCallError } from './providers/types'
import type { LogSink, ProviderLogRow } from './telemetry'
import { createMeshRunner, type Attempt, type MeshTaskSpec } from './engine'

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
    if (!result.ok) expect(result.error.code).toBe('PROVIDER_ERROR')
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
