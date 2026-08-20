import { describe, it, expect } from 'vitest'
import { ZernioError } from '@sahoda/publishing'
import type { ZernioInstagramDemographics } from '@sahoda/publishing'

import {
  FOLLOWER_BUCKETS,
  currentFollowers,
  demographicRows,
  followerRows,
  runAudienceCapture,
  utcDay,
  type AudienceCaptureDeps,
  type AudienceSnapshot,
  type FollowerHistory,
} from './capture'

/**
 * The audience pass, EXECUTED.
 *
 * The assertion this file exists for is the one Postgres cannot make: A DIMENSION
 * THE PLATFORM DID NOT REPORT PRODUCES NO ROW. It is enforced by two tests pulling
 * in OPPOSITE directions, and both are needed —
 *
 *   · an ABSENT key writes nothing;
 *   · a REPORTED ZERO writes a row, because Instagram said zero and that is a
 *     measurement.
 *
 * A suite asserting only the first would pass against a collector that dropped
 * genuine zeroes, which would put permanent holes in the churn series. A suite
 * asserting only the second would pass against a collector that invented them.
 */

/** LIVE 2026-08-20. A real connected account with 1 follower. HTTP 200, not 400. */
const SUPPRESSED_LIVE: ZernioInstagramDemographics = {
  success: true,
  accountId: '6a81aff477555aae0149e261',
  platform: 'instagram',
  metric: 'follower_demographics',
  timeframe: 'this_month',
  demographics: { age: [], city: [], country: [], gender: [] },
  note: 'Demographics show top 45 entries per dimension. Requires 100+ followers.',
}

/** Zernio's own OpenAPI `allBreakdowns` example. DOCUMENTED, never measured here. */
const POPULATED_DOC: ZernioInstagramDemographics = {
  success: true,
  accountId: '64e1a2b3c4d5e6f7a8b9c0d1',
  platform: 'instagram',
  metric: 'follower_demographics',
  timeframe: 'this_month',
  demographics: {
    age: [
      { dimension: '25-34', value: 4500 },
      { dimension: '18-24', value: 3200 },
    ],
    gender: [{ dimension: 'F', value: 4800 }],
    city: [{ dimension: 'New York, New York', value: 800 }],
    country: [{ dimension: 'US', value: 5000 }],
  },
}

/** LIVE 2026-08-20, narrowed exactly as the deps layer narrows it. */
const HISTORY_LIVE: FollowerHistory = {
  total: [
    { date: '2026-08-17', value: 1 },
    { date: '2026-08-18', value: 1 },
    { date: '2026-08-19', value: 1 },
    { date: '2026-08-20', value: 1 },
  ],
  gained: [
    { date: '2026-08-18', value: 0 },
    { date: '2026-08-19', value: 0 },
    { date: '2026-08-20', value: 0 },
  ],
  lost: [
    { date: '2026-08-18', value: 0 },
    { date: '2026-08-19', value: 0 },
    { date: '2026-08-20', value: 0 },
  ],
}

const TARGET = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  accountId: '6a81aff477555aae0149e261',
  channel: 'instagram' as const,
}

const NOW = new Date('2026-08-20T20:00:00Z')

function deps(over: Partial<AudienceCaptureDeps> = {}): {
  deps: AudienceCaptureDeps
  written: AudienceSnapshot[]
} {
  const written: AudienceSnapshot[] = []
  return {
    written,
    deps: {
      listTargets: async () => [TARGET],
      readDemographics: async () => SUPPRESSED_LIVE,
      readFollowerHistory: async () => HISTORY_LIVE,
      writeSnapshots: async (rows) => {
        written.push(...rows)
        return { inserted: rows.length, storage: 'ready' }
      },
      now: NOW,
      ...over,
    },
  }
}

