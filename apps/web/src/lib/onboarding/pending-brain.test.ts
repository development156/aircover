import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD } from '@sahoda/shared'

/**
 * The store is Upstash's REST pipeline, the same one `lib/ops/rate-limit.ts`
 * uses, so the fake here is a fetch that answers `/pipeline` from a Map. What
 * is proven: a saved brain reads back intact and parsed; a value that no
 * longer parses reads as nothing rather than as a half-brain; a cleared key is
 * gone; and with no store configured every call is a silent no-op, which is
 * today's behaviour exactly.
 */

const kv = new Map<string, string>()
const calls: unknown[][] = []

function fakeFetch(_url: string, init?: RequestInit): Promise<Response> {
  const commands = JSON.parse(String(init?.body)) as unknown[][]
  const results = commands.map((command) => {
    calls.push(command)
    const [op, key, value] = command as [string, string, string?]
    if (op === 'SET') {
      kv.set(key, value ?? '')
      return { result: 'OK' }
    }
    if (op === 'GET') return { result: kv.get(key) ?? null }
    if (op === 'DEL') return { result: kv.delete(key) ? 1 : 0 }
    return { result: null }
  })
  return Promise.resolve(new Response(JSON.stringify(results), { status: 200 }))
}

async function load() {
  vi.resetModules()
  return import('./pending-brain')
}

beforeEach(() => {
  kv.clear()
  calls.length = 0
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://kv.test')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'tok')
  vi.stubGlobal('fetch', vi.fn(fakeFetch))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('the pending brain', () => {
  it('reads back exactly the brain that was parked, for the workspace that parked it', async () => {
    const { savePendingBrain, readPendingBrain } = await load()
    await savePendingBrain('ws-1', { brain: DEMO_FALLBACK_PAYLOAD, source: 'resolved' })

    expect(await readPendingBrain('ws-1')).toEqual({
      brain: DEMO_FALLBACK_PAYLOAD,
      source: 'resolved',
    })
    expect(await readPendingBrain('ws-2')).toBeNull()
  })

  it('parks it for a day, not forever', async () => {
    const { savePendingBrain, PENDING_BRAIN_TTL_SECONDS } = await load()
    await savePendingBrain('ws-1', { brain: DEMO_FALLBACK_PAYLOAD, source: 'resolved' })

    const set = calls.find((c) => c[0] === 'SET')
    expect(set).toBeDefined()
    expect(set!.slice(-2)).toEqual(['EX', PENDING_BRAIN_TTL_SECONDS])
    expect(PENDING_BRAIN_TTL_SECONDS).toBe(86_400)
  })

  it('reads a value that no longer parses as NOTHING, never as a partial brain', async () => {
    const { readPendingBrain } = await load()
    kv.set(
      'sahoda:onboarding:pending-brain:ws-1',
      JSON.stringify({ brain: { voice: 'x' }, source: 'resolved' }),
    )

    expect(await readPendingBrain('ws-1')).toBeNull()
  })

  it('is gone once cleared', async () => {
    const { savePendingBrain, readPendingBrain, clearPendingBrain } = await load()
    await savePendingBrain('ws-1', { brain: DEMO_FALLBACK_PAYLOAD, source: 'resolved' })
    await clearPendingBrain('ws-1')

    expect(await readPendingBrain('ws-1')).toBeNull()
  })

  it('does nothing at all without a store, which is exactly the old behaviour', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    const { savePendingBrain, readPendingBrain } = await load()
    await savePendingBrain('ws-1', { brain: DEMO_FALLBACK_PAYLOAD, source: 'resolved' })

    expect(await readPendingBrain('ws-1')).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('reads a store that is down as nothing pending, and does not throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
    )
    const { savePendingBrain, readPendingBrain } = await load()

    await expect(
      savePendingBrain('ws-1', { brain: DEMO_FALLBACK_PAYLOAD, source: 'resolved' }),
    ).resolves.toBeUndefined()
    expect(await readPendingBrain('ws-1')).toBeNull()
  })
})
