import { createJsonCaller, type ZernioClientDeps, type ZernioRateLimit } from './client'
import type { ScopedAccountId, ScopedProfileId } from './scope'

/**
 * Zernio's READ surface — analytics, messaging, comments, reviews.
 *
 * Every endpoint here was verified live on 2026-08-08 against
 * `https://zernio.com/api/v1`; shapes come from the OpenAPI spec at
 * `docs.zernio.com/api/openapi` (v1.0.4, 375 endpoints).
 *
 * ── THE RULE THIS MODULE EXISTS TO ENFORCE ───────────────────────────────────
 * `profileId` and `accountId` are OPTIONAL filters on Zernio's side, and omitting
 * `profileId` reads across EVERY profile on the API key — every tenant, by default.
 * So no function here accepts a plain string for either. They take `ScopedProfileId`
 * / `ScopedAccountId`, which only `./scope` can mint, and only from a row already
 * fetched for a known workspace. Forgetting to scope a read is a compile error.
 *
 * Nothing in this file writes. There is no send, reply, or delete here by design —
 * those are separate surfaces and need their own review (Instagram's messaging window
 * alone is a HUMAN_AGENT-only regime).
 */

/** Cursor pagination, used by every `/inbox/*` list. */
export interface ZernioCursorPage {
  hasMore: boolean
  nextCursor: string | null
}

/** Page/limit pagination, used by `/analytics` list responses. Different model. */
export interface ZernioOffsetPage {
  page: number
  limit: number
  total: number
  pages: number
}

/**
 * Per-account health carried on every `/inbox/*` response.
 *
 * Zernio does NOT fail the whole call when one account errors — it returns 200 and
 * reports the failure here. Reading it is the difference between "no messages" and
 * "we could not ask". Surface it; never treat an empty `data` as authoritative
 * without checking `accountsFailed`.
 */
export interface ZernioInboxMeta {
  accountsQueried: number
  accountsFailed: number
  failedAccounts: {
    accountId?: string
    accountUsername?: string
    platform?: string
    error?: string
    code?: string
    retryAfter?: number
  }[]
  lastUpdated?: string
}

export interface ZernioPostMetrics {
  impressions: number
  reach: number
  likes: number
  comments: number
  shares: number
  saves: number
  clicks: number
  views: number
  follows?: number
  engagementRate?: number
  lastUpdated?: string | null
}

export interface ZernioPostAnalytics {
  postId: string
  status?: string
  publishedAt?: string | null
  analytics?: ZernioPostMetrics
  platformAnalytics?: {
    platform: string
    status: string
    platformPostId?: string | null
    accountId?: string
    accountUsername?: string | null
    syncStatus?: string
    platformPostUrl?: string | null
    errorMessage?: string | null
  }[]
  platformPostUrl?: string | null
  isExternal?: boolean
  syncStatus?: string
  message?: string | null
}

/**
 * A `/analytics` answer WITH the status it arrived under.
 *
 * The status is not decoration. Zernio answers **202 with every metric 0** for a post
 * whose metrics it has accepted but not computed — and `parse()` treats any status
 * below 400 as success, so without this the caller sees a well-formed body full of
 * zeroes and cannot tell it apart from a post that genuinely got no impressions.
 *
 * Kept beside the payload rather than folded into `ZernioPostAnalytics`, because that
 * interface mirrors the wire body and a synthetic field on it would be a lie about
 * what Zernio sent.
 */
export interface ZernioPostAnalyticsResult {
  status: number
  post: ZernioPostAnalytics
}

export interface ZernioConversation {
  id: string
  platform: string
  accountId: string
  accountUsername?: string
  participantId?: string
  participantName?: string
  lastMessage?: string
  updatedTime?: string
  status?: string
  unreadCount?: number | null
  url?: string | null
}

export interface ZernioMessage {
  id: string
  conversationId: string
  accountId: string
  platform: string
  message: string
  senderId?: string
  senderName?: string | null
  direction?: string
  createdAt?: string
  readAt?: string | null
  isDeleted?: boolean
}

export interface ZernioCommentedPost {
  id: string
  platform: string
  accountId: string
  accountUsername?: string
  content?: string
  permalink?: string | null
  createdTime?: string
  commentCount: number
  likeCount?: number
}

export interface ZernioComment {
  id: string
  message: string
  createdTime?: string
  from?: { id?: string; name?: string; username?: string; isOwner?: boolean }
  likeCount?: number
  replyCount?: number
  platform?: string
  url?: string | null
  /** Permission bits come back WITH the data — never guess what the UI may offer. */
  canReply?: boolean
  canDelete?: boolean
  canHide?: boolean
  canLike?: boolean
  isHidden?: boolean
}

export interface ZernioReview {
  id: string
  platform: string
  accountId: string
  locationName?: string | null
  reviewer?: { id?: string; name?: string }
  rating: number
  text?: string
  created?: string
  hasReply?: boolean
  reply?: { id?: string; text?: string; created?: string } | null
  reviewUrl?: string | null
}

