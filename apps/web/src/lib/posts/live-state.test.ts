import { describe, expect, it } from 'vitest'

import {
  assembleSnapshot,
  cadenceFor,
  isDueSoon,
  isInFlight,
  LIVE_INTERVAL_MS,
  MAX_WAKE_MS,
  msUntilNextWatch,
  WATCHING_INTERVAL_MS,
  WATCH_CAP_MS,
  type PostLiveState,
} from './live-state'
import type { VariantStatusRow } from './variant-status'

const NOW = new Date('2026-08-11T12:00:00.000Z')
const POST_ID = '11111111-1111-4111-8111-111111111111'

const variant = (over: Partial<VariantStatusRow> = {}): VariantStatusRow => ({
  channel: 'instagram',
  status: 'pending',
  permalink: null,
  platformPostId: null,
  simulated: false,
  errorMessage: null,
  errorCode: null,
  gateRefusal: null,
  retryable: true,
  ...over,
})

const post = (over: Partial<PostLiveState> = {}): PostLiveState => ({
  postId: POST_ID,
  status: 'draft',
  scheduledAt: null,
  mode: null,
  variants: [],
  ...over,
})

describe('cadenceFor — what the poll is allowed to cost', () => {
  it('does not poll at all when nothing can move on its own', () => {
    // Arrange — a draft. No cron will touch it; only the writer can.
    const posts = [post({ status: 'draft' })]

    // Act
    const cadence = cadenceFor(posts, NOW, 0, true)

    // Assert — `null` means no timer is armed. An idle posts list must cost
    // exactly what a static page costs, because that is what it is.
    expect(cadence).toEqual({ phase: 'idle', intervalMs: null })
  })

  it('does not poll behind a hidden tab, even mid-publish', () => {
    // The single biggest saving, and the easiest to leave out. Nobody is reading
    // the tab, so there is nothing for a live update to be live for.
    const posts = [post({ status: 'publishing' })]

    expect(cadenceFor(posts, NOW, 0, false)).toEqual({ phase: 'idle', intervalMs: null })
  })

  it('polls fast while a post is publishing', () => {
    expect(cadenceFor([post({ status: 'publishing' })], NOW, 0, true)).toEqual({
      phase: 'live',
      intervalMs: LIVE_INTERVAL_MS,
    })
  })

  it('polls fast while any single CHANNEL is publishing, whatever the post says', () => {
    // A partly-published post can sit at `partial` with one channel still going.
    // Reading only the post status would stop watching the channel that is live.
    const posts = [
      post({
        status: 'partial',
        variants: [
          variant({ status: 'published' }),
          variant({ status: 'publishing', channel: 'x' }),
        ],
      }),
    ]

    expect(cadenceFor(posts, NOW, 0, true).phase).toBe('live')
  })

  it('polls slowly for a scheduled post that is due, and not fast', () => {
    const posts = [post({ status: 'scheduled', scheduledAt: NOW.toISOString() })]

    // 30s against a five-minute cron already over-samples the thing being waited
    // on by a factor of ten. Faster would buy nothing and cost every open tab.
    expect(cadenceFor(posts, NOW, 0, true)).toEqual({
      phase: 'watching',
      intervalMs: WATCHING_INTERVAL_MS,
    })
  })

  it('does not poll for a post scheduled far in the future', () => {
    const posts = [post({ status: 'scheduled', scheduledAt: '2026-08-12T12:00:00.000Z' })]

    expect(cadenceFor(posts, NOW, 0, true).intervalMs).toBeNull()
  })

  it('STOPS after the cap rather than watching a stuck row forever', () => {
    // `PUBLISH_LEASE_SECONDS` is 600, so a variant genuinely mid-publish is
    // released by the sweep well inside this. Past it, the row is not coming
    // back and an unattended tab must not poll until the laptop dies.
    const posts = [post({ status: 'publishing' })]

    expect(cadenceFor(posts, NOW, WATCH_CAP_MS, true)).toEqual({
      phase: 'paused',
      intervalMs: null,
    })
  })

  it('says PAUSED rather than idle when it gives up, because they mean different things', () => {
    // `idle` is "nothing is happening". `paused` is "something is happening and
    // we stopped looking". Collapsing them would let the UI show a stuck publish
    // as a quiet, settled post.
    const stuck = cadenceFor([post({ status: 'publishing' })], NOW, WATCH_CAP_MS, true)
    const quiet = cadenceFor([post({ status: 'draft' })], NOW, WATCH_CAP_MS, true)

    expect(stuck.phase).toBe('paused')
    expect(quiet.phase).toBe('idle')
  })
})

describe('isDueSoon', () => {
  it('treats an unparseable scheduled_at as NOT due', () => {
    // Guessing would arm a timer on a row nothing is going to touch.
    expect(isDueSoon(post({ status: 'scheduled', scheduledAt: 'not a date' }), NOW)).toBe(false)
  })

  it('ignores a schedule on a post that is not scheduled', () => {
    expect(isDueSoon(post({ status: 'published', scheduledAt: NOW.toISOString() }), NOW)).toBe(
      false,
    )
  })
})

