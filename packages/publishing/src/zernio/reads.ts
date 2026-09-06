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
/**
 * One bucket of one demographic dimension: `{ dimension: "25-34", value: 4500 }`.
 *
 * `dimension` is Meta's own label, unaltered — 'M'/'F'/'U' for gender, '25-34' for
 * age, a two-letter code for country, 'New York, New York' for city. `value` is a
 * COUNT OF ACCOUNTS, which is Meta's own wording, and is never a percentage.
 */
export interface ZernioDemographicBucket {
  dimension: string
  value: number
}

/**
 * `GET /analytics/instagram/demographics`.
 *
 * ── THE ONE THING TO KNOW BEFORE READING THIS ANSWER `[LIVE 2026-08-20]` ─────
 * An account Meta will not report demographics for does NOT come back as an error.
 * It comes back **HTTP 200, `success: true`, every dimension an EMPTY ARRAY**:
 *
 *   {"success":true,...,"demographics":{"age":[],"city":[],"country":[],"gender":[]},
 *    "note":"Demographics show top 45 entries per dimension. Requires 100+ followers."}
 *
 * Measured against a real connected account holding 1 follower. Zernio's own OpenAPI
 * documents a 400 with `code: "instagram_insufficient_followers"` for this case; that
 * error DID NOT FIRE. Meta's side says the same thing in the passive voice — "Not
 * returned if the IG User has less than 100 followers" (Instagram Platform, Instagram
 * User Insights) — and "not returned" is exactly what arrives.
 *
 * So an empty answer here is not self-describing, and nothing may guess at it. See
 * `audience-state.ts`, which refuses to call it suppression without a follower count
 * in hand.
 *
 * Every field is optional because every one of them is a wire fact, not a contract.
 */
export interface ZernioInstagramDemographics {
  success?: boolean
  accountId?: string
  platform?: string
  /** Which population: `follower_demographics` or `engaged_audience_demographics`. */
  metric?: string
  /**
   * The period the figures cover. Read as a plain string, deliberately.
   *
   * Zernio's OpenAPI declares the REQUEST parameter as `this_week | this_month`, and
   * its own documented 200 example echoes `last_30_days` back. A type pinned to the
   * enum would refuse a body the vendor itself publishes.
   */
  timeframe?: string
  /** Keyed by dimension — only the breakdowns that were asked for are present. */
  demographics?: Record<string, ZernioDemographicBucket[]>
  note?: string
}

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
  /**
   * What came attached. Absent on a message that carried none; the wire sends `[]`.
   *
   * `url` is a SNAPSHOT on Instagram and Facebook: a signed Meta CDN link that
   * expires on Meta's schedule. `refreshUrl` is stamped only on a REST read and is
   * Zernio's re-mint endpoint for that attachment; a webhook payload carries none,
   * and the reader builds the same URL from the ids (`messageAttachmentUrl`).
   */
  attachments?: ZernioAttachment[]
}

