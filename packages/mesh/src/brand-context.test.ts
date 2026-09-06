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

/**
 * BR-15. The prefix used to carry every field with equal weight, so "Sahoda
 * writes from your answers, not its guesses" was a claim about storage and not
 * about the prompt. The owner's confirmations now reach the model.
 */
describe('buildBrandMessage — what the owner stood behind', () => {
  it('names the confirmed fields and marks the rest as Sahoda’s draft', () => {
    const meta = {
      'hook.core_promise': { kind: 'asked', confirmed: true, source: 'owner' },
      'taboo.red_lines': { kind: 'asked', confirmed: false, source: 'intake' },
      'voice.descriptor': {
        kind: 'negotiated',
        confirmed: false,
        source: 'model:brand_guidelines',
      },
    }
    const content = buildBrandMessage(payload, meta).content
    expect(content).toMatch(/confirmed by the owner[^\n]*hook\.core_promise/i)
    expect(content).toMatch(/own words[^\n]*taboo\.red_lines/i)
    expect(content).toMatch(/draft/i)
  })

  it('says plainly when nothing is confirmed yet', () => {
    const content = buildBrandMessage(payload, {}).content
    expect(content).toMatch(/none[^\n]*confirmed|not confirmed/i)
  })

  it('without meta the block is unchanged in shape', () => {
    expect(buildBrandMessage(payload).content).not.toMatch(/confirmed/i)
  })
})

describe('createPostgrestBrandContext — field_meta reaches the prefix', () => {
  it('reads field_meta off the raw row before the schema strips it', async () => {
    const row = {
      version: 5,
      payload: {
        ...payload,
        field_meta: { 'hook.core_promise': { kind: 'asked', confirmed: true, source: 'owner' } },
      },
    }
    const { fetchImpl } = fetchReturning([row])
    const ctx = await createPostgrestBrandContext(opts(fetchImpl)).get('ws-1')
    expect(ctx?.message.content).toMatch(/hook\.core_promise/)
  })
})

describe('buildBrandMessage — the accepted learning reaches the prompt', () => {
  it('renders alignment.note so a Loop learning is not written to a field no prompt reads', () => {
    const withNote = {
      ...payload,
      alignment: { ...payload.alignment, note: 'LinkedIn is currently your strongest channel.' },
    }
    const content = buildBrandMessage(withNote).content
    expect(content).toContain('What is working now: LinkedIn is currently your strongest channel.')
  })

  it('omits the line when there is no note, so an empty brain says nothing extra', () => {
    const noNote = { ...payload, alignment: { ...payload.alignment, note: '' } }
    expect(buildBrandMessage(noNote).content).not.toContain('What is working now')
  })
})
