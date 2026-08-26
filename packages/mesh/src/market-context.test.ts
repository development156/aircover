import { describe, it, expect } from 'vitest'
import {
  buildMarketMessage,
  createPostgrestMarketContext,
  MarketContextError,
  MARKET_OBSERVATION_LIMIT,
} from './market-context'
import type { FetchLike } from './providers/types'

/**
 * THE FAKE IS A TWO-TENANT TABLE, for the reason `knowledge-context.test.ts`
 * gives and which applies here word for word: this reads with the service key,
 * so RLS is not a second line and the `workspace_id=eq.` term in the URL IS the
 * tenant boundary. A stub returning a fixed array cannot fail when that term is
 * dropped, which is the one defect worth catching. This one reads the filters
 * off the URL and applies them, as PostgREST would.
 */
interface Row {
  claim: string
  computed_on: string
  workspace_id: string
}

const WS_A = 'ws-a'
const WS_B = 'ws-b'

const TABLE: Row[] = [
  {
    workspace_id: WS_A,
    claim: 'You have stopped using exclamation marks.',
    computed_on: '2026-08-23',
  },
  {
    workspace_id: WS_A,
    claim: 'You write shorter sentences than you did.',
    computed_on: '2026-08-16',
  },
  {
    workspace_id: WS_B,
    claim: 'A rival business claim that must never leak.',
    computed_on: '2026-08-23',
  },
]

function fakeDb(): { fetchImpl: FetchLike; urls: string[] } {
  const urls: string[] = []
  const fetchImpl: FetchLike = async (input) => {
    const url = new URL(String(input))
    urls.push(url.toString())
    const eq = url.searchParams.get('workspace_id')
    const wanted = eq?.startsWith('eq.') ? eq.slice(3) : null
    const limit = Number(url.searchParams.get('limit') ?? '1000')
    const rows = TABLE.filter((r) => wanted === null || r.workspace_id === wanted)
      .sort((a, b) => b.computed_on.localeCompare(a.computed_on))
      .slice(0, limit)
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fetchImpl, urls }
}

describe('buildMarketMessage', () => {
  it('returns null when nothing has been noticed, so no empty block reaches a prompt', () => {
    expect(buildMarketMessage([])).toBeNull()
  })

  it('tells the model what the claims are for, and forbids the two failure modes', () => {
    const message = buildMarketMessage([
      { claim: 'You have stopped using exclamation marks.', computedOn: '2026-08-23' },
    ])
    expect(message?.content).toContain('You have stopped using exclamation marks.')
    // Repeating Sahoda's analysis to the customer's audience.
    expect(message?.content).toMatch(/do not quote these back/i)
    // Inventing a sixth observation that reads exactly like the five real ones.
    expect(message?.content).toMatch(/has not been measured/i)
  })

  it('is not cache-controlled, because it is rewritten every week', () => {
    const message = buildMarketMessage([{ claim: 'A claim.', computedOn: '2026-08-23' }])
    expect(message?.cache).toBeUndefined()
  })
})

describe('createPostgrestMarketContext', () => {
  it('serves one workspace its own observations', async () => {
    const { fetchImpl } = fakeDb()
    const provider = createPostgrestMarketContext({
      supabaseUrl: 'https://db.test',
      serviceKey: 'service-key',
      fetchImpl,
    })
    const message = await provider.get(WS_A)
    expect(message?.content).toContain('stopped using exclamation marks')
    expect(message?.content).toContain('shorter sentences')
  })

  it('never serves another workspace a word of it', async () => {
    const { fetchImpl } = fakeDb()
    const provider = createPostgrestMarketContext({
      supabaseUrl: 'https://db.test',
      serviceKey: 'service-key',
      fetchImpl,
    })
    const message = await provider.get(WS_A)
    expect(message?.content).not.toContain('must never leak')
  })

  it('filters by workspace in the URL, which is the whole tenant boundary', async () => {
    const { fetchImpl, urls } = fakeDb()
    const provider = createPostgrestMarketContext({
      supabaseUrl: 'https://db.test',
      serviceKey: 'service-key',
      fetchImpl,
    })
    await provider.get(WS_A)
    expect(urls[0]).toContain(`workspace_id=eq.${WS_A}`)
    expect(urls[0]).toContain(`limit=${MARKET_OBSERVATION_LIMIT}`)
  })

  it('returns null for a workspace that has been noticed about nothing', async () => {
    const { fetchImpl } = fakeDb()
    const provider = createPostgrestMarketContext({
      supabaseUrl: 'https://db.test',
      serviceKey: 'service-key',
      fetchImpl,
    })
    expect(await provider.get('ws-empty')).toBeNull()
  })

  it('throws a typed error carrying the status and never the key', async () => {
    const fetchImpl: FetchLike = async () => new Response('nope', { status: 503 })
    const provider = createPostgrestMarketContext({
      supabaseUrl: 'https://db.test',
      serviceKey: 'super-secret-service-key',
      fetchImpl,
    })
    await expect(provider.get(WS_A)).rejects.toBeInstanceOf(MarketContextError)
    await expect(provider.get(WS_A)).rejects.toThrow(/503/)
    await expect(provider.get(WS_A)).rejects.not.toThrow(/super-secret/)
  })
})