/** One attachment on a message, as Zernio describes it. */
export interface ZernioAttachment {
  /** `image`, `video`, `file`, `sticker`, `audio`, `share`. Zernio's own vocabulary. */
  type: string
  url: string
  refreshUrl?: string
  payload?: Record<string, unknown>
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

/**
 * Shared filter shape across every `/analytics/inbox/*` endpoint.
 *
 * `accountId` is a plain string, not `ScopedAccountId`: unlike the messaging
 * surface, `profileId` alone already scopes every one of these calls to the
 * tenant, so `accountId` here is a narrowing filter WITHIN that tenant rather
 * than the thing that establishes the tenant. Minting a `ScopedAccountId` would
 * imply a second scoping check these endpoints do not need or perform.
 */
export interface ZernioInboxAnalyticsFilter {
  fromDate: string
  toDate?: string
  platform?: string
  accountId?: string
  source?: string
}

export interface ZernioInboxVolumeSummary {
  received: number
  sent: number
  read: number
  failed: number
  uniqueConversations: number
}

export interface ZernioInboxVolumeDay {
  date: string
  sent: number
  received: number
  read: number
  failed: number
}

export interface ZernioInboxVolumePlatform {
  platform: string
  sent: number
  received: number
  read: number
  failed: number
}

export interface ZernioInboxVolume {
  from: string
  to: string | null
  summary: ZernioInboxVolumeSummary
  timeseries: ZernioInboxVolumeDay[]
  byPlatform: ZernioInboxVolumePlatform[]
}

export interface ZernioInboxHeatmapBucket {
  /** 1 = Monday … 7 = Sunday, per ClickHouse's `toDayOfWeek`. */
  dow: number
  hour: number
  received: number
  sent: number
  read: number
}

export interface ZernioInboxHeatmap {
  from: string
  to: string | null
  buckets: ZernioInboxHeatmapBucket[]
}

export interface ZernioInboxSourcePlatform {
  platform: string
  received: number
  sent: number
  read: number
}

export interface ZernioInboxSourceRow {
  source: string
  received: number
  sent: number
  read: number
  byPlatform: ZernioInboxSourcePlatform[]
}

export interface ZernioInboxSourceBreakdown {
  from: string
  to: string | null
  sources: ZernioInboxSourceRow[]
}

export interface ZernioInboxResponseTimeSummary {
  sampleSize: number
  medianSeconds: number
  p90Seconds: number
  p99Seconds: number
  meanSeconds: number
  fastestSeconds: number
  slowestSeconds: number
}

export interface ZernioInboxResponseTimeBucket {
  bucket: string
  lowerSeconds: number
  upperSeconds: number | null
  count: number
}

export interface ZernioInboxResponseTime {
  from: string
  to: string | null
  summary: ZernioInboxResponseTimeSummary | null
  histogram: ZernioInboxResponseTimeBucket[]
}

export interface ZernioInboxTopAccount {
  accountId: string
  platform: string
  /** `(disconnected)` when the live SocialAccount no longer exists. */
  displayName: string
  username: string
  received: number
  sent: number
  total: number
  conversations: number
  medianResponseSeconds: number
  /** Zero here with `repliedCount === 0` means never replied, not an instant reply. */
  repliedCount: number
}

export interface ZernioInboxTopAccounts {
  from: string
  to: string | null
  accounts: ZernioInboxTopAccount[]
}

// ── posting analytics, profile-scoped ────────────────────────────────────────

/**
 * ONE DAY OF `GET /v1/analytics/daily-metrics`.
 *
 * ── EVERY METRIC IS NULLABLE HERE AND IT IS NOT ON THE WIRE ──────────────────
 * The OpenAPI schema types all eight as `integer` and the example sends all
 * eight. They are typed `number | null` anyway, because this module's job is to
 * report what arrived and not what was promised: a key the response omits, or
 * sends as a string, or sends as `null`, must not reach a chart as a zero. A
 * zero is a measurement of nothing and a null is the absence of a measurement,
 * and once they are the same value nothing downstream can tell them apart.
 *
 * `postCount` and the `platforms` split are counts of rows Zernio holds, so
 * those default to 0 and {} rather than to null: an absent day is simply not in
 * the array.
 */
export interface ZernioDailyMetricValues {
  impressions: number | null
  reach: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  clicks: number | null
  views: number | null
}

export interface ZernioDailyMetricsDay {
  /** `YYYY-MM-DD`. */
  date: string
  postCount: number
  /** Posts per platform on this day: `{ instagram: 2, twitter: 1 }`. */
  platforms: Record<string, number>
  metrics: ZernioDailyMetricValues
}

export interface ZernioDailyPlatformRow extends ZernioDailyMetricValues {
  platform: string
  postCount: number
}

export interface ZernioDailyMetrics {
  dailyData: ZernioDailyMetricsDay[]
  platformBreakdown: ZernioDailyPlatformRow[]
}

/**
 * ── `attribution` IS NOT A PREFERENCE, IT DECIDES WHAT THE CHART MEANS ───────
 * `publish` (Zernio's default) sums each post's LIFETIME total onto its publish
 * date, so a column is "posts published that day, and everything they have ever
 * earned since". `received` buckets the per-day INCREASE by the day it arrived,
 * so a column is "engagement gained that day, on posts of any age". They are
 * different questions with the same axis, and a screen that let the default
 * decide would change what its y-axis means without saying so.
 *
 * Required here, with no default, for exactly that reason: a caller has to
 * choose, and whatever it chooses it can then print.
 */
export interface ZernioDailyMetricsFilter {
  /** ISO 8601. Inclusive. */
  fromDate: string
  /** ISO 8601. Inclusive. Zernio defaults to now. */
  toDate?: string
  /** One platform, or every platform when omitted. */
  platform?: string
  attribution: 'publish' | 'received'
  /** `late` is published through Zernio, `external` is imported. */
  source?: 'all' | 'late' | 'external'
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
  /**
   * Who follows this account, as Meta breaks it down.
   *
   * `breakdown` is a comma-separated subset of `age,city,country,gender`; omitted,
   * Zernio returns all four. An invalid name is a 400 `invalid_field_value`, not a
   * silently-dropped dimension — verified live 2026-08-20.
   *
   * A 200 with empty arrays is the ordinary answer for a small account and is NOT an
   * error. Never render it as "we could not read this". See the type's own note.
   */
  instagramDemographics(
    account: ScopedAccountId,
    opts?: {
      metric?: 'follower_demographics' | 'engaged_audience_demographics'
      breakdown?: string
      timeframe?: 'this_week' | 'this_month'
    },
  ): Promise<ZernioInstagramDemographics>
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
  /**
   * A media url for one attachment that works RIGHT NOW, or null.
   *
   * `GET /inbox/conversations/{c}/messages/{m}/attachments/{i}?accountId&format=json`.
   * Instagram and Facebook sign DM media per request; this re-mints a stale one
   * from Meta. Other platforms answer their stored url while it resolves and 404
   * once it does not, which is the null arm. `messageId` is the PLATFORM message
   * id, the one `listMessages` returns as `id`.
   */
  messageAttachmentUrl(
    account: ScopedAccountId,
    conversationId: string,
    messageId: string,
    index: number,
  ): Promise<string | null>

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

