import { describe, it, expect } from 'vitest'

import {
  classifyPostMetrics,
  lagHoursFromDataDelay,
  reportingWindowFor,
  INSTAGRAM_INSIGHTS_LAG_HOURS,
  UNKNOWN_WINDOW,
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
  // A real publish by default — a fixture is the exception a test must ask for.
  simulated: false,
  publishedAt: LONG_AGO,
  now: NOW,
  // Instagram by default — it is the only channel whose window this repo knows,
  // and every pre-existing test above was written against its 48 hours.
  window: reportingWindowFor('instagram'),
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
    const state = classifyPostMetrics(
      input({ publishedAt, window: { known: true, lagHours: 2 } }),
    )
    expect(state).toMatchObject({ reason: 'never-measured' })
    expect(INSTAGRAM_INSIGHTS_LAG_HOURS).toBe(48)
  })
})

/**
 * ── THE CARDED GAP ───────────────────────────────────────────────────────────
 * `lagHours` shipped OPTIONAL, defaulting to Instagram's 48. `listPostMetrics`
 * never passed one, so every channel was measured against Instagram's window —
 * wrong the moment a non-Instagram post publishes, and one did: a LinkedIn post
 * went out 2026-08-10T12:06Z on the live account.
 *
 * The naive repair — a per-channel number, `{ instagram: 48, linkedin: 0, … }` —
 * is worse than the bug. `lagHours` does not only decide the DATE shown; it is
 * the gate on rule 6a, which fires only on `reason === 'lag'`. Give LinkedIn a
 * window of 0 and an all-zero LinkedIn payload stops being demoted and falls
 * through to `ready`, rendering "0 impressions" under a poll stamp. That trades a
 * false promise for a fabricated zero, and the fabricated zero is the failure
 * this whole module exists to prevent.
 *
 * Nothing in this repo — and nothing in the post payload, which carries no
 * `dataDelay` (verified live 2026-08-11, all 8 posts) — states a post-level
 * window for x, gbp or linkedin. So the window is modelled as UNKNOWN rather
 * than guessed, and an unknown window is not permitted to justify a zero.
 */