describe('isInFlight', () => {
  it('is false for a post whose channels are all finished', () => {
    const finished = post({
      status: 'published',
      variants: [variant({ status: 'published' }), variant({ status: 'failed', channel: 'x' })],
    })

    expect(isInFlight(finished)).toBe(false)
  })
})

describe('assembleSnapshot — the honesty rules, as data', () => {
  it('keeps mode UNKNOWN when the log read found nothing', () => {
    // `null` is a first-class value: `certaintyFor` renders the weaker claim on
    // it. Collapsing it to a mode nobody read would manufacture evidence.
    const snapshot = assembleSnapshot(
      [{ id: POST_ID, status: 'published', scheduledAt: null }],
      new Map(),
      new Map(),
      NOW.toISOString(),
    )

    expect(snapshot.posts[0]?.mode).toBeNull()
  })

  it('carries `simulated` through unchanged, so a fixture stays labelled', () => {
    // Arrange — what `variantStatusRow` produces for a fixture run: the marker
    // permalink has already been nulled, and `simulated` is the ONLY field that
    // still knows the difference.
    const fixtureRow = variant({ status: 'published', simulated: true, permalink: null })

    // Act
    const snapshot = assembleSnapshot(
      [{ id: POST_ID, status: 'published', scheduledAt: null }],
      new Map([[POST_ID, 'fixture' as const]]),
      new Map([[POST_ID, [fixtureRow]]]),
      NOW.toISOString(),
    )

    // Assert — a payload that dropped this would relabel every fixture run as a
    // real publish, which is the claim the whole rail exists to refuse.
    expect(snapshot.posts[0]?.variants[0]?.simulated).toBe(true)
    expect(snapshot.posts[0]?.variants[0]?.permalink).toBeNull()
  })

  it('never invents a permalink for a published channel that has none', () => {
    const noUrl = variant({ status: 'published', permalink: null, platformPostId: null })

    const snapshot = assembleSnapshot(
      [{ id: POST_ID, status: 'published', scheduledAt: null }],
      new Map([[POST_ID, 'live' as const]]),
      new Map([[POST_ID, [noUrl]]]),
      NOW.toISOString(),
    )

    expect(snapshot.posts[0]?.variants[0]?.permalink).toBeNull()
  })

  it('carries the SERVER read time, not the client clock', () => {
    const readAt = '2026-08-11T09:30:00.000Z'
    const snapshot = assembleSnapshot([], new Map(), new Map(), readAt)

    expect(snapshot.readAt).toBe(readAt)
  })

  it('drops a post the lifecycle read did not return, rather than faking a status', () => {
    // A deleted post, or one no longer visible to this workspace. Absent from the
    // snapshot means the card keeps its server-rendered state — the last thing we
    // actually knew to be true.
    const snapshot = assembleSnapshot(
      [],
      new Map([[POST_ID, 'live' as const]]),
      new Map(),
      NOW.toISOString(),
    )

    expect(snapshot.posts).toEqual([])
  })
})

describe('msUntilNextWatch — "not now" is not "not ever"', () => {
  it('gives a wake time for a post scheduled beyond the watch window', () => {
    // THE BUG THIS EXISTS FOR. `cadenceFor` correctly says "do not poll" for a
    // post ten minutes out. Read as "do not look again", that post publishes and
    // the screen never moves — the exact failure this feature was built to end.
    const posts = [post({ status: 'scheduled', scheduledAt: '2026-08-11T12:10:00.000Z' })]

    // Due at +10min, watch window opens one cron tick (5min) earlier, so ~5min.
    expect(msUntilNextWatch(posts, NOW)).toBe(5 * 60 * 1000)
  })

  it('is null when nothing is on the clock, which is the only time stopping is right', () => {
    expect(msUntilNextWatch([post({ status: 'draft' })], NOW)).toBeNull()
    expect(msUntilNextWatch([post({ status: 'published' })], NOW)).toBeNull()
  })

  it('takes the EARLIEST of several schedules', () => {
    const posts = [
      post({ postId: 'a', status: 'scheduled', scheduledAt: '2026-08-11T14:00:00.000Z' }),
      post({ postId: 'b', status: 'scheduled', scheduledAt: '2026-08-11T12:08:00.000Z' }),
    ]

    expect(msUntilNextWatch(posts, NOW)).toBe(3 * 60 * 1000)
  })

  it('caps a distant schedule so it re-decides periodically rather than sleeping for days', () => {
    const posts = [post({ status: 'scheduled', scheduledAt: '2026-09-01T12:00:00.000Z' })]

    // A wake costs a recomputation, not a request — so waking is cheap and a
    // schedule moved earlier while the tab sat open is still caught.
    expect(msUntilNextWatch(posts, NOW)).toBe(MAX_WAKE_MS)
  })

  it('ignores an unparseable schedule rather than waking on a row nothing will touch', () => {
    expect(msUntilNextWatch([post({ status: 'scheduled', scheduledAt: 'soon' })], NOW)).toBeNull()
  })
})