  // ── inbox analytics, profile-scoped ─────────────────────────────────────────
  /** Daily volume + KPI summary + per-platform split, for the analytics volume chart. */
  inboxVolume(
    profile: ScopedProfileId,
    filter: ZernioInboxAnalyticsFilter,
  ): Promise<ZernioInboxVolume>
  /** Day-of-week × hour-of-day buckets. Sparse: zero-fill the 7×24 grid at render time. */
  inboxHeatmap(
    profile: ScopedProfileId,
    filter: ZernioInboxAnalyticsFilter & {
      action?: 'message.received' | 'message.sent' | 'message.read' | 'all'
    },
  ): Promise<ZernioInboxHeatmap>
  /** Message volume by lineage source (human, workflow, sequence, broadcast, ...). */
  inboxSourceBreakdown(
    profile: ScopedProfileId,
    filter: ZernioInboxAnalyticsFilter,
  ): Promise<ZernioInboxSourceBreakdown>
  /**
   * Time-to-first-response. `summary` is null when `sampleSize` is 0 — no received
   * message in the window ever got a reply, which is a different sentence from "every
   * reply was instant" and must never render as a zero.
   */
  inboxResponseTime(
    profile: ScopedProfileId,
    filter: ZernioInboxAnalyticsFilter,
  ): Promise<ZernioInboxResponseTime>
  /** Leaderboard of accounts by inbox volume. */
  inboxTopAccounts(
    profile: ScopedProfileId,
    filter: ZernioInboxAnalyticsFilter & { limit?: number },
  ): Promise<ZernioInboxTopAccounts>

  // ── posting analytics, profile-scoped ──────────────────────────────────────
  /**
   * Daily aggregated metrics and a per-platform breakdown, for /analytics.
   *
   * This is the ONLY source in this product for likes, comments, shares, saves,
   * clicks and views. `post_metric_snapshots` stores impressions, reach and a
   * single summed `engagement` and throws the parts away, which is why
   * `headline.ts` has a card saying out loud that Sahoda cannot tell you how
   * many people replied.
   *
   * `profileId` goes on the wire like every other profile-scoped read: omitted,
   * it reads every profile on the API key, which is every tenant.
   *
   * ── IT CAN BE REFUSED FOR A REASON THAT IS NOT AN OUTAGE ────────────────────
   * HTTP 402 `analytics_addon_required` on a legacy plan. That throws like any
   * other refusal and MUST NOT be read as "nothing is connected": the accounts
   * are connected and the plan does not carry the add-on. `lib/analytics/
   * daily-metrics.ts` keeps the two apart.
   */
  dailyMetrics(
    profile: ScopedProfileId,
    filter: ZernioDailyMetricsFilter,
  ): Promise<ZernioDailyMetrics>
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