describe('it never writes a number it was not given', () => {
  it('writes NO ROW for a dimension the platform did not report', async () => {
    // The rule, at the level the collector controls. `age` is reported; the other
    // three are absent from the payload entirely — not empty, ABSENT.
    const rows = demographicRows(
      TARGET,
      'followers',
      {
        kind: 'ready',
        breakdown: { age: [{ label: '25-34', value: 4500 }] },
        timeframe: 'this_month',
        followers: 5000,
      },
      NOW,
    )
    expect(rows).toHaveLength(1)
    expect(rows.map((r) => r.dimension)).toEqual(['age'])
    // Named explicitly: no gender/city/country row exists at any value, including 0.
    expect(rows.some((r) => r.dimension !== 'age')).toBe(false)
  })

  it('WRITES A ROW for a bucket the platform reported as zero', async () => {
    // The opposite direction, and the half a "reject zeroes" guard gets backwards.
    const rows = demographicRows(
      TARGET,
      'followers',
      {
        kind: 'ready',
        breakdown: { age: [{ label: '65+', value: 0 }] },
        timeframe: 'this_month',
        followers: 5000,
      },
      NOW,
    )
    expect(rows).toEqual([expect.objectContaining({ dimension: 'age', bucket: '65+', value: 0 })])
  })

  it('writes nothing at all when every dimension came back empty', async () => {
    const { deps: d, written } = deps()
    const report = await runAudienceCapture(d)
    // Only the follower series. Not one demographic row, and no zeroes.
    expect(written.every((r) => r.dimension === 'follower_count')).toBe(true)
    expect(report.collected).toBe(written.length)
    expect(report.suppressed).toBe(1)
    expect(report.measured).toBe(0)
  })

  it('keeps a reported zero in the follower series', async () => {
    // `followers_gained: 0` on a quiet day is a measurement. Dropping it would put a
    // permanent hole in the churn record, which cannot be refetched.
    const rows = followerRows(TARGET, HISTORY_LIVE)
    const gained = rows.filter((r) => r.bucket === 'gained')
    expect(gained).toHaveLength(3)
    expect(gained.every((r) => r.value === 0)).toBe(true)
  })
})

describe('the day a row lands under', () => {
  it('uses the PLATFORM’s own date for every follower point', () => {
    // One call returns ~30 dated points. Stamping them with today would collapse a
    // month into one row and lose the other twenty-nine for good.
    const rows = followerRows(TARGET, HISTORY_LIVE).filter((r) => r.bucket === 'total')
    expect(rows.map((r) => r.measuredOn)).toEqual([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
    ])
    expect(rows.every((r) => r.measuredOn !== utcDay(NOW) || r.measuredOn === '2026-08-20')).toBe(
      true,
    )
  })

  it('uses today for demographics, because that endpoint dates nothing', () => {
    // Verified live: the 200 body carries no timestamp of any kind.
    expect(SUPPRESSED_LIVE).not.toHaveProperty('measuredAt')
    const rows = demographicRows(
      TARGET,
      'followers',
      {
        kind: 'ready',
        breakdown: { age: [{ label: '25-34', value: 1 }] },
        timeframe: 'this_month',
        followers: 200,
      },
      NOW,
    )
    expect(rows[0]?.measuredOn).toBe('2026-08-20')
  })

  it('drops a point whose date is not a date rather than dating it with a fallback', () => {
    const rows = followerRows(TARGET, {
      total: [
        { date: 'total', value: 1 },
        { date: '2026-08-20', value: 5 },
      ],
      gained: [],
      lost: [],
    })
    // 'total' as a date is the exact shape that once rendered as
    // "1 — No change over 1 day" on the analytics page. A dropped point is a
    // shorter series; a coerced one is a false series.
    expect(rows).toHaveLength(1)
    expect(rows[0]?.measuredOn).toBe('2026-08-20')
  })
})

describe('the follower count used for the suppression judgement', () => {
  it('is the last DATED point, not the endpoint’s own total field', () => {
    expect(currentFollowers(HISTORY_LIVE)).toBe(1)
    expect(
      currentFollowers({
        total: [
          { date: '2026-08-19', value: 900 },
          { date: '2026-08-20', value: 1000 },
        ],
        gained: [],
        lost: [],
      }),
    ).toBe(1000)
  })

  it('is null — not zero — when there is no series', () => {
    // Null and 0 lead to opposite verdicts: 0 is under the floor and would claim
    // suppression; null admits we do not know.
    expect(currentFollowers(null)).toBeNull()
    expect(currentFollowers({ total: [], gained: [], lost: [] })).toBeNull()
  })
})

