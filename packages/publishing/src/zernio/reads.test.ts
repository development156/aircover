import { describe, it, expect } from 'vitest'
import { createZernioReads } from './reads'
import { scopeAccount, scopeProfile } from './scope'
import type { Transport, TransportRequest } from '../transport'

const WS = '5f17dad6-35ae-4288-aba1-1e3a4df31189'
const PROFILE = '6a75cae32853ee463c6419d6'
const ACCOUNT = '6a75caf7d0fe733d1afcc1f4'
const IG_MEDIA_ID = '18104441855596739'

const profile = scopeProfile({ workspace_id: WS, profile_id: PROFILE }, WS)
const account = scopeAccount(
  { workspace_id: WS, external_account: { id: ACCOUNT, profileId: PROFILE } },
  WS,
  profile,
)

/** Records the outbound request and answers with a valid JSON envelope. */
function capturing(
  body: unknown = {},
  status = 200,
): { transport: Transport; last: () => TransportRequest } {
  let last: TransportRequest | undefined
  const transport: Transport = async (req) => {
    last = req
    return {
      status,
      headers: {
        'content-type': 'application/json',
        'x-ratelimit-limit': '60',
        'x-ratelimit-remaining': '59',
        'x-ratelimit-reset': '1786164660',
      },
      body: JSON.stringify(body),
    }
  }
  return {
    transport,
    last: () => {
      if (!last) throw new Error('no request was made')
      return last
    },
  }
}

const readsWith = (body: unknown = {}, status = 200) => {
  const cap = capturing(body, status)
  return { reads: createZernioReads({ transport: cap.transport, apiKey: 'sk_test' }), cap }
}

describe('every profile-scoped read puts profileId on the wire', () => {
  /**
   * The whole point. Zernio treats `profileId` as an optional filter that defaults to
   * EVERY profile on the API key, so an omitted one is a silent cross-tenant read that
   * returns HTTP 200 (doc 13 §2.3, §3).
   */
  it.each([
    [
      'listConversations',
      (r: ReturnType<typeof readsWith>['reads']) => r.listConversations(profile),
    ],
    [
      'listCommentedPosts',
      (r: ReturnType<typeof readsWith>['reads']) => r.listCommentedPosts(profile),
    ],
    ['listReviews', (r: ReturnType<typeof readsWith>['reads']) => r.listReviews(profile)],
    [
      'listPostAnalytics',
      (r: ReturnType<typeof readsWith>['reads']) => r.listPostAnalytics(profile),
    ],
    [
      'postAnalytics',
      (r: ReturnType<typeof readsWith>['reads']) => r.postAnalytics(profile, IG_MEDIA_ID),
    ],
    [
      'dailyMetrics',
      (r: ReturnType<typeof readsWith>['reads']) =>
        r.dailyMetrics(profile, { fromDate: '2026-08-01', attribution: 'publish' }),
    ],
    [
      'inboxVolume',
      (r: ReturnType<typeof readsWith>['reads']) =>
        r.inboxVolume(profile, { fromDate: '2026-08-01' }),
    ],
    [
      'inboxHeatmap',
      (r: ReturnType<typeof readsWith>['reads']) =>
        r.inboxHeatmap(profile, { fromDate: '2026-08-01' }),
    ],
    [
      'inboxSourceBreakdown',
      (r: ReturnType<typeof readsWith>['reads']) =>
        r.inboxSourceBreakdown(profile, { fromDate: '2026-08-01' }),
    ],
    [
      'inboxResponseTime',
      (r: ReturnType<typeof readsWith>['reads']) =>
        r.inboxResponseTime(profile, { fromDate: '2026-08-01' }),
    ],
    [
      'inboxTopAccounts',
      (r: ReturnType<typeof readsWith>['reads']) =>
        r.inboxTopAccounts(profile, { fromDate: '2026-08-01' }),
    ],
  ])('%s sends profileId', async (_name, call) => {
    const { reads, cap } = readsWith()
    await call(reads)
    expect(cap.last().url).toContain(`profileId=${PROFILE}`)
  })
})

