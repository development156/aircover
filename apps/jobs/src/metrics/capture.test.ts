import { describe, it, expect, vi } from 'vitest'
import type { ZernioPostAnalyticsResult } from '@sahoda/publishing'

import {
  runMetricCapture,
  type MetricSnapshot,
  type MetricTarget,
  type SnapshotStorage,
} from './capture'

/**
 * The metric-history pass, and the one thing it must never do.
 *
 * ── THE PROPERTY UNDER TEST ──────────────────────────────────────────────────
 * Not "it stores numbers". It is that a number the platform did not report never
 * becomes a stored number — and that matters more here than anywhere else in the
 * product, because a stored zero is PERMANENT. The screen already refuses to draw
 * an unmeasured zero; a job that wrote one would defeat that refusal for good, by
 * putting a fabricated value somewhere every later reader has reason to trust.
 *
 * Zernio produces zeroes in three situations where nothing was measured — a 202,
 * a post still inside its platform's reporting window, and an account it cannot
 * resolve — so each of those gets its own case below.
 */

const NOW = new Date('2026-08-19T02:00:00Z')

const target = (over: Partial<MetricTarget> = {}): MetricTarget => ({
  workspaceId: 'w1',
  profileId: 'a'.repeat(24),
  postId: 'p1',
  channel: 'instagram',
  platformPostId: '17900000000000000',
  // Well past Instagram's 48h window, so a zero here would be licensed as a real
  // measurement. That is deliberate: it makes the "never invent" cases below
  // prove the JOB's refusal rather than the window's.
  publishedAt: '2026-08-10T09:00:00Z',
  ...over,
})

/**
 * A measured answer, in the shape the live API actually returns.
 *
 * Copied from `packages/publishing/fixtures/zernio/analytics.post.measured.json`,
 * which was captured from the real endpoint: the counts sit under `analytics`, and
 * `lastUpdated` sits INSIDE it, space-separated and unzoned.
 */
const measured = (over: Record<string, unknown> = {}): ZernioPostAnalyticsResult =>
  ({
    status: 200,
    post: {
      status: 'published',
      syncStatus: 'synced',
      analytics: {
        impressions: 3000,
        reach: 1200,
        likes: 38,
        comments: 2,
        shares: 0,
        saves: 0,
        lastUpdated: '2026-08-19 01:30:00',
        ...over,
      },
    },
  }) as unknown as ZernioPostAnalyticsResult

function harness(
  targets: MetricTarget[],
  answer: (t: MetricTarget) => Promise<ZernioPostAnalyticsResult>,
) {
  const written: MetricSnapshot[] = []
  // Annotated rather than inferred: without it the mock's return type narrows to
  // `storage: 'ready'`, and the case that primes a missing table cannot be written.
  const writeSnapshots = vi.fn(
    async (
      rows: readonly MetricSnapshot[],
    ): Promise<{
      inserted: number
      storage: SnapshotStorage
    }> => {
      written.push(...rows)
      return { inserted: rows.length, storage: 'ready' }
    },
  )
  return {
    written,
    writeSnapshots,
    deps: {
      listTargets: async () => targets,
      readPostAnalytics: async (_p: string, id: string) =>
        answer(targets.find((t) => t.platformPostId === id) ?? targets[0]!),
      writeSnapshots,
      now: NOW,
    },
  }
}

