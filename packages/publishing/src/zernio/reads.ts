import { createJsonCaller, type ZernioClientDeps, type ZernioRateLimit } from './client'
import type { ScopedAccountId, ScopedProfileId } from './scope'

/**
 * Zernio's READ surface — analytics, messaging, comments, reviews.
 *
 * Every endpoint here was reached live on 2026-08-08 against
 * `https://zernio.com/api/v1`; shapes come from the OpenAPI spec at
 * `docs.zernio.com/api/openapi` (v1.0.4, 375 endpoints).
 *
 * ── REACHED IS NOT THE SAME AS OBSERVED WITH DATA ────────────────────────────
 * The `/inbox/*` surface answered on 2026-08-08 but had never returned a row. On
 * **2026-08-10** it did, and three things this file asserted turned out to be wrong:
 * `direction` (doc said `inbound`, wire says `incoming`), `meta` (not on every
 * response), and `pagination` (one endpoint omits `nextCursor` outright). Captures are
 * committed under `fixtures/zernio-inbox/` and pinned by `./inbox-live.test.ts`.
 *
 * `ZernioReview`'s ROW shape remains `[DOC]`: the reviews envelope has been observed,
 * but no review has — no Google Business Profile has ever been connected.
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

/**
 * Cursor pagination, used by every `/inbox/*` list.
 *
 * Both fields are required HERE because that is what a caller is handed. The wire is
 * looser — `/inbox/comments/{postId}` sends `hasMore` and no `nextCursor` at all
 * `[LIVE 2026-08-10]` — so responses are typed `Partial<…>` at the parse site and put
 * back together by `cursor()`. Never widen this one; a caller that has to null-check
 * `nextCursor` twice will eventually check it once.
 */
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
 * Per-account health carried on the profile-scoped fan-out lists.
 *
 * Zernio does NOT fail the whole call when one account errors — it returns 200 and
 * reports the failure here. Reading it is the difference between "no messages" and
 * "we could not ask". Surface it; never treat an empty `data` as authoritative
 * without checking `accountsFailed`.
 *
 * ── NOT ON EVERY `/inbox/*` RESPONSE `[LIVE 2026-08-10]` ─────────────────────
 * This file used to claim it was. It is not. Only the three profile-scoped lists
 * (`/inbox/conversations`, `/inbox/comments`, `/inbox/reviews`) send this shape. The
 * two account-scoped reads answer differently:
 *
 *   - `/inbox/conversations/{id}/messages` sends NO `meta` at all (a `lastUpdated` and
 *     a `sortOrderApplied` sit at the top level instead).
 *   - `/inbox/comments/{postId}` sends a DIFFERENT `meta`:
 *     `{ platform, postId, accountId, lastUpdated }` — no `accountsQueried`, no
 *     `failedAccounts`.
 *
 * Which is why neither of those two methods returns a `meta`: typing that second shape
 * as this one would read `accountsQueried` as `undefined` and send every caller down
 * its "cannot confirm this view is complete" branch permanently.
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
  /**
   * `"incoming"` / `"outgoing"` on Instagram `[LIVE 2026-08-10]`.
   *
   * Deliberately still `string`. Narrowing it to that pair would claim a closed set
   * observed on exactly ONE platform — Instagram is the only one whose thread has ever
   * been read. Never compare this field directly; go through `messageDirection`, which
   * is also where an unseen third spelling gets reported instead of silently taken for
   * one of ours.
   */
  direction?: string
  createdAt?: string
  readAt?: string | null
  isDeleted?: boolean
}

/** What a message's `direction` means to us, including "we do not recognise it". */
export type MessageDirection = 'inbound' | 'outbound' | 'unknown'

/**
 * Zernio's wire vocabulary for `direction`, mapped to ours — in ONE place.
 *
 * ── THE BUG THIS REPLACES ────────────────────────────────────────────────────
 * Two call sites independently compared `direction === 'inbound'`: the send-window
 * calculation and the message list's left/right rendering. `'inbound'` was doc 13's
 * word, never a measured one — Zernio sends `'incoming'`. So every send window read
 * `unknown` forever, and every message in every thread rendered on the shop owner's
 * side labelled "You", putting the customer's own words in their mouth.
 *
 * Both failures were silent, and each would have had to be found separately. Hence one
 * function, exported from the package that owns the wire shape.
 *
 * ── WHY `unknown` IS A RESULT AND NOT A DEFAULT-TO-OURS ──────────────────────
 * The old rule was "anything not inbound is ours", which is what let a wholly
 * unrecognised value render confidently. `unknown` cannot open a send window (it has no
 * timestamp to measure from) and cannot be attributed to either party. And because an
 * unseen spelling is exactly what just cost us this bug — Instagram is one platform of
 * three with a modelled window — it is logged rather than absorbed. The log is the
 * difference between "wrong forever" and "wrong until the first Facebook thread".
 */