describe('every account-scoped read puts accountId on the wire', () => {
  it.each([
    [
      'instagramAccountInsights',
      (r: ReturnType<typeof readsWith>['reads']) => r.instagramAccountInsights(account),
    ],
    [
      'instagramFollowerHistory',
      (r: ReturnType<typeof readsWith>['reads']) => r.instagramFollowerHistory(account),
    ],
    ['gbpPerformance', (r: ReturnType<typeof readsWith>['reads']) => r.gbpPerformance(account)],
    [
      'listMessages',
      (r: ReturnType<typeof readsWith>['reads']) => r.listMessages(account, 'conv-1'),
    ],
    [
      'listPostComments',
      (r: ReturnType<typeof readsWith>['reads']) => r.listPostComments(account, IG_MEDIA_ID),
    ],
  ])('%s sends accountId', async (_name, call) => {
    const { reads, cap } = readsWith()
    await call(reads)
    expect(cap.last().url).toContain(`accountId=${ACCOUNT}`)
  })
})

describe('the base URL and the JSON contract', () => {
  it('always calls zernio.com/api/v1 — never api.zernio.com', async () => {
    const { reads, cap } = readsWith()
    await reads.listReviews(profile)
    expect(cap.last().url.startsWith('https://zernio.com/api/v1/')).toBe(true)
    expect(cap.last().url).not.toContain('api.zernio.com')
  })

  it('rejects a 200 that is not JSON, which is what an unknown path returns', async () => {
    // Verified 2026-08-08: zernio.com/api/v1/<unknown> answers 200 with text/html.
    const transport: Transport = async () => ({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<!DOCTYPE html><html>…</html>',
    })
    const reads = createZernioReads({ transport, apiKey: 'sk_test' })
    await expect(reads.listReviews(profile)).rejects.toThrow(
      /NON_JSON|not the Zernio API|expected JSON/i,
    )
  })

  it('surfaces rate-limit headers so a caller can back off', async () => {
    const { reads } = readsWith({ data: [] })
    const page = await reads.listReviews(profile)
    expect(page.rateLimit).toEqual({ limit: 60, remaining: 59, reset: 1786164660 })
  })

  it('reports per-account failures instead of passing an empty list off as "no data"', async () => {
    const { reads } = readsWith({
      data: [],
      pagination: { hasMore: false, nextCursor: null },
      meta: {
        accountsQueried: 2,
        accountsFailed: 1,
        failedAccounts: [{ accountId: ACCOUNT, code: 'RATE_LIMIT', retryAfter: 30 }],
      },
    })
    const page = await reads.listConversations(profile)
    expect(page.data).toHaveLength(0)
    expect(page.meta?.accountsFailed).toBe(1)
    expect(page.meta?.failedAccounts[0]?.code).toBe('RATE_LIMIT')
  })
})

describe('postAnalytics keeps the status, because 202 means "not computed"', () => {
  /**
   * `parse()` treats every status below 400 as success, so a 202 arrives as a
   * well-formed body — and Zernio's 202 body carries every metric as 0. Dropping the
   * status is what would make "accepted, not computed" indistinguishable from a post
   * that honestly got no impressions.
   */
  it('reports 202 alongside the payload rather than swallowing it', async () => {
    const { reads } = readsWith(
      {
        postId: IG_MEDIA_ID,
        analytics: { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0 },
      },
      202,
    )
    const result = await reads.postAnalytics(profile, IG_MEDIA_ID)
    expect(result.status).toBe(202)
    // The zeroes ARE in the payload. Nothing downstream may read them as a measurement.
    expect(result.post.analytics?.impressions).toBe(0)
  })

  it('reports 200 for a real measurement', async () => {
    const { reads } = readsWith({
      postId: IG_MEDIA_ID,
      analytics: { impressions: 412, reach: 388, likes: 21, lastUpdated: '2026-08-06T09:00:00Z' },
    })
    const result = await reads.postAnalytics(profile, IG_MEDIA_ID)
    expect(result.status).toBe(200)
    expect(result.post.analytics?.impressions).toBe(412)
  })

  it('sends the PLATFORM post id as postId, not Zernio’s own _id', async () => {
    const { reads, cap } = readsWith()
    await reads.postAnalytics(profile, IG_MEDIA_ID)
    expect(cap.last().url).toContain(`postId=${IG_MEDIA_ID}`)
  })
})

