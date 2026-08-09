import { describe, it, expect } from 'vitest'

import {
  classifyPostMetrics,
  lagHoursFromDataDelay,
  INSTAGRAM_INSIGHTS_LAG_HOURS,
  type ClassifyInput,
} from './analytics-state'
import type { ZernioPostAnalytics, ZernioPostAnalyticsResult } from './reads'

const IG_MEDIA_ID = '18104441855596739'
const NOW = new Date('2026-08-08T12:00:00.000Z')

/** Published long enough ago that the reporting window has definitely closed. */
const LONG_AGO = '2026-07-01T09:00:00.000Z'

const answer = (post: ZernioPostAnalytics, status = 200): ZernioPostAnalyticsResult => ({
  status,
  post,
})

const input = (over: Partial<ClassifyInput> = {}): ClassifyInput => ({
  result: answer({ postId: 'p1' }),
  platformPostId: IG_MEDIA_ID,
  published: true,
  publishedAt: LONG_AGO,
  now: NOW,
  ...over,
})

describe('a zero is never presented as a measurement', () => {
  /**
   * The headline rule. Zernio answers 202 with every metric 0 for a post it has
   * accepted but not computed — and for a post asked about with the wrong id, that
   * 202 is permanent. Reading those zeroes as data tells the customer their post
   * reached nobody.
   */
  it('refuses a 202 body full of zeroes', () => {
    const state = classifyPostMetrics(
      input({
        result: answer(
          {
            postId: 'p1',
            analytics: {
              impressions: 0,
              reach: 0,
              likes: 0,
              comments: 0,
              shares: 0,
              saves: 0,
              clicks: 0,
              views: 0,
              lastUpdated: '2026-08-08T11:00:00.000Z',
            },
          },
          202,
        ),
      }),
    )
    expect(state.kind).toBe('pending')
    expect(state).toMatchObject({ reason: 'processing' })
  })

  it('refuses metrics with no lastUpdated, however complete the numbers look', () => {
    const state = classifyPostMetrics(
      input({
        result: answer({
          postId: 'p1',
          // Every field present and plausible — but nothing says it was ever measured.
          analytics: {
            impressions: 900,
            reach: 850,
            likes: 40,
            comments: 3,
            shares: 1,
            saves: 2,
            clicks: 0,
            views: 0,
            lastUpdated: null,
          },
        }),
      }),
    )
    expect(state.kind).toBe('pending')
  })

  it('reports a genuine zero as a measurement when it IS one', () => {
    // A real 200 with a real timestamp. Zero impressions here is a fact, not a gap.
    const state = classifyPostMetrics(
      input({
        result: answer({
          postId: 'p1',
          analytics: {
            impressions: 0,
            reach: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            saves: 0,
            clicks: 0,
            views: 0,
            lastUpdated: '2026-08-06T09:00:00.000Z',
          },
        }),
      }),
    )
    expect(state).toMatchObject({ kind: 'ready' })
    if (state.kind !== 'ready') throw new Error('unreachable')
    expect(state.metrics.impressions).toBe(0)
    expect(state.metrics.engagement).toBe(0)
  })

  it('reports a MISSING field as null rather than 0', () => {
    // The wire body is cast, not validated: a field the type calls a required number
    // can simply be absent, and `undefined` in a number slot renders as a zero.
    const state = classifyPostMetrics(
      input({
        result: answer({
          postId: 'p1',
          analytics: {
            impressions: 412,
            lastUpdated: '2026-08-06T09:00:00.000Z',
          } as never,
        }),
      }),
    )
    if (state.kind !== 'ready') throw new Error('expected ready')
    expect(state.metrics.impressions).toBe(412)
    expect(state.metrics.reach).toBeNull()
    // None of the four interaction components arrived — the sum is a gap, not a 0.
    expect(state.metrics.engagement).toBeNull()
  })

  it('sums only the interaction components that actually arrived', () => {
    const state = classifyPostMetrics(
      input({
        result: answer({
          postId: 'p1',
          analytics: {
            likes: 20,
            comments: 5,
            lastUpdated: '2026-08-06T09:00:00.000Z',
          } as never,
        }),
      }),
    )
    if (state.kind !== 'ready') throw new Error('expected ready')
    expect(state.metrics.engagement).toBe(25)
  })
})

describe('orphaned means unresolvable, not late', () => {
  it('says the metric cannot be resolved and shows no numbers', () => {
    const state = classifyPostMetrics(
      input({
        result: answer({
          postId: 'p1',
          platformAnalytics: [
            {
              platform: 'instagram',
              status: 'published',
              platformPostId: IG_MEDIA_ID,
              syncStatus: 'orphaned',
              errorMessage: 'Account no longer linked',
            },
          ],
          analytics: {
            impressions: 0,
            reach: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            saves: 0,
            clicks: 0,
            views: 0,
            lastUpdated: '2026-08-06T09:00:00.000Z',
          },
        }),
      }),
    )
    expect(state).toMatchObject({ kind: 'unresolved', message: 'Account no longer linked' })
  })

  /**
   * Ordering test. Orphaned is checked BEFORE 202 because a post that is both will
   * never resolve — and "still processing" would promise that it eventually does.
   */
  it('prefers unresolved over processing when a post is both', () => {
    const state = classifyPostMetrics(
      input({
        result: answer(
          {
            postId: 'p1',
            platformAnalytics: [
              {
                platform: 'instagram',
                status: 'published',
                platformPostId: IG_MEDIA_ID,
                syncStatus: 'orphaned',
              },
            ],
          },
          202,
        ),
      }),
    )
    expect(state.kind).toBe('unresolved')
  })

  it('reads the syncStatus of THIS leg, not another channel that happens to be fine', () => {
    const state = classifyPostMetrics(
      input({
        result: answer({
          postId: 'p1',
          platformAnalytics: [
            { platform: 'x', status: 'published', platformPostId: 'tweet-1', syncStatus: 'synced' },
            {
              platform: 'instagram',
              status: 'published',
              platformPostId: IG_MEDIA_ID,
              syncStatus: 'orphaned',
            },
          ],
        }),
      }),
    )
    expect(state.kind).toBe('unresolved')
  })
})