export function messageDirection(message: Pick<ZernioMessage, 'direction'>): MessageDirection {
  switch (message.direction) {
    // Observed live. Instagram, 2026-08-10.
    case 'incoming':
    // doc 13's spelling, and our own `inbox_messages.direction` enum. Never observed
    // on the wire, but unambiguous — no platform could mean "outbound" by it.
    case 'inbound':
      return 'inbound'
    case 'outgoing':
    case 'outbound':
      return 'outbound'
    default:
      if (message.direction !== undefined) {
        console.error(
          '[zernio] unrecognised message direction — the thread will render as unattributed',
          message.direction,
        )
      }
      return 'unknown'
  }
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

/** `asc` is Zernio's default on `/messages` and means OLDEST FIRST. See `MessageListOpts`. */
export type MessageSortOrder = 'asc' | 'desc'

/**
 * ── WHY MESSAGES NEED A SORT PARAMETER AND THE OTHER LISTS DO NOT ────────────
 * `/inbox/conversations/{id}/messages` defaults to `sortOrder=asc` — OLDEST first,
 * chat-style. Combined with a page limit, an unsorted read of a long thread returns its
 * oldest page: the newest messages, and therefore the newest INBOUND one that the reply
 * window is measured from, are not in it at all.
 *
 * Instagram and Facebook replay up to 500 messages per conversation when an account is
 * connected, so threads longer than one page are ordinary. A caller that needs the
 * current state of a conversation — which is every caller we have — must ask for `desc`.
 */
interface MessageListOpts extends ListOpts {
  sortOrder?: MessageSortOrder
}

export interface ZernioMessagePage {
  messages: ZernioMessage[]
  pagination: ZernioCursorPage
  /**
   * The order the server ACTUALLY applied, or `null` when it did not say.
   *
   * Not the order requested: Facebook and Bluesky return newest-first whatever is asked
   * and only reverse within a single page. Null rather than an assumed `'asc'`, for the
   * same reason `cursor()` fills pagination per-field — these endpoints disagree about
   * which fields they send, and the last assumed value here was the `direction` enum.
   */
  sortOrderApplied: MessageSortOrder | null
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
  /**
   * A thread is identified by (conversationId, accountId) — the id alone is not enough.
   *
   * Pass `sortOrder: 'desc'` for anything that reasons about the CURRENT state of the
   * thread (the reply window, the latest messages). The API's default is `asc`, which
   * returns the oldest page — see `MessageListOpts`.
   */
  listMessages(
    account: ScopedAccountId,
    conversationId: string,
    opts?: MessageListOpts,
  ): Promise<ZernioMessagePage>

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

  /**
   * Normalise whatever arrived in `pagination` into a full `ZernioCursorPage`.
   *
   * ── WHY A DEFAULT OBJECT WAS NOT ENOUGH `[LIVE 2026-08-10]` ────────────────
   * The previous `data.pagination ?? EMPTY_CURSOR` only fires when the pagination
   * OBJECT is absent. `/inbox/comments/{postId}` sends `{"hasMore": false}` — object
   * present, `nextCursor` FIELD missing — so the default never applied and `undefined`
   * flowed out through a field declared `string | null`.
   *
   * Per-field rather than per-object, because the endpoints genuinely disagree about
   * which fields they send, and the next one to drop a field should not need its own
   * bug first.
   */
  const cursor = (page: Partial<ZernioCursorPage> | undefined): ZernioCursorPage => ({
    hasMore: page?.hasMore ?? false,
    nextCursor: page?.nextCursor ?? null,
  })

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
        pagination?: Partial<ZernioCursorPage>
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
        pagination: cursor(data.pagination),
        meta: data.meta,
        rateLimit,
      }
    },

    async listMessages(account, conversationId, opts) {
      const { data } = await json<{
        messages?: ZernioMessage[]
        pagination?: Partial<ZernioCursorPage>
        sortOrderApplied?: MessageSortOrder
      }>(
        'GET',
        `/inbox/conversations/${encodeURIComponent(conversationId)}/messages${qs({
          accountId: account,
          limit: opts?.limit,
          cursor: opts?.cursor,
          // Sent only when asked. `qs` drops undefined, so an absent option leaves the
          // API on its own default rather than this module quietly picking one.
          sortOrder: opts?.sortOrder,
        })}`,
        'listMessages',
      )
      return {
        messages: data.messages ?? [],
        pagination: cursor(data.pagination),
        sortOrderApplied: data.sortOrderApplied ?? null,
      }
    },

    async listCommentedPosts(profile, opts) {
      const { data, rateLimit } = await json<{
        data?: ZernioCommentedPost[]
        pagination?: Partial<ZernioCursorPage>
        meta?: ZernioInboxMeta
      }>(
        'GET',
        `/inbox/comments${qs({ profileId: profile, limit: opts?.limit, cursor: opts?.cursor })}`,
        'listCommentedPosts',
      )
      return {
        data: data.data ?? [],
        pagination: cursor(data.pagination),
        meta: data.meta,
        rateLimit,
      }
    },

    async listPostComments(account, platformPostId, opts) {
      const { data } = await json<{
        comments?: ZernioComment[]
        pagination?: Partial<ZernioCursorPage>
      }>(
        'GET',
        `/inbox/comments/${encodeURIComponent(platformPostId)}${qs({
          accountId: account,
          limit: opts?.limit,
          cursor: opts?.cursor,
        })}`,
        'listPostComments',
      )
      return { comments: data.comments ?? [], pagination: cursor(data.pagination) }
    },

    async listReviews(profile, opts) {
      const { data, rateLimit } = await json<{
        data?: ZernioReview[]
        pagination?: Partial<ZernioCursorPage>
        meta?: ZernioInboxMeta
        summary?: unknown
      }>(
        'GET',
        `/inbox/reviews${qs({ profileId: profile, limit: opts?.limit, cursor: opts?.cursor })}`,
        'listReviews',
      )
      return {
        data: data.data ?? [],
        pagination: cursor(data.pagination),
        meta: data.meta,
        rateLimit,
      }
    },
  }
}