/** Every list result carries the rate-limit headers so a caller can back off. */
export interface ZernioPaged<T, P> {
  data: T[]
  pagination: P
  meta?: ZernioInboxMeta
  rateLimit: ZernioRateLimit
}

export type ZernioPlatformFilter =
  'facebook' | 'instagram' | 'twitter' | 'bluesky' | 'reddit' | 'telegram'

interface ListOpts {
  limit?: number
  cursor?: string
}

const qs = (parts: Record<string, string | number | undefined>): string => {
  const out = Object.entries(parts)
    .filter((e): e is [string, string | number] => e[1] !== undefined && e[1] !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
  return out.length === 0 ? '' : `?${out.join('&')}`
}

export interface ZernioReads {
  // ── analytics, profile-scoped ──────────────────────────────────────────────
  /**
   * `platformPostId` is the PLATFORM's id — Instagram's media id, X's tweet id —
   * which is what `post_variants.platform_post_id` holds and what
   * `assertPlatformPostId` calls "the ANALYTICS key" by name.
   *
   * Passing Zernio's own 24-hex `_id` here does NOT error. It answers 202 with every
   * metric 0, permanently (see `PublishSuccess.platformPostId`) — which is precisely
   * why this returns the status rather than the payload alone.
   */
  postAnalytics(
    profile: ScopedProfileId,
    platformPostId: string,
  ): Promise<ZernioPostAnalyticsResult>
  listPostAnalytics(
    profile: ScopedProfileId,
    opts?: { limit?: number; page?: number },
  ): Promise<ZernioPaged<unknown, ZernioOffsetPage>>
  /**
   * `postId` must be the PLATFORM's id. Zernio offers no profile filter on this
   * endpoint, so `profile` is required as a witness that the caller resolved the
   * workspace first — it is not sent. Without it there is no lookup in the call path
   * at all, and the postId could have come from anywhere.
   */
  postTimeline(profile: ScopedProfileId, platformPostId: string): Promise<{ timeline: unknown[] }>

  // ── analytics, account-scoped ──────────────────────────────────────────────
  instagramAccountInsights(
    account: ScopedAccountId,
    opts?: { since?: string; until?: string; metrics?: string },
  ): Promise<{ metrics: Record<string, unknown>; dataDelay?: string }>
  /**
   * `metricType` decides whether this is a HISTORY at all.
   *
   * It defaults to `total_value` on Zernio's side, which answers one number for the
   * whole window — `{ follower_count: { total: 1 } }` — and no per-day points. Only
   * `time_series` returns `values: [{ date, value }]`. Verified live 2026-08-10.
   *
   * The same parameter is REFUSED by `instagramAccountInsights` (HTTP 400) for its
   * default metric set, which is why it is offered here and not there.
   */
  instagramFollowerHistory(
    account: ScopedAccountId,
    opts?: { since?: string; until?: string; metricType?: 'total_value' | 'time_series' },
  ): Promise<{ metrics: Record<string, unknown>; dataDelay?: string }>
  gbpPerformance(
    account: ScopedAccountId,
    opts?: { startDate?: string; endDate?: string },
  ): Promise<{ metrics: Record<string, unknown>; dataDelay?: string }>

  // ── messaging (read only) ──────────────────────────────────────────────────
  listConversations(
    profile: ScopedProfileId,
    opts?: ListOpts & { platform?: ZernioPlatformFilter },
  ): Promise<ZernioPaged<ZernioConversation, ZernioCursorPage>>
  /** A thread is identified by (conversationId, accountId) — the id alone is not enough. */
  listMessages(
    account: ScopedAccountId,
    conversationId: string,
    opts?: ListOpts,
  ): Promise<{ messages: ZernioMessage[]; pagination: ZernioCursorPage }>

  // ── comments (read only) ───────────────────────────────────────────────────
  listCommentedPosts(
    profile: ScopedProfileId,
    opts?: ListOpts,
  ): Promise<ZernioPaged<ZernioCommentedPost, ZernioCursorPage>>
  listPostComments(
    account: ScopedAccountId,
    platformPostId: string,
    opts?: ListOpts,
  ): Promise<{ comments: ZernioComment[]; pagination: ZernioCursorPage }>

  // ── reviews (read only) ────────────────────────────────────────────────────
  listReviews(
    profile: ScopedProfileId,
    opts?: ListOpts,
  ): Promise<ZernioPaged<ZernioReview, ZernioCursorPage>>
}

export function createZernioReads(deps: ZernioClientDeps): ZernioReads {
  const json = createJsonCaller(deps)
  const EMPTY_CURSOR: ZernioCursorPage = { hasMore: false, nextCursor: null }

  return {
    async postAnalytics(profile, platformPostId) {
      const { status, data } = await json<ZernioPostAnalytics>(
        'GET',
        `/analytics${qs({ postId: platformPostId, profileId: profile })}`,
        'postAnalytics',
      )
      return { status, post: data }
    },

    async listPostAnalytics(profile, opts) {
      const { data, rateLimit } = await json<{
        posts?: unknown[]
        pagination?: ZernioOffsetPage
      }>(
        'GET',
        `/analytics${qs({ profileId: profile, limit: opts?.limit, page: opts?.page })}`,
        'listPostAnalytics',
      )
      return {
        data: data.posts ?? [],
        pagination: data.pagination ?? { page: 1, limit: opts?.limit ?? 50, total: 0, pages: 0 },
        rateLimit,
      }
    },

    async postTimeline(_profile, platformPostId) {
      const { data } = await json<{ timeline?: unknown[] }>(
        'GET',
        `/analytics/post-timeline${qs({ postId: platformPostId })}`,
        'postTimeline',
      )
      return { timeline: data.timeline ?? [] }
    },

    async instagramAccountInsights(account, opts) {
      const { data } = await json<{ metrics?: Record<string, unknown>; dataDelay?: string }>(
        'GET',
        `/analytics/instagram/account-insights${qs({ accountId: account, ...opts })}`,
        'instagramAccountInsights',
      )
      return { metrics: data.metrics ?? {}, dataDelay: data.dataDelay }
    },

    async instagramFollowerHistory(account, opts) {
      const { data } = await json<{ metrics?: Record<string, unknown>; dataDelay?: string }>(
        'GET',
        `/analytics/instagram/follower-history${qs({ accountId: account, ...opts })}`,
        'instagramFollowerHistory',
      )
      return { metrics: data.metrics ?? {}, dataDelay: data.dataDelay }
    },

    async gbpPerformance(account, opts) {
      const { data } = await json<{ metrics?: Record<string, unknown>; dataDelay?: string }>(
        'GET',
        `/analytics/googlebusiness/performance${qs({ accountId: account, ...opts })}`,
        'gbpPerformance',
      )
      return { metrics: data.metrics ?? {}, dataDelay: data.dataDelay }
    },

    async listConversations(profile, opts) {
      const { data, rateLimit } = await json<{
        data?: ZernioConversation[]
        pagination?: ZernioCursorPage
        meta?: ZernioInboxMeta
      }>(
        'GET',
        `/inbox/conversations${qs({
          profileId: profile,
          platform: opts?.platform,
          limit: opts?.limit,
          cursor: opts?.cursor,
        })}`,
        'listConversations',
      )
      return {
        data: data.data ?? [],
        pagination: data.pagination ?? EMPTY_CURSOR,
        meta: data.meta,
        rateLimit,
      }
    },

    async listMessages(account, conversationId, opts) {
      const { data } = await json<{ messages?: ZernioMessage[]; pagination?: ZernioCursorPage }>(
        'GET',
        `/inbox/conversations/${encodeURIComponent(conversationId)}/messages${qs({
          accountId: account,
          limit: opts?.limit,
          cursor: opts?.cursor,
        })}`,
        'listMessages',
      )
      return { messages: data.messages ?? [], pagination: data.pagination ?? EMPTY_CURSOR }
    },

    async listCommentedPosts(profile, opts) {
      const { data, rateLimit } = await json<{
        data?: ZernioCommentedPost[]
        pagination?: ZernioCursorPage
        meta?: ZernioInboxMeta
      }>(
        'GET',
        `/inbox/comments${qs({ profileId: profile, limit: opts?.limit, cursor: opts?.cursor })}`,
        'listCommentedPosts',
      )
      return {
        data: data.data ?? [],
        pagination: data.pagination ?? EMPTY_CURSOR,
        meta: data.meta,
        rateLimit,
      }
    },

    async listPostComments(account, platformPostId, opts) {
      const { data } = await json<{ comments?: ZernioComment[]; pagination?: ZernioCursorPage }>(
        'GET',
        `/inbox/comments/${encodeURIComponent(platformPostId)}${qs({
          accountId: account,
          limit: opts?.limit,
          cursor: opts?.cursor,
        })}`,
        'listPostComments',
      )
      return { comments: data.comments ?? [], pagination: data.pagination ?? EMPTY_CURSOR }
    },

    async listReviews(profile, opts) {
      const { data, rateLimit } = await json<{
        data?: ZernioReview[]
        pagination?: ZernioCursorPage
        meta?: ZernioInboxMeta
        summary?: unknown
      }>(
        'GET',
        `/inbox/reviews${qs({ profileId: profile, limit: opts?.limit, cursor: opts?.cursor })}`,
        'listReviews',
      )
      return {
        data: data.data ?? [],
        pagination: data.pagination ?? EMPTY_CURSOR,
        meta: data.meta,
        rateLimit,
      }
    },
  }
}