describe('omitting or forging the scope is a COMPILE error, not a review item', () => {
  it('will not accept a bare profile id string', async () => {
    const { reads } = readsWith()

    // @ts-expect-error a raw string is not a ScopedProfileId — it must come from scopeProfile()
    await reads.listReviews(PROFILE)
    // @ts-expect-error a raw string is not a ScopedAccountId — it must come from scopeAccount()
    await reads.instagramAccountInsights(ACCOUNT)
    // @ts-expect-error the scope is required; there is no unscoped overload to fall back to
    await reads.listConversations()
    // @ts-expect-error the analytics read is scoped too — the post id alone is not enough
    await reads.postAnalytics(IG_MEDIA_ID)
    // @ts-expect-error follower history is account-scoped; a bare string cannot reach it
    await reads.instagramFollowerHistory(ACCOUNT)

    // If any @ts-expect-error above stops erroring, typecheck fails and the guarantee
    // is gone. The runtime assertion is incidental — the compile step is the test.
    expect(true).toBe(true)
  })
})

describe('messageAttachmentUrl', () => {
  it('asks for JSON with the account on the wire, and returns the minted url', async () => {
    const { reads, cap } = readsWith({ url: 'https://cdn.example/fresh.jpg' })
    const url = await reads.messageAttachmentUrl(account, 'conv-1', 'msg-1', 2)
    expect(url).toBe('https://cdn.example/fresh.jpg')
    const req = cap.last()
    expect(req.method).toBe('GET')
    expect(req.url).toContain('/inbox/conversations/conv-1/messages/msg-1/attachments/2?')
    expect(req.url).toContain('format=json')
    expect(req.url).toContain(`accountId=${account}`)
  })

  it('answers null, not a throw, when the platform cannot re-mint (404)', async () => {
    const { reads } = readsWith({ error: 'not_found' }, 404)
    await expect(reads.messageAttachmentUrl(account, 'conv-1', 'msg-1', 0)).resolves.toBeNull()
  })
})