describe('the metric-history pass', () => {
  it('stores a running total for each number the platform reported', async () => {
    const h = harness([target()], async () => measured())
    const report = await runMetricCapture(h.deps)

    expect(report).toMatchObject({ targets: 1, measured: 1, pending: 0, unreadable: 0 })
    expect(h.written.map((r) => r.metric).sort()).toEqual(['engagement', 'impressions', 'reach'])
    expect(h.written.find((r) => r.metric === 'reach')?.value).toBe(1200)
    // Engagement is SUMMED from the components Zernio reported — 38 + 2 — never
    // taken from its own rate, which carries no independent evidence.
    expect(h.written.find((r) => r.metric === 'engagement')?.value).toBe(40)
  })

  it('records when the PLATFORM measured, not when we asked', async () => {
    // The two are different and the table keeps them apart on purpose. Using our
    // own clock would bucket a stale sync into today and draw a point for a day
    // nothing was measured.
    const h = harness([target()], async () => measured())
    await runMetricCapture(h.deps)

    expect(h.written[0]?.measuredAt).not.toContain('2026-08-19T02:00')
    expect(h.written[0]?.measuredAt).toContain('2026-08-19')
  })

  it('stores nothing for a metric the platform did not report', async () => {
    // `reach` absent from the payload. A gap, and a gap is not a zero — writing
    // one would tell the customer their post reached nobody, permanently.
    const h = harness([target()], async () => measured({ reach: undefined }))
    await runMetricCapture(h.deps)

    expect(h.written.map((r) => r.metric)).not.toContain('reach')
    expect(h.written.map((r) => r.metric)).toContain('impressions')
  })

  it('stores nothing at all when the platform accepted but has not computed', async () => {
    // HTTP 202 with a well-formed body of zeroes. Every metric here is a 0 that
    // means "not yet", and this is the case a naive job would enshrine.
    const answer = {
      status: 202,
      post: {
        status: 'published',
        syncStatus: 'synced',
        analytics: {
          impressions: 0,
          reach: 0,
          likes: 0,
          comments: 0,
          lastUpdated: '2026-08-19 01:30:00',
        },
      },
    } as unknown as ZernioPostAnalyticsResult
    const h = harness([target()], async () => answer)

    const report = await runMetricCapture(h.deps)

    expect(h.written).toEqual([])
    expect(report).toMatchObject({ measured: 0, pending: 1 })
  })

  it('stores nothing for a post still inside its platform’s reporting window', async () => {
    // Published four hours ago; Instagram reports ~48h behind. The zeroes are the
    // wait, not the result.
    const h = harness([target({ publishedAt: '2026-08-18T22:00:00Z' })], async () =>
      measured({ impressions: 0, reach: 0, likes: 0, comments: 0 }),
    )

    const report = await runMetricCapture(h.deps)

    expect(h.written).toEqual([])
    expect(report).toMatchObject({ measured: 0, pending: 1 })
  })

  it('stores nothing for a channel whose reporting window is unknown', async () => {
    // LinkedIn, X and GBP state no window anywhere in this codebase. Without one,
    // a payload of zeroes cannot be called a measurement — so it is not stored,
    // and the wait cannot be dated either.
    const h = harness([target({ channel: 'linkedin' })], async () =>
      measured({ impressions: 0, reach: 0, likes: 0, comments: 0 }),
    )

    const report = await runMetricCapture(h.deps)

    expect(h.written).toEqual([])
    expect(report).toMatchObject({ measured: 0, pending: 1 })
  })

  it('counts a failed call apart from a post with nothing to say', async () => {
    // "We could not read it" and "there is nothing yet" are different sentences,
    // and a report that merged them would hide an outage inside a normal night.
    const h = harness([target()], async () => {
      throw new Error('network')
    })

    const report = await runMetricCapture(h.deps)

    expect(report).toMatchObject({
      targets: 1,
      measured: 0,
      pending: 0,
      unreadable: 1,
      unresolved: 0,
    })
    expect(h.written).toEqual([])
  })

  it('counts the platform’s own “cannot resolve this” apart from a failed call', async () => {
    // One is a permanent state on their side, the other is an outage on ours. A
    // retry fixes one and will never fix the other, so a report that merged them
    // could not tell anyone which night they were looking at.
    const orphaned = {
      status: 200,
      post: {
        status: 'published',
        syncStatus: 'orphaned',
        analytics: {
          impressions: 0,
          reach: 0,
          likes: 0,
          comments: 0,
          lastUpdated: '2026-08-19 01:30:00',
        },
      },
    } as unknown as ZernioPostAnalyticsResult
    const h = harness([target()], async () => orphaned)

    const report = await runMetricCapture(h.deps)

    expect(report).toMatchObject({ measured: 0, unresolved: 1, unreadable: 0 })
    expect(h.written).toEqual([])
  })

  it('does not count a channel as measured when every number was absent', async () => {
    // A "ready" verdict can still carry no usable field. Counting it would inflate
    // the coverage figure the chart shows beside its own total.
    const h = harness([target()], async () =>
      measured({
        impressions: undefined,
        reach: undefined,
        likes: undefined,
        comments: undefined,
        shares: undefined,
        saves: undefined,
      }),
    )

    const report = await runMetricCapture(h.deps)

    expect(report).toMatchObject({ measured: 0, pending: 1, collected: 0 })
  })

  it('keeps going when one channel fails, rather than losing the whole night', async () => {
    const targets = [target(), target({ postId: 'p2', platformPostId: '17900000000000001' })]
    const h = harness(targets, async (t) => {
      if (t.postId === 'p1') throw new Error('network')
      return measured()
    })

    const report = await runMetricCapture(h.deps)

    expect(report).toMatchObject({ targets: 2, measured: 1, unreadable: 1 })
    expect(h.written.every((r) => r.postId === 'p2')).toBe(true)
  })

  it('reports that there is nowhere to store yet, without treating it as a failure', async () => {
    // Migration 20260819000100 is the founder's to apply. A nightly job that
    // raised an alarm until then is a job people learn to ignore.
    const h = harness([target()], async () => measured())
    h.writeSnapshots.mockResolvedValue({ inserted: 0, storage: 'not-ready' })

    const report = await runMetricCapture(h.deps)

    expect(report.storage).toBe('not-ready')
    expect(report.measured).toBe(1)
    expect(report.written).toBe(0)
  })

  it('asks where to store even with nothing to store', async () => {
    // Otherwise a night with no measurements would report `storage: 'ready'` for a
    // table that does not exist — and nobody would learn the migration is missing.
    const h = harness([], async () => measured())
    await runMetricCapture(h.deps)

    expect(h.writeSnapshots).toHaveBeenCalledWith([])
  })

  it('reports fewer written than collected on a repeat run, and that is success', async () => {
    const h = harness([target()], async () => measured())
    h.writeSnapshots.mockResolvedValue({ inserted: 0, storage: 'ready' })

    const report = await runMetricCapture(h.deps)

    expect(report.collected).toBe(3)
    expect(report.written).toBe(0)
  })

  it('carries the newest measurement stamp, so a stall can be told from a repeat', async () => {
    // `written: 0` is the healthy answer for a second run in one day AND what a
    // frozen platform stamp looks like every night forever. The stamp is what
    // separates them, and a missed day here cannot be collected later.
    const h = harness([target()], async () => measured())
    h.writeSnapshots.mockResolvedValue({ inserted: 0, storage: 'ready' })

    const report = await runMetricCapture(h.deps)

    expect(report.written).toBe(0)
    expect(report.newestMeasuredAt).toBe('2026-08-19T01:30:00Z')
    expect(report.daysInBatch).toBe(1)
  })

  it('reports no stamp at all when nothing was measured', async () => {
    const h = harness([], async () => measured())
    const report = await runMetricCapture(h.deps)

    expect(report.newestMeasuredAt).toBeNull()
    expect(report.daysInBatch).toBe(0)
  })
})