describe('the reporting lag is a first-class state', () => {
  it('says not-available-yet for a post published inside the window', () => {
    const publishedAt = '2026-08-08T06:00:00.000Z' // 6h before NOW, inside the 48h window
    const state = classifyPostMetrics(input({ publishedAt, result: answer({ postId: 'p1' }) }))
    expect(state).toMatchObject({ kind: 'pending', reason: 'lag' })
    if (state.kind !== 'pending') throw new Error('unreachable')
    expect(state.availableAfter).toBe('2026-08-10T06:00:00.000Z')
  })

  it('stops blaming the lag once the window has closed', () => {
    const state = classifyPostMetrics(input({ publishedAt: LONG_AGO }))
    expect(state).toMatchObject({ kind: 'pending', reason: 'never-measured' })
  })

  it('will not promise a time it cannot compute', () => {
    const state = classifyPostMetrics(input({ publishedAt: null }))
    expect(state).toMatchObject({ kind: 'pending', reason: 'never-measured', availableAfter: null })
  })

  it('treats an unparseable publishedAt as unknown rather than throwing', () => {
    const state = classifyPostMetrics(input({ publishedAt: 'not a date' }))
    expect(state).toMatchObject({ kind: 'pending', reason: 'never-measured' })
  })
})

describe('states where no call should have been made at all', () => {
  it.each([
    ['an unpublished channel', { published: false }, 'not-published'],
    ['a published post with no platform id', { platformPostId: null }, 'no-platform-id'],
    ['a call that could not be read', { result: null }, 'unreadable'],
  ])('%s reports %s', (_name, over, reason) => {
    expect(classifyPostMetrics(input(over as Partial<ClassifyInput>))).toEqual({
      kind: 'unavailable',
      reason,
    })
  })

  it('checks published BEFORE the platform id, so a draft never reads as a data gap', () => {
    const state = classifyPostMetrics(input({ published: false, platformPostId: null }))
    expect(state).toMatchObject({ reason: 'not-published' })
  })
})

describe('the platform states its own delay, and it wins', () => {
  it.each([
    ['48 hours', 48],
    ['2 days', 48],
    ['24 hours', 24],
    ['1 day', 24],
  ])('reads %s as %i hours', (given, expected) => {
    expect(lagHoursFromDataDelay(given)).toBe(expected)
  })

  it.each([undefined, '', 'soon', 'a while'])('falls back rather than guessing on %s', (given) => {
    expect(lagHoursFromDataDelay(given as string | undefined)).toBeNull()
  })

  it('uses an injected lag instead of the Instagram default', () => {
    const publishedAt = '2026-08-08T06:00:00.000Z' // 6h before NOW
    // Inside 48h (would be `lag`) but outside a 2h window — so the injected value must win.
    const state = classifyPostMetrics(input({ publishedAt, lagHours: 2 }))
    expect(state).toMatchObject({ reason: 'never-measured' })
    expect(INSTAGRAM_INSIGHTS_LAG_HOURS).toBe(48)
  })
})

/**
 * A simulated run must never be reported as a platform failure.
 *
 * Fixture publishes are indistinguishable from live ones in `publish_status`: both are
 * `published`. Until 2026-08-09 the web read path erased a fixture's id to null before
 * this classifier ever saw it, so a simulated post fell through to `no-platform-id` and
 * the panel told the customer "Instagram didn't return a post id" — blaming a platform
 * that was never contacted. `simulated` is checked BEFORE the id, because a fixture with
 * no id is simulated first and idless second.
 */
describe('a simulated publish says so', () => {
  it('reports simulated rather than no-platform-id when the id was erased', () => {
    const state = classifyPostMetrics(input({ simulated: true, platformPostId: null }))
    expect(state).toEqual({ kind: 'unavailable', reason: 'simulated' })
  })

  it('reports simulated even when a fixture id is carried through', () => {
    const state = classifyPostMetrics(input({ simulated: true, platformPostId: 'fixture-abc' }))
    expect(state).toEqual({ kind: 'unavailable', reason: 'simulated' })
  })

  it('still reports not-published first — nothing went out at all, simulated or not', () => {
    const state = classifyPostMetrics(input({ simulated: true, published: false }))
    expect(state).toEqual({ kind: 'unavailable', reason: 'not-published' })
  })

  it('leaves a live publish untouched', () => {
    const state = classifyPostMetrics(input({ simulated: false }))
    expect(state).not.toEqual({ kind: 'unavailable', reason: 'simulated' })
  })
})
