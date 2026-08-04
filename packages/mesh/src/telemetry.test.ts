import { describe, it, expect } from 'vitest'
import type { FetchLike } from './providers/types'
import { createPostgrestLogSink, TelemetryWriteError, type ProviderLogRow } from './telemetry'

interface Recorded {
  url: string
  init: RequestInit
}

function fakeFetch(status = 201): { fetchImpl: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init })
    return new Response(null, { status })
  }
  return { fetchImpl, calls }
}

const row: ProviderLogRow = {
  workspace_id: '11111111-1111-1111-1111-111111111111',
  task: 'brand_guidelines',
  tier: 'standard',
  provider: 'openrouter',
  model: 'anthropic/claude-sonnet-5',
  tokens_in: 100,
  tokens_out: 40,
  cached_tokens: 60,
  cost_usd: 0.0021,
  latency_ms: 850,
  credits_charged: 5,
  status: 'ok',
  error_code: null,
  trace_id: 'trace-abc',
}

/** The only columns telemetry may ever send — no prompt/output payload fields. */
const ALLOWED_COLUMNS = new Set([
  'workspace_id',
  'task',
  'tier',
  'provider',
  'model',
  'tokens_in',
  'tokens_out',
  'cached_tokens',
  'cost_usd',
  'latency_ms',
  'credits_charged',
  'status',
  'error_code',
  'trace_id',
])

describe('createPostgrestLogSink', () => {
  it('POSTs the row to the ai_provider_logs PostgREST endpoint with service-role auth', async () => {
    const { fetchImpl, calls } = fakeFetch()
    const sink = createPostgrestLogSink({
      supabaseUrl: 'https://proj.supabase.co',
      serviceKey: 'svc-secret',
      fetchImpl,
    })

    await sink.write(row)

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://proj.supabase.co/rest/v1/ai_provider_logs')
    expect(calls[0]!.init.method).toBe('POST')
    const headers = calls[0]!.init.headers as Record<string, string>
    expect(headers.apikey).toBe('svc-secret')
    expect(headers.authorization).toBe('Bearer svc-secret')
    expect(headers.prefer).toContain('return=minimal')
  })

  it('sends only telemetry metadata columns — never a payload field', async () => {
    const { fetchImpl, calls } = fakeFetch()
    const sink = createPostgrestLogSink({
      supabaseUrl: 'https://proj.supabase.co',
      serviceKey: 'k',
      fetchImpl,
    })

    await sink.write(row)

    const sent = JSON.parse(calls[0]!.init.body as string)
    for (const key of Object.keys(sent)) {
      expect(ALLOWED_COLUMNS.has(key), `unexpected column "${key}"`).toBe(true)
    }
  })

  it('throws TelemetryWriteError on non-2xx without leaking the service key', async () => {
    const { fetchImpl } = fakeFetch(401)
    const sink = createPostgrestLogSink({
      supabaseUrl: 'https://proj.supabase.co',
      serviceKey: 'super-secret-service-role',
      fetchImpl,
    })

    let caught: unknown
    try {
      await sink.write(row)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(TelemetryWriteError)
    expect((caught as TelemetryWriteError).status).toBe(401)
    expect((caught as Error).message).not.toContain('super-secret-service-role')
  })
})