/**
 * ── THE NIGHT EVERY READ FAILED ──────────────────────────────────────────────
 *
 * A rotated Zernio key, a missing one, or an outage makes every `readPostAnalytics`
 * throw. Each throw was caught and counted, the report carried counts only, and
 * the route answered 200 `ok: true` with `unreadable: 120`. Nothing reached Sentry
 * because the catch discarded the error. That is a whole feature down, reported
 * as a healthy night, indefinitely.
 */
describe('how the whole pass went', () => {
  it('is clean when nothing failed, including a night with nothing to ask', async () => {
    expect((await runMetricCapture(harness([], async () => measured()).deps)).outcome).toBe('clean')
    expect((await runMetricCapture(harness([target()], async () => measured()).deps)).outcome).toBe(
      'clean',
    )
  })

  it('is clean when the platform has nothing to say yet: pending is not a failure', async () => {
    const h = harness([target({ publishedAt: '2026-08-18T22:00:00Z' })], async () =>
      measured({ impressions: 0, reach: 0, likes: 0, comments: 0 }),
    )
    expect((await runMetricCapture(h.deps)).outcome).toBe('clean')
  })

  it('is degraded when some reads failed and some landed', async () => {
    const targets = [target(), target({ postId: 'p2', platformPostId: '17900000000000001' })]
    const h = harness(targets, async (t) => {
      if (t.postId === 'p1') throw new Error('network')
      return measured()
    })
    expect((await runMetricCapture(h.deps)).outcome).toBe('degraded')
  })

  it('is failed when every read threw', async () => {
    const targets = [target(), target({ postId: 'p2', platformPostId: '17900000000000001' })]
    const h = harness(targets, async () => {
      throw new Error('No Zernio API key in this environment')
    })

    const report = await runMetricCapture(h.deps)

    expect(report).toMatchObject({ outcome: 'failed', targets: 2, measured: 0, unreadable: 2 })
  })

  it('counts an unresolved post as answered, so a night of orphans is degraded rather than failed', async () => {
    // The platform DID answer; it said it cannot tie the post to an account. That
    // is a state on their side, not an outage on ours, and a retry will not fix it.
    const orphaned = {
      status: 200,
      post: {
        status: 'published',
        syncStatus: 'orphaned',
        analytics: {
          impressions: 0,
          reach: 0,
          likes: 0,
          comments: 0,
          lastUpdated: '2026-08-19 01:30:00',
        },
      },
    } as unknown as ZernioPostAnalyticsResult
    const targets = [target(), target({ postId: 'p2', platformPostId: '17900000000000001' })]
    const h = harness(targets, async (t) => {
      if (t.postId === 'p1') throw new Error('network')
      return orphaned
    })
    expect((await runMetricCapture(h.deps)).outcome).toBe('degraded')
  })
})

