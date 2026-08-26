import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { PublishedPost } from './observe/tone-drift'

/**
 * THE PASS'S BOOKKEEPING, which is the part an operator reads.
 *
 * `tone-drift.test.ts` proves what the arithmetic says. This proves the run
 * REPORTS honestly: that a workspace which produced nothing is counted under the
 * reason it produced nothing rather than folded into a silent total, that one
 * workspace's failure does not end the pass for the rest, and that a re-run is
 * reported as a refresh rather than as new work. "18 workspaces produced
 * nothing" and "18 had too few posts" are the same run and two different
 * conclusions about whether the job is broken.
 */

const store = vi.hoisted(() => ({
  workspaces: [] as string[],
  postsBy: new Map<string, PublishedPost[]>(),
  saved: [] as Array<{ workspaceId: string; claim: string; computedOn: string }>,
  inserted: true,
  throwFor: new Set<string>(),
}))

vi.mock('./store', () => ({
  workspacesWithPublishedPosts: async () => store.workspaces,
  readPublishedPosts: async (workspaceId: string) => {
    if (store.throwFor.has(workspaceId)) throw new Error('read failed')
    return store.postsBy.get(workspaceId) ?? []
  },
  saveObservation: async (
    workspaceId: string,
    observation: { claim: string; computedOn: string },
  ) => {
    store.saved.push({
      workspaceId,
      claim: observation.claim,
      computedOn: observation.computedOn,
    })
    return { inserted: store.inserted }
  },
}))

vi.mock('@/lib/observability/report', () => ({ reportServerError: () => {} }))

const { runMarketingBrainPass } = await import('./run')

/** Five loud then five quiet, spread far enough apart to clear the span gate. */
function drifter(prefix: string): PublishedPost[] {
  const make = (bodies: string[], month: string) =>
    bodies.map((body, i) => ({
      id: `${prefix}0000-0000-4000-8000-${String(i).padStart(12, '0')}`.slice(-36),
      body,
      publishedOn: `2026-${month}-0${i + 1}`,
    }))
  return [
    ...make(['A!', 'B!', 'C!', 'D!', 'E!'], '01'),
    ...make(['A.', 'B.', 'C.', 'D.', 'E.'], '03'),
  ]
}

describe('runMarketingBrainPass', () => {
  beforeEach(() => {
    store.workspaces = []
    store.postsBy = new Map()
    store.saved = []
    store.inserted = true
    store.throwFor = new Set()
  })

  it('writes one observation for a workspace whose voice moved', async () => {
    store.workspaces = ['ws-a']
    store.postsBy.set('ws-a', drifter('a'))

    const result = await runMarketingBrainPass(new Date('2026-03-08T00:00:00Z'))

    expect(result.inserted).toBe(1)
    expect(result.refreshed).toBe(0)
    expect(store.saved[0]?.claim).toContain('stopped using exclamation marks')
  })

  it('stamps the day the pass ran, in UTC, whatever hour it fired', async () => {
    store.workspaces = ['ws-a']
    store.postsBy.set('ws-a', drifter('a'))

    // Late enough in UTC that a local-time conversion anywhere east of Greenwich
    // would land on the 9th. The column is a calendar day and a gap in it is
    // read as a gap in the schedule, so a drifting stamp is a false alarm.
    await runMarketingBrainPass(new Date('2026-03-08T23:45:00Z'))

    expect(store.saved[0]?.computedOn).toBe('2026-03-08')
  })

  it('counts a re-run as a refresh, not as new work', async () => {
    store.workspaces = ['ws-a']
    store.postsBy.set('ws-a', drifter('a'))
    store.inserted = false

    const result = await runMarketingBrainPass(new Date('2026-03-08T00:00:00Z'))

    expect(result.inserted).toBe(0)
    expect(result.refreshed).toBe(1)
  })

  it('names the reason a workspace produced nothing', async () => {
    store.workspaces = ['ws-quiet', 'ws-new']
    store.postsBy.set('ws-quiet', [])
    store.postsBy.set('ws-new', drifter('b').slice(0, 4))

    const result = await runMarketingBrainPass(new Date('2026-03-08T00:00:00Z'))

    expect(result.inserted).toBe(0)
    // Two workspaces, two DIFFERENT reasons. A single "produced nothing: 2"
    // reads as a broken job; these two read as a product waiting for data.
    expect(result.declined).toEqual({ no_posts: 1, window_too_short: 1 })
  })

  it('keeps going when one workspace throws, and counts it apart from a decline', async () => {
    store.workspaces = ['ws-broken', 'ws-a']
    store.throwFor.add('ws-broken')
    store.postsBy.set('ws-a', drifter('a'))

    const result = await runMarketingBrainPass(new Date('2026-03-08T00:00:00Z'))

    expect(result.failed).toBe(1)
    expect(result.inserted).toBe(1)
    // "we could not look" is not "we looked and there was nothing".
    expect(result.declined).toEqual({})
  })

  it('reports the workspaces it considered, so a pass over none is visible', async () => {
    const result = await runMarketingBrainPass(new Date('2026-03-08T00:00:00Z'))
    expect(result).toEqual({
      workspaces: 0,
      inserted: 0,
      refreshed: 0,
      declined: {},
      failed: 0,
    })
  })
})
