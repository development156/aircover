import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD } from '@sahoda/shared'

/**
 * ONE NULL, THREE MEANINGS, and one of them was "free".
 *
 * `activeBrandMemory` answered `null` for "no brain", "the payload no longer
 * parses" and "the read did not happen". `onboarding-resolve.ts` routes the
 * free/charged decision on that answer, so a Supabase error on one request
 * turned a 50-credit resolve into a free model call. This file pins the split:
 * a failed read is `unreadable`, an empty read is `none`, and only `none` may
 * ever be treated as the free one.
 */

const state = vi.hoisted(() => ({
  response: { data: null as unknown, error: null as null | { code: string; message: string } },
  throwOnRead: false,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (state.throwOnRead) throw new Error('fetch failed')
              return state.response
            },
          }),
        }),
      }),
    }),
  }),
}))

const { activeBrandMemory, isFirstResolve, readActiveBrandMemory } = await import('./read-brain')

const ROW = {
  payload: DEMO_FALLBACK_PAYLOAD,
  version: 3,
  source: 'resolved',
  updated_at: '2026-09-01T00:00:00Z',
}

beforeEach(() => {
  state.response = { data: null, error: null }
  state.throwOnRead = false
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('readActiveBrandMemory', () => {
  it('a saved brain is ok, with its version for the ledger key', async () => {
    state.response = { data: ROW, error: null }
    const read = await readActiveBrandMemory('ws-1')
    expect(read.status).toBe('ok')
    if (read.status === 'ok') expect(read.brain.version).toBe(3)
  })

  it('no row is none, which is the only arm the free resolve may take', async () => {
    expect(await readActiveBrandMemory('ws-1')).toEqual({ status: 'none' })
    expect(await isFirstResolve('ws-1')).toBe(true)
  })

  // THE DEFECT. A query error is not a workspace with no brain.
  it('a query error is unreadable, never none', async () => {
    state.response = { data: null, error: { code: '57P01', message: 'terminating connection' } }
    expect(await readActiveBrandMemory('ws-1')).toEqual({ status: 'unreadable' })
    expect(await isFirstResolve('ws-1')).toBe(false)
  })

  it('a thrown read is unreadable, never none', async () => {
    state.throwOnRead = true
    expect(await readActiveBrandMemory('ws-1')).toEqual({ status: 'unreadable' })
    expect(await isFirstResolve('ws-1')).toBe(false)
  })

  it('a payload that no longer parses degrades to none, so the flow runs again', async () => {
    state.response = { data: { ...ROW, payload: { not: 'a brain' } }, error: null }
    expect(await readActiveBrandMemory('ws-1')).toEqual({ status: 'none' })
  })
})

describe('activeBrandMemory, the lossy view', () => {
  it('returns the brain on ok and null on both other arms', async () => {
    state.response = { data: ROW, error: null }
    expect((await activeBrandMemory('ws-1'))?.version).toBe(3)
    state.response = { data: null, error: { code: 'x', message: 'y' } }
    expect(await activeBrandMemory('ws-1')).toBeNull()
  })
})