describe('where the cause goes', () => {
  it('forwards a thrown read to onFailure, with the channel and without any id', async () => {
    const cause = new Error('network')
    const onFailure = vi.fn()
    const h = harness([target()], async () => {
      throw cause
    })

    await runMetricCapture({ ...h.deps, onFailure })

    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(onFailure).toHaveBeenCalledWith({ error: cause, channel: 'instagram' })
    // The report crosses a public URL and Sentry is not the place for a customer's
    // post id either: the event names the channel and nothing that identifies a row.
    expect(Object.keys(onFailure.mock.calls[0]![0])).toEqual(['error', 'channel'])
  })

  it('forwards each DISTINCT cause once, so 120 identical throws are one event', async () => {
    const onFailure = vi.fn()
    const targets = Array.from({ length: 120 }, (_, i) =>
      target({ postId: `p${i}`, platformPostId: `1790000000000${String(i).padStart(4, '0')}` }),
    )
    const h = harness(targets, async () => {
      throw new Error('No Zernio API key in this environment')
    })

    const report = await runMetricCapture({ ...h.deps, onFailure })

    expect(report.unreadable).toBe(120)
    expect(onFailure).toHaveBeenCalledTimes(1)
  })

  it('forwards different causes separately, up to a bound', async () => {
    const onFailure = vi.fn()
    const targets = Array.from({ length: 12 }, (_, i) =>
      target({ postId: `p${i}`, platformPostId: `1790000000000${String(i).padStart(4, '0')}` }),
    )
    const h = harness(targets, async (t) => {
      throw new Error(`timeout on ${t.postId}`)
    })

    await runMetricCapture({ ...h.deps, onFailure })

    // Twelve distinct messages, and fewer forwarded than thrown: a bound exists.
    expect(onFailure.mock.calls.length).toBeGreaterThan(1)
    expect(onFailure.mock.calls.length).toBeLessThan(12)
  })

  it('does not let a throwing onFailure take the night down', async () => {
    const h = harness(
      [target(), target({ postId: 'p2', platformPostId: '17900000000000001' })],
      async (t) => {
        if (t.postId === 'p1') throw new Error('network')
        return measured()
      },
    )
    const onFailure = vi.fn(() => {
      throw new Error('the reporter is broken too')
    })

    const report = await runMetricCapture({ ...h.deps, onFailure })

    expect(report).toMatchObject({ measured: 1, unreadable: 1, outcome: 'degraded' })
  })
})