    async instagramDemographics(account, opts) {
      const { data } = await json<ZernioInstagramDemographics>(
        'GET',
        `/analytics/instagram/demographics${qs({ accountId: account, ...opts })}`,
        'instagramDemographics',
      )
      // Returned as it arrived. Narrowing lives in `audience-state.ts`, so the one
      // place that decides what an empty answer MEANS is also the only place that
      // can be tested for getting it wrong.
      return data
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

    async messageAttachmentUrl(account, conversationId, messageId, index) {
      try {
        const { data } = await json<{ url?: unknown }>(
          'GET',
          `/inbox/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/attachments/${Math.max(0, Math.trunc(index))}${qs({ accountId: account, format: 'json' })}`,
          'messageAttachmentUrl',
        )
        return typeof data.url === 'string' && data.url !== '' ? data.url : null
      } catch {
        // A 404 here is the documented answer for "the stored url no longer
        // resolves and this platform cannot re-mint". Not an error to report.
        return null
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

    async inboxVolume(profile, filter) {
      const { data } = await json<{
        from?: string
        to?: string | null
        summary?: Partial<ZernioInboxVolumeSummary>
        timeseries?: ZernioInboxVolumeDay[]
        byPlatform?: ZernioInboxVolumePlatform[]
      }>(
        'GET',
        `/analytics/inbox/volume${qs({
          profileId: profile,
          fromDate: filter.fromDate,
          toDate: filter.toDate,
          platform: filter.platform,
          accountId: filter.accountId,
          source: filter.source,
        })}`,
        'inboxVolume',
      )
      return {
        from: data.from ?? filter.fromDate,
        to: data.to ?? null,
        summary: {
          received: data.summary?.received ?? 0,
          sent: data.summary?.sent ?? 0,
          read: data.summary?.read ?? 0,
          failed: data.summary?.failed ?? 0,
          uniqueConversations: data.summary?.uniqueConversations ?? 0,
        },
        timeseries: data.timeseries ?? [],
        byPlatform: data.byPlatform ?? [],
      }
    },

    async inboxHeatmap(profile, filter) {
      const { data } = await json<{
        from?: string
        to?: string | null
        buckets?: ZernioInboxHeatmapBucket[]
      }>(
        'GET',
        `/analytics/inbox/heatmap${qs({
          profileId: profile,
          fromDate: filter.fromDate,
          toDate: filter.toDate,
          platform: filter.platform,
          accountId: filter.accountId,
          source: filter.source,
          action: filter.action,
        })}`,
        'inboxHeatmap',
      )
      return {
        from: data.from ?? filter.fromDate,
        to: data.to ?? null,
        buckets: data.buckets ?? [],
      }
    },

    async inboxSourceBreakdown(profile, filter) {
      const { data } = await json<{
        from?: string
        to?: string | null
        sources?: ZernioInboxSourceRow[]
      }>(
        'GET',
        `/analytics/inbox/source-breakdown${qs({
          profileId: profile,
          fromDate: filter.fromDate,
          toDate: filter.toDate,
          platform: filter.platform,
          accountId: filter.accountId,
        })}`,
        'inboxSourceBreakdown',
      )
      return {
        from: data.from ?? filter.fromDate,
        to: data.to ?? null,
        sources: data.sources ?? [],
      }
    },

    async inboxResponseTime(profile, filter) {
      const { data } = await json<{
        from?: string
        to?: string | null
        summary?: ZernioInboxResponseTimeSummary
        histogram?: Partial<ZernioInboxResponseTimeBucket>[]
      }>(
        'GET',
        `/analytics/inbox/response-time${qs({
          profileId: profile,
          fromDate: filter.fromDate,
          toDate: filter.toDate,
          platform: filter.platform,
          accountId: filter.accountId,
        })}`,
        'inboxResponseTime',
      )
      // `sampleSize: 0` is Zernio's own answer for "nobody replied to anybody in the
      // window" — `summary` is still an object then, not absent. Normalising it to
      // `null` here is what lets the web layer render "no paired conversations" instead
      // of a median of 0 seconds, without every caller re-deriving the same check.
      const summary = data.summary && data.summary.sampleSize > 0 ? data.summary : null
      return {
        from: data.from ?? filter.fromDate,
        to: data.to ?? null,
        summary,
        histogram: (data.histogram ?? []).map((b) => ({
          bucket: b.bucket ?? '',
          lowerSeconds: b.lowerSeconds ?? 0,
          upperSeconds: b.upperSeconds ?? null,
          count: b.count ?? 0,
        })),
      }
    },

    async inboxTopAccounts(profile, filter) {
      const { data } = await json<{
        from?: string
        to?: string | null
        accounts?: ZernioInboxTopAccount[]
      }>(
        'GET',
        `/analytics/inbox/top-accounts${qs({
          profileId: profile,
          fromDate: filter.fromDate,
          toDate: filter.toDate,
          platform: filter.platform,
          source: filter.source,
          limit: filter.limit,
        })}`,
        'inboxTopAccounts',
      )
      return {
        from: data.from ?? filter.fromDate,
        to: data.to ?? null,
        accounts: data.accounts ?? [],
      }
    },
    // ── posting analytics, profile-scoped ────────────────────────────────────

    async dailyMetrics(profile, filter) {
      const { data } = await json<{
        dailyData?: unknown[]
        platformBreakdown?: unknown[]
      }>(
        'GET',
        `/analytics/daily-metrics${qs({
          profileId: profile,
          fromDate: filter.fromDate,
          toDate: filter.toDate,
          platform: filter.platform,
          attribution: filter.attribution,
          source: filter.source,
        })}`,
        'dailyMetrics',
      )

      return {
        dailyData: (Array.isArray(data.dailyData) ? data.dailyData : [])
          .map(dailyDay)
          .filter((day): day is ZernioDailyMetricsDay => day !== null),
        platformBreakdown: (Array.isArray(data.platformBreakdown) ? data.platformBreakdown : [])
          .map(dailyPlatform)
          .filter((row): row is ZernioDailyPlatformRow => row !== null),
      }
    },
  }
}

// ── posting analytics: narrowing ─────────────────────────────────────────────

/**
 * A finite number, or NOTHING.
 *
 * Never a coerced zero. A metric that arrives as a string, a null or not at all
 * is one we hold no reading for, and the difference between that and a real
 * zero is the difference between "the platform reported none" and "we never got
 * an answer" — two sentences this product keeps apart everywhere else.
 */
function dailyNum(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string' || raw === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function dailyValues(raw: Record<string, unknown>): ZernioDailyMetricValues {
  return {
    impressions: dailyNum(raw.impressions),
    reach: dailyNum(raw.reach),
    likes: dailyNum(raw.likes),
    comments: dailyNum(raw.comments),
    shares: dailyNum(raw.shares),
    saves: dailyNum(raw.saves),
    clicks: dailyNum(raw.clicks),
    views: dailyNum(raw.views),
  }
}

/** A day without a readable date is DROPPED. An invented date is a wrong column. */
function dailyDay(raw: unknown): ZernioDailyMetricsDay | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as Record<string, unknown>
  const date = typeof row.date === 'string' ? row.date.slice(0, 10) : null
  if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null

  const platforms: Record<string, number> = {}
  if (typeof row.platforms === 'object' && row.platforms !== null) {
    for (const [platform, count] of Object.entries(row.platforms as Record<string, unknown>)) {
      const value = dailyNum(count)
      if (value !== null) platforms[platform] = value
    }
  }

  const metrics =
    typeof row.metrics === 'object' && row.metrics !== null
      ? dailyValues(row.metrics as Record<string, unknown>)
      : dailyValues({})

  return { date, postCount: dailyNum(row.postCount) ?? 0, platforms, metrics }
}

/** A breakdown row without a platform name is DROPPED, never bucketed as "other". */
function dailyPlatform(raw: unknown): ZernioDailyPlatformRow | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as Record<string, unknown>
  if (typeof row.platform !== 'string' || row.platform === '') return null
  return {
    platform: row.platform,
    postCount: dailyNum(row.postCount) ?? 0,
    ...dailyValues(row),
  }
}