describe('a channel whose reporting window we do not know', () => {
  const allZero = {
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
  }

  it('names x, gbp and linkedin as unknown, and instagram as known', () => {
    expect(reportingWindowFor('instagram')).toEqual({ known: true, lagHours: 48 })
    for (const channel of ['x', 'gbp', 'linkedin'] as const) {
      expect(reportingWindowFor(channel)).toEqual(UNKNOWN_WINDOW)
    }
  })

  /**
   * The test that discriminates every candidate fix.
   *
   * A per-channel-number fix passes the "wrong date" test below and FAILS this
   * one, because it lets the zero through to `ready`.
   */
  it('never calls an all-zero payload measured, at any age', () => {
    for (const publishedAt of ['2026-08-08T11:59:00.000Z', LONG_AGO]) {
      const state = classifyPostMetrics(
        input({ publishedAt, window: UNKNOWN_WINDOW, result: answer(allZero) }),
      )
      expect(state).toEqual({
        kind: 'pending',
        reason: 'unknown-window',
        availableAfter: null,
      })
    }
  })

  /** No window, no date. A promise built on Instagram's constant is a fabrication. */
  it('never promises a date derived from another platform’s window', () => {
    const state = classifyPostMetrics(
      input({
        publishedAt: '2026-08-08T06:00:00.000Z',
        window: UNKNOWN_WINDOW,
        result: answer(allZero),
      }),
    )
    expect(state).not.toMatchObject({ reason: 'lag' })
    if (state.kind !== 'pending') throw new Error('expected pending')
    expect(state.availableAfter).toBeNull()
  })

  /**
   * The mirror failure. Not knowing the window is a reason to withhold a ZERO,
   * never a reason to withhold data. Nothing fabricates a 61.
   */
  it('still shows real numbers, which no poll can invent', () => {
    const state = classifyPostMetrics(
      input({
        window: UNKNOWN_WINDOW,
        result: answer({
          postId: 'p1',
          analytics: {
            impressions: 61,
            reach: 36,
            likes: 0,
            comments: 1,
            shares: 0,
            saves: 0,
            clicks: 0,
            views: 0,
            lastUpdated: '2026-08-11 12:53:43',
          },
        }),
      }),
    )
    expect(state.kind).toBe('ready')
    if (state.kind !== 'ready') return
    expect(state.metrics.impressions).toBe(61)
  })

  /**
   * Nothing synced at all is decisive on its own: it is not "we can't tell", it
   * is "nothing has been reported". True whether or not we know the window, so
   * it keeps the plainer word rather than borrowing `unknown-window`.
   */
  it('says never-measured when nothing was synced at all', () => {
    const state = classifyPostMetrics(
      input({ window: UNKNOWN_WINDOW, result: answer({ postId: 'p1' }) }),
    )
    expect(state).toMatchObject({ kind: 'pending', reason: 'never-measured' })
  })

  it('leaves a known window behaving exactly as it did', () => {
    const state = classifyPostMetrics(
      input({
        publishedAt: '2026-08-08T06:00:00.000Z',
        window: reportingWindowFor('instagram'),
        result: answer(allZero),
      }),
    )
    expect(state).toMatchObject({ kind: 'pending', reason: 'lag' })
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

/**
 * RECORDED FROM THE LIVE API on 2026-08-10, account `testingg53`.
 *
 * These four bodies are not authored — they are files under `fixtures/zernio/`, captured
 * off the live endpoint and imported verbatim. That distinction is the point of them.
 * Every test above this line was written against a payload we CONSTRUCTED, so it could
 * only ever confirm what its author already believed `/analytics` returns. These were
 * written against what it actually returned, and the two disagree on the single field
 * the classifier trusts most.
 *
 * See `fixtures/zernio/README.md` — those files must be re-captured, never edited.
 */
import measured from '../../fixtures/zernio/analytics.post.measured.json'
import zeroed from '../../fixtures/zernio/analytics.post.zeroed-in-window.json'
import zeroed2 from '../../fixtures/zernio/analytics.post.zeroed-in-window.2.json'
import zeroed3 from '../../fixtures/zernio/analytics.post.zeroed-in-window.3.json'

/** The sweep these four were captured in. */
const SWEEP = new Date('2026-08-10T09:52:00.000Z')

const recorded = (fixture: { status: number; body: unknown }): ZernioPostAnalyticsResult => ({
  status: fixture.status,
  post: fixture.body as ZernioPostAnalytics,
})

describe('a sync stamp is not a measurement (recorded 2026-08-10)', () => {
  /**
   * THE PREMISE, DISPROVED BY THE RECORDINGS THEMSELVES.
   *
   * Rule 6 used to hold that `lastUpdated` was "the only proof a measurement happened".
   * These four posts were published 17h, 41m, 36m and 26m before the sweep — and every
   * one came back carrying the same stamp. A timestamp identical across posts published
   * seventeen hours apart records when Zernio last POLLED, not when each was measured.
   *
   * No single fixture can show this; it is a fact about the relationship between four,
   * which is why all four are kept.
   */
  it('is the same stamp on every post in the sweep, whatever their age', () => {
    const stamps = [measured, zeroed, zeroed2, zeroed3].map(
      (f) => (f.body as ZernioPostAnalytics).analytics?.lastUpdated,
    )

    expect(new Set(stamps).size).toBe(1)
    expect(stamps[0]).toBe('2026-08-10 09:38:57')
    // And it is not ISO-8601, which is what `measuredAt` promises its consumers.
    expect(stamps[0]).not.toMatch(/T|Z|[+-]\d{2}:\d{2}$/)
  })

  /**
   * Media 18057499664685525, published 09:11 — 41 minutes before the sweep, against
   * Instagram's 48-hour reporting window. Every metric came back 0 with `lastUpdated`
   * set, and the classifier called it `ready`: three of the four live posts rendered
   * "Impressions 0 · Reach 0 · Engagement 0" as though someone had measured them.
   */
  it('does not call an all-zero payload measured while the window is still open', () => {
    const state = classifyPostMetrics({
      result: recorded(zeroed),
      platformPostId: '18057499664685525',
      published: true,
      simulated: false,
      publishedAt: '2026-08-10T09:11:19.293Z',
      now: SWEEP,
      window: reportingWindowFor('instagram'),
    })

    expect(state).toEqual({
      kind: 'pending',
      reason: 'lag',
      // 09:11:19 + 48h. The customer is told when to come back, not told zero.
      availableAfter: '2026-08-12T09:11:19.293Z',
    })
  })

  /**
   * Media 18277022635290264, published 2026-08-09 16:42 — 17h before the sweep, so
   * also inside the window, but it reported impressions 2 / reach 1 / comments 2.
   *
   * The gate must not swallow this. Nothing fabricates a 2, so an early non-zero
   * reading is a real reading, and demoting it to "check back later" would hide data
   * the customer has — the opposite failure, and just as dishonest.
   */
  it('still shows real numbers that arrive early', () => {
    const state = classifyPostMetrics({
      result: recorded(measured),
      platformPostId: '18277022635290264',
      published: true,
      simulated: false,
      publishedAt: '2026-08-09T16:42:14.332Z',
      now: SWEEP,
      window: reportingWindowFor('instagram'),
    })

    expect(state.kind).toBe('ready')
    if (state.kind !== 'ready') return
    expect(state.metrics.impressions).toBe(2)
    expect(state.metrics.reach).toBe(1)
    expect(state.metrics.engagement).toBe(2)
    expect(state.metrics.engagementRate).toBe(100)
  })

  /**
   * Past the window, a zero is a real answer: the post has had its 48 hours and
   * Instagram measured nothing. THAT is a measurement of nothing, and it is allowed —
   * the rule is "never a zero we cannot justify", not "never a zero".
   */
  it('allows an all-zero reading once the window has closed', () => {
    const state = classifyPostMetrics({
      result: recorded(zeroed),
      platformPostId: '18057499664685525',
      published: true,
      simulated: false,
      publishedAt: LONG_AGO,
      now: SWEEP,
      window: reportingWindowFor('instagram'),
    })

    expect(state.kind).toBe('ready')
    if (state.kind !== 'ready') return
    expect(state.metrics.impressions).toBe(0)
  })

  /**
   * `measuredAt` is typed and documented as ISO-8601 and is handed to `new Date(...)`
   * by the copy layer. Zernio's `2026-08-10 09:38:57` is neither ISO nor zoned: V8
   * reads it as LOCAL time, so the "Last updated" line silently shifts by the server's
   * offset, and Safari refuses it outright. Normalise at the boundary.
   */
  it('normalises the sync stamp to ISO-8601 UTC', () => {
    const state = classifyPostMetrics({
      result: recorded(measured),
      platformPostId: '18277022635290264',
      published: true,
      simulated: false,
      publishedAt: LONG_AGO,
      now: SWEEP,
      window: reportingWindowFor('instagram'),
    })

    expect(state.kind).toBe('ready')
    if (state.kind !== 'ready') return
    expect(state.metrics.measuredAt).toBe('2026-08-10T09:38:57Z')
    expect(Number.isNaN(new Date(state.metrics.measuredAt).getTime())).toBe(false)
  })
})