describe('what the pass reports', () => {
  it('counts a suppressed ACCOUNT once, not once per population', async () => {
    // Both populations sit behind the same follower floor, so an account under it
    // yields two `suppressed` verdicts describing one fact.
    const { deps: d } = deps()
    expect((await runAudienceCapture(d)).suppressed).toBe(1)
  })

  it('separates a failed call from an empty one', async () => {
    const { deps: d, written } = deps({
      readDemographics: async () => {
        throw new ZernioError({
          message: 'boom',
          status: 500,
          code: 'UNKNOWN',
          type: 'x',
          rateLimit: { limit: null, remaining: null, reset: null },
        })
      },
    })
    const report = await runAudienceCapture(d)
    expect(report.unreadable).toBe(2) // one per population
    expect(report.suppressed).toBe(0) // NEVER, whatever the follower count is
    expect(written.every((r) => r.dimension === 'follower_count')).toBe(true)
  })

  it('separates a missing analytics plan from a failure', async () => {
    const { deps: d } = deps({
      readDemographics: async () => {
        throw new ZernioError({
          message: 'addon',
          status: 402,
          code: 'analytics_addon_required',
          type: 'x',
          rateLimit: { limit: null, remaining: null, reset: null },
        })
      },
    })
    const report = await runAudienceCapture(d)
    expect(report.notConfigured).toBe(2)
    expect(report.unreadable).toBe(0)
  })

  it('separates an account the platform cannot resolve', async () => {
    const { deps: d } = deps({
      readDemographics: async () => {
        throw new ZernioError({
          message: 'Account not found',
          status: 404,
          code: 'account_not_found',
          type: 'not_found',
          rateLimit: { limit: null, remaining: null, reset: null },
        })
      },
    })
    expect((await runAudienceCapture(d)).unresolved).toBe(2)
  })

  it('still reports the newest day when it stored nothing', async () => {
    // `written: 0` is the correct answer for a second run in one day AND what a
    // stall looks like. The newest day is what lets a reader tell them apart.
    const { deps: d } = deps({
      writeSnapshots: async () => ({ inserted: 0, storage: 'ready' }),
    })
    const report = await runAudienceCapture(d)
    expect(report.written).toBe(0)
    expect(report.newestDay).toBe('2026-08-20')
    expect(report.daysInBatch).toBeGreaterThan(1)
  })

  it('says the table is not there rather than raising an alarm', async () => {
    const { deps: d } = deps({
      writeSnapshots: async () => ({ inserted: 0, storage: 'not-ready' }),
    })
    expect((await runAudienceCapture(d)).storage).toBe('not-ready')
  })

  it('measures an account that really reported something', async () => {
    const { deps: d, written } = deps({ readDemographics: async () => POPULATED_DOC })
    const report = await runAudienceCapture(d)
    expect(report.measured).toBe(1)
    expect(report.suppressed).toBe(0)
    // Four dimensions x five buckets across two populations, plus the follower series.
    const demo = written.filter((r) => r.dimension !== 'follower_count')
    expect(new Set(demo.map((r) => r.dimension))).toEqual(
      new Set(['age', 'gender', 'city', 'country']),
    )
    expect(new Set(demo.map((r) => r.audience))).toEqual(new Set(['followers', 'engaged']))
  })

  it('keeps the two populations apart in what it stores', async () => {
    // They are different populations. A row that lost track of which one it came
    // from would let the screen show engaged-viewer ages as follower ages.
    const { deps: d, written } = deps({ readDemographics: async () => POPULATED_DOC })
    await runAudienceCapture(d)
    const ages = written.filter((r) => r.dimension === 'age' && r.bucket === '25-34')
    expect(ages.map((r) => r.audience).sort()).toEqual(['engaged', 'followers'])
    expect(new Set(ages.map((r) => r.source)).size).toBe(2)
  })

  it('asks about every follower bucket, not just the total', () => {
    // The sibling-shape check: a collector that captured only `total` would look
    // correct on the trend chart and silently never collect churn.
    const rows = followerRows(TARGET, HISTORY_LIVE)
    expect(new Set(rows.map((r) => r.bucket))).toEqual(new Set(FOLLOWER_BUCKETS))
  })
})