describe('dailyMetrics', () => {
  const DAY = {
    date: '2026-08-01',
    postCount: 3,
    platforms: { instagram: 2, twitter: 1 },
    metrics: {
      impressions: 4520,
      reach: 3200,
      likes: 312,
      comments: 45,
      shares: 28,
      saves: 67,
      clicks: 89,
      views: 1560,
    },
  }

  it('shapes the days and the per-platform breakdown', async () => {
    const { reads } = readsWith({
      dailyData: [DAY],
      platformBreakdown: [
        {
          platform: 'instagram',
          postCount: 142,
          impressions: 89400,
          reach: 62100,
          likes: 8930,
          comments: 1204,
          shares: 567,
          saves: 2103,
          clicks: 3402,
          views: 45200,
        },
      ],
    })
    const result = await reads.dailyMetrics(profile, {
      fromDate: '2026-08-01',
      attribution: 'publish',
    })

    expect(result.dailyData[0]?.date).toBe('2026-08-01')
    expect(result.dailyData[0]?.postCount).toBe(3)
    expect(result.dailyData[0]?.platforms).toEqual({ instagram: 2, twitter: 1 })
    expect(result.dailyData[0]?.metrics.saves).toBe(67)
    expect(result.platformBreakdown[0]?.platform).toBe('instagram')
    expect(result.platformBreakdown[0]?.comments).toBe(1204)
  })

  it('sends the wire names Zernio actually reads, and the attribution it was given', async () => {
    // `fromDate`/`toDate`, not `from`/`to`. A parameter Zernio does not know is
    // silently ignored, and the answer comes back as the last 180 days under a
    // heading that says thirty.
    const { reads, cap } = readsWith()
    await reads.dailyMetrics(profile, {
      fromDate: '2026-08-01',
      toDate: '2026-08-31',
      platform: 'instagram',
      attribution: 'received',
    })
    const url = cap.last().url
    expect(url).toContain('/analytics/daily-metrics?')
    expect(url).toContain('fromDate=2026-08-01')
    expect(url).toContain('toDate=2026-08-31')
    expect(url).toContain('platform=instagram')
    expect(url).toContain('attribution=received')
    expect(url).not.toContain('from=2026')
  })

  it('never turns a metric it did not receive into a zero', async () => {
    // The schema promises eight integers. What arrives decides, and a missing
    // key must reach the table as the absence mark, not as a measurement of
    // none — every other reading on /analytics obeys the same rule.
    const { reads } = readsWith({
      dailyData: [{ date: '2026-08-01', postCount: 1, metrics: { impressions: 10 } }],
    })
    const day = (
      await reads.dailyMetrics(profile, { fromDate: '2026-08-01', attribution: 'publish' })
    ).dailyData[0]

    expect(day?.metrics.impressions).toBe(10)
    expect(day?.metrics.saves).toBeNull()
    expect(day?.metrics.likes).toBeNull()
  })

  it('keeps a real zero, which is a reading', async () => {
    const { reads } = readsWith({
      dailyData: [{ date: '2026-08-01', postCount: 1, metrics: { likes: 0 } }],
    })
    const day = (
      await reads.dailyMetrics(profile, { fromDate: '2026-08-01', attribution: 'publish' })
    ).dailyData[0]
    expect(day?.metrics.likes).toBe(0)
  })

  it('drops a day with no readable date rather than inventing a column', async () => {
    const { reads } = readsWith({ dailyData: [{ postCount: 4 }, { date: 'soon' }, DAY] })
    const result = await reads.dailyMetrics(profile, {
      fromDate: '2026-08-01',
      attribution: 'publish',
    })
    expect(result.dailyData).toHaveLength(1)
    expect(result.dailyData[0]?.date).toBe('2026-08-01')
  })

  it('answers empty arrays for a response holding neither key', async () => {
    // A workspace with the add-on and no posts. Not an error, and not a throw.
    const { reads } = readsWith({})
    const result = await reads.dailyMetrics(profile, {
      fromDate: '2026-08-01',
      attribution: 'publish',
    })
    expect(result).toEqual({ dailyData: [], platformBreakdown: [] })
  })

  it('throws on the add-on refusal so the caller can tell it apart from empty', async () => {
    // HTTP 402 `analytics_addon_required`. Answering `{ dailyData: [] }` here
    // would tell a paying customer their accounts reported nothing, which is a
    // claim about their shop drawn from a fact about their plan.
    const { reads } = readsWith({ error: 'Analytics add-on required' }, 402)
    await expect(
      reads.dailyMetrics(profile, { fromDate: '2026-08-01', attribution: 'publish' }),
    ).rejects.toThrow()
  })
})

