import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { ChannelOutcome } from './observe/channel-return'
import type { CapturedPost } from './observe/edit-distance'
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

/** Two channels, one plainly ahead, spread wide enough to clear the window. */
function winner(seed: string): ChannelOutcome[] {
  const rows: ChannelOutcome[] = []
  for (const [channel, engagement] of [
    ['linkedin', 20],
    ['instagram', 2],
  ] as const) {
    for (let i = 0; i < 5; i += 1) {
      rows.push({
        postId: `00000000-0000-4000-8000-${seed}${channel[0]}${String(i).padStart(10, '0')}`,
        channel,
        engagement,
        reach: 100,
        measuredOn: new Date(Date.UTC(2026, 1, 1 + i * 7)).toISOString().slice(0, 10),
      })
    }
  }
  return rows
}

const store = vi.hoisted(() => ({
  workspaces: [] as string[],
  postsBy: new Map<string, PublishedPost[]>(),
  capturedBy: new Map<string, CapturedPost[]>(),
  capturedWorkspaces: [] as string[],
  metricWorkspaces: [] as string[],
  outcomesBy: new Map<string, ChannelOutcome[]>(),
  saved: [] as Array<{ workspaceId: string; claim: string; computedOn: string }>,
  inserted: true,
  throwFor: new Set<string>(),
}))

vi.mock('./store', () => ({
  workspacesWithPublishedPosts: async () => store.workspaces,
  // Empty by default, so every existing case below exercises exactly what it
  // used to and the edit-distance computer simply declines beside it.
  workspacesWithCapturedDrafts: async () => store.capturedWorkspaces,
  readPublishedPosts: async (workspaceId: string) => {
    if (store.throwFor.has(workspaceId)) throw new Error('read failed')
    return store.postsBy.get(workspaceId) ?? []
  },
  readCapturedPosts: async (workspaceId: string) => {
    if (store.throwFor.has(workspaceId)) throw new Error('read failed')
    return store.capturedBy.get(workspaceId) ?? []
  },
  // Empty by default for the same reason as the drafts list above: every case
  // written before this computer existed keeps exercising exactly what it did,
  // and channel-return declines beside them rather than changing their counts.
  workspacesWithChannelMetrics: async () => store.metricWorkspaces,
  readChannelOutcomes: async (workspaceId: string) => {
    if (store.throwFor.has(workspaceId)) throw new Error('read failed')
    return store.outcomesBy.get(workspaceId) ?? []
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

/** Ten drafted posts: heavily rewritten early, barely touched lately. */
function improver(prefix: string): CapturedPost[] {
  const draft = 'a'.repeat(100)
  const make = (share: number, month: string, from: number) =>
    Array.from({ length: 5 }, (_, i) => ({
      id: `${prefix}0000-0000-4000-8000-${String(from + i).padStart(12, '0')}`.slice(-36),
      generatedBody: draft,
      body: 'b'.repeat(share) + 'a'.repeat(100 - share),
      createdOn: `2026-${month}-0${i + 1}`,
    }))
  return [...make(60, '01', 0), ...make(5, '03', 5)]
}

describe('runMarketingBrainPass', () => {
  beforeEach(() => {
    store.workspaces = []
    store.postsBy = new Map()
    store.capturedBy = new Map()
    store.capturedWorkspaces = []
    store.metricWorkspaces = []
    store.outcomesBy = new Map()
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
    // Two workspaces, two DIFFERENT tone reasons, and both also decline the
    // edit-distance computer because neither has a captured draft. The prefixes
    // are what keep those four facts apart: without them the two computers'
    // `window_too_short` would add together into one number meaning neither.
    expect(result.declined).toEqual({
      'tone_drift:no_posts': 1,
      'tone_drift:window_too_short': 1,
      'edit_distance:no_captured_drafts': 2,
      'channel_return:no_metrics': 2,
    })
  })

  it('keeps going when one workspace throws, and counts it apart from a decline', async () => {
    store.workspaces = ['ws-broken', 'ws-a']
    store.throwFor.add('ws-broken')
    store.postsBy.set('ws-a', drifter('a'))

    const result = await runMarketingBrainPass(new Date('2026-03-08T00:00:00Z'))

    expect(result.failed).toBe(1)
    expect(result.inserted).toBe(1)
    // "we could not look" is not "we looked and there was nothing". The broken
    // workspace contributes NOTHING to `declined` - both entries belong to
    // ws-a, which was read successfully and has neither a captured draft nor a
    // measured outcome. If the throw were folded in, each count would be 2 and
    // the failure would be invisible.
    expect(result.declined).toEqual({
      'edit_distance:no_captured_drafts': 1,
      'channel_return:no_metrics': 1,
    })
  })

  it('runs the edit-distance computer too, and saves what it finds', async () => {
    // The seam test. Both computers live behind one pass, and a wiring that
    // reads the captured posts but never calls the computer would leave every
    // other test here green while the feature produced nothing forever.
    store.capturedWorkspaces = ['ws-c']
    store.capturedBy.set('ws-c', improver('c'))

    const result = await runMarketingBrainPass(new Date('2026-03-08T00:00:00Z'))

    expect(result.inserted).toBe(1)
    expect(store.saved[0]?.claim).toMatch(/changing less of what Sahoda drafts/i)
  })

  it('considers a workspace that has drafts but has published nothing', async () => {
    // `workspacesWithPublishedPosts` would not return this one. If the runner
    // took that list alone instead of the union, this workspace would never be
    // looked at and the count would read 0 with nothing saying why.
    store.workspaces = []
    store.capturedWorkspaces = ['ws-d']
    store.capturedBy.set('ws-d', improver('d'))

    const result = await runMarketingBrainPass(new Date('2026-03-08T00:00:00Z'))

    expect(result.workspaces).toBe(1)
    expect(result.inserted).toBe(1)
  })

  it('counts a workspace once when both lists name it', async () => {
    store.workspaces = ['ws-a']
    store.capturedWorkspaces = ['ws-a']
    store.postsBy.set('ws-a', drifter('a'))
    store.capturedBy.set('ws-a', improver('a'))

    const result = await runMarketingBrainPass(new Date('2026-03-08T00:00:00Z'))

    expect(result.workspaces).toBe(1)
    // Both computers produced something for the one workspace.
    expect(result.inserted).toBe(2)
  })

  it('runs the channel-return computer too, and saves what it finds', async () => {
    store.workspaces = ['ws-a']
    store.outcomesBy.set('ws-a', winner('a'))

    const result = await runMarketingBrainPass(new Date('2026-03-08T00:00:00Z'))

    expect(result.inserted).toBe(1)
    expect(store.saved[0]?.claim).toContain('earn more attention per reader')
  })

  it('considers a workspace known only by its measured outcomes', async () => {
    // Not in `workspaces` and not in `capturedWorkspaces`, so without the third
    // list in the union this workspace is never visited and its metrics are
    // invisible. The union is what makes a connected account enough.
    store.metricWorkspaces = ['ws-metrics-only']
    store.outcomesBy.set('ws-metrics-only', winner('m'))

    const result = await runMarketingBrainPass(new Date('2026-03-08T00:00:00Z'))

    expect(result.workspaces).toBe(1)
    expect(result.inserted).toBe(1)
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
