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
function capturing(body: unknown = {}): { transport: Transport; last: () => TransportRequest } {
  let last: TransportRequest | undefined
  const transport: Transport = async (req) => {
    last = req
    return {
      status: 200,
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

const readsWith = (body: unknown = {}) => {
  const cap = capturing(body)
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

describe('omitting or forging the scope is a COMPILE error, not a review item', () => {
  it('will not accept a bare profile id string', async () => {
    const { reads } = readsWith()

    // @ts-expect-error a raw string is not a ScopedProfileId — it must come from scopeProfile()
    await reads.listReviews(PROFILE)
    // @ts-expect-error a raw string is not a ScopedAccountId — it must come from scopeAccount()
    await reads.instagramAccountInsights(ACCOUNT)
    // @ts-expect-error the scope is required; there is no unscoped overload to fall back to
    await reads.listConversations()

    // If any @ts-expect-error above stops erroring, typecheck fails and the guarantee
    // is gone. The runtime assertion is incidental — the compile step is the test.
    expect(true).toBe(true)
  })
})