describe('inbox analytics reads', () => {
  it('inboxVolume shapes the summary, timeseries and per-platform split', async () => {
    const { reads, cap } = readsWith({
      from: '2026-08-01',
      to: '2026-08-31',
      summary: { received: 40, sent: 22, read: 18, failed: 2, uniqueConversations: 9 },
      timeseries: [{ date: '2026-08-01', sent: 1, received: 2, read: 1, failed: 0 }],
      byPlatform: [{ platform: 'instagram', sent: 1, received: 2, read: 1, failed: 0 }],
    })
    const result = await reads.inboxVolume(profile, { fromDate: '2026-08-01', toDate: '2026-08-31' })
    expect(result.summary.received).toBe(40)
    expect(result.summary.uniqueConversations).toBe(9)
    expect(result.timeseries).toHaveLength(1)
    expect(result.byPlatform[0]?.platform).toBe('instagram')
    expect(cap.last().url).toContain('fromDate=2026-08-01')
    expect(cap.last().url).toContain('toDate=2026-08-31')
  })

  it('inboxVolume defaults an absent summary to zeroes, not undefined', async () => {
    const { reads } = readsWith({ from: '2026-08-01', to: null })
    const result = await reads.inboxVolume(profile, { fromDate: '2026-08-01' })
    expect(result.summary).toEqual({
      received: 0,
      sent: 0,
      read: 0,
      failed: 0,
      uniqueConversations: 0,
    })
    expect(result.timeseries).toEqual([])
  })

  it('inboxHeatmap passes the sparse buckets through and sends the action filter', async () => {
    const { reads, cap } = readsWith({
      from: '2026-08-01',
      to: null,
      buckets: [{ dow: 1, hour: 9, received: 3, sent: 1, read: 1 }],
    })
    const result = await reads.inboxHeatmap(profile, {
      fromDate: '2026-08-01',
      action: 'message.received',
    })
    expect(result.buckets).toEqual([{ dow: 1, hour: 9, received: 3, sent: 1, read: 1 }])
    expect(cap.last().url).toContain('action=message.received')
  })

  it('inboxSourceBreakdown carries the per-source per-platform split', async () => {
    const { reads } = readsWith({
      from: '2026-08-01',
      to: null,
      sources: [
        {
          source: 'human',
          received: 10,
          sent: 8,
          read: 6,
          byPlatform: [{ platform: 'instagram', received: 10, sent: 8, read: 6 }],
        },
      ],
    })
    const result = await reads.inboxSourceBreakdown(profile, { fromDate: '2026-08-01' })
    expect(result.sources[0]?.source).toBe('human')
    expect(result.sources[0]?.byPlatform[0]?.platform).toBe('instagram')
  })

  it('inboxResponseTime turns a zero sampleSize summary into null, not a zero median', async () => {
    const { reads } = readsWith({
      from: '2026-08-01',
      to: null,
      summary: {
        sampleSize: 0,
        medianSeconds: 0,
        p90Seconds: 0,
        p99Seconds: 0,
        meanSeconds: 0,
        fastestSeconds: 0,
        slowestSeconds: 0,
      },
      histogram: [],
    })
    const result = await reads.inboxResponseTime(profile, { fromDate: '2026-08-01' })
    expect(result.summary).toBeNull()
  })

  it('inboxResponseTime keeps a real summary when sampleSize is positive', async () => {
    const { reads } = readsWith({
      from: '2026-08-01',
      to: null,
      summary: {
        sampleSize: 12,
        medianSeconds: 90,
        p90Seconds: 400,
        p99Seconds: 900,
        meanSeconds: 150,
        fastestSeconds: 5,
        slowestSeconds: 1200,
      },
      histogram: [{ bucket: '1-5m', lowerSeconds: 60, upperSeconds: 300, count: 4 }],
    })
    const result = await reads.inboxResponseTime(profile, { fromDate: '2026-08-01' })
    expect(result.summary?.medianSeconds).toBe(90)
    expect(result.histogram[0]?.bucket).toBe('1-5m')
  })

  it('inboxTopAccounts sends limit and passes the leaderboard through', async () => {
    const { reads, cap } = readsWith({
      from: '2026-08-01',
      to: null,
      accounts: [
        {
          accountId: ACCOUNT,
          platform: 'instagram',
          displayName: 'Test Shop',
          username: 'testshop',
          received: 20,
          sent: 15,
          total: 35,
          conversations: 10,
          medianResponseSeconds: 0,
          repliedCount: 0,
        },
      ],
    })
    const result = await reads.inboxTopAccounts(profile, { fromDate: '2026-08-01', limit: 5 })
    expect(result.accounts[0]?.repliedCount).toBe(0)
    expect(cap.last().url).toContain('limit=5')
  })
})
