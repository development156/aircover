import { describe, it, expect } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD } from '@sahoda/shared'
import { buildBrandMessage, createPostgrestBrandContext, BrandContextError } from './brand-context'
import type { FetchLike } from './providers/types'

const payload = DEMO_FALLBACK_PAYLOAD

function fetchReturning(rows: unknown, status = 200): { fetchImpl: FetchLike; calls: string[] } {
  const calls: string[] = []
  const fetchImpl: FetchLike = async (url) => {
    calls.push(url)
    return new Response(JSON.stringify(rows), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fetchImpl, calls }
}

const opts = (fetchImpl: FetchLike) => ({
  supabaseUrl: 'https://x.supabase.co',
  serviceKey: 'svc',
  fetchImpl,
})

describe('buildBrandMessage', () => {
  it('is a cache-controlled system prefix grounded in the brand', () => {
    const msg = buildBrandMessage(payload)
    expect(msg.role).toBe('system')
    expect(msg.cache).toBe(true)
    expect(msg.content).toContain(payload.brand_persona.archetype)
    expect(msg.content).toContain(payload.voice.signature_phrases[0]!)
  })

  it('renders a grounding block, not a JSON restatement', () => {
    expect(buildBrandMessage(payload).content).not.toContain('"voice"')
  })
})

describe('createPostgrestBrandContext', () => {
  it('fetches the active brand_memory and returns the versioned prefix', async () => {
    const { fetchImpl, calls } = fetchReturning([{ version: 3, payload }])
    const ctx = await createPostgrestBrandContext(opts(fetchImpl)).get('ws-1')
    expect(ctx?.version).toBe(3)
    expect(ctx?.message).toEqual(buildBrandMessage(payload))
    expect(calls[0]).toContain('/rest/v1/brand_memory')
    expect(calls[0]).toContain('status=eq.active')
    expect(calls[0]).toContain('ws-1')
  })

  it('returns null when no active brain exists', async () => {
    const { fetchImpl } = fetchReturning([])
    expect(await createPostgrestBrandContext(opts(fetchImpl)).get('ws-1')).toBeNull()
  })

  it('caches the built prefix by version (same version → same reference)', async () => {
    const { fetchImpl } = fetchReturning([{ version: 1, payload }])
    const bc = createPostgrestBrandContext(opts(fetchImpl))
    const a = await bc.get('ws-1')
    const b = await bc.get('ws-1')
    expect(a!.message).toBe(b!.message)
  })

  it('throws BrandContextError on a non-ok response', async () => {
    const { fetchImpl } = fetchReturning('boom', 500)
    await expect(createPostgrestBrandContext(opts(fetchImpl)).get('ws-1')).rejects.toBeInstanceOf(
      BrandContextError,
    )
  })

  it('treats a malformed active payload as no usable brain (boundary validation)', async () => {
    const { fetchImpl } = fetchReturning([{ version: 1, payload: { nope: true } }])
    expect(await createPostgrestBrandContext(opts(fetchImpl)).get('ws-1')).toBeNull()
  })
})
