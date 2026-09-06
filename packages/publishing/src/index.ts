// @sahoda/publishing — the publish adapters (one file per platform, each satisfying the
// frozen PublishAdapter contract) and the injectable HTTP transport they publish through.
//
// The Constraint Engine is CONSUMED from @sahoda/shared, never redefined here.
// The AES-256-GCM token vault (encryptToken/decryptToken, EncryptedToken) is deliberately
// NOT exported — it and all token material stay server-internal to this package, and the
// EncryptedToken envelope never enters @sahoda/shared (CLAUDE.md non-negotiable).
export const PUBLISHING_PACKAGE = '@sahoda/publishing' as const

// Injectable HTTP transport — production wires fetchTransport; tests/dev replay fixtures.
export {
  fetchTransport,
  fixtureTransport,
  routedTransport,
  type FixtureRoute,
  type Transport,
  type TransportRequest,
  type TransportResponse,
  type RecordedResponse,
} from './transport'

// Publish adapters.
export { createFixtureAdapter, type FixtureAdapterOptions } from './adapters/fixture'
export { createXAdapter, type XAdapterDeps } from './adapters/x'
export { type ReadMedia } from './adapters/x-media'
export { createGbpAdapter, type GbpAdapterDeps } from './adapters/gbp'

// OAuth handlers (framework-agnostic; wt-web mounts them as thin routes) + the
// ConnectionStore port wt-web implements with the service-role client. A ConnectionUpsert
// carries TWO opaque sealed blobs — `accessTokenEnc` / `refreshTokenEnc` — one per
// connection_secrets column; see ./oauth/store for the exact column mapping.
export type {
  ConnectionStore,
  ConnectionUpsert,
  ConnectionExternalAccount,
  ConnectionSummary,
} from './oauth/store'
export type { OAuthHandlerDeps, OAuthCallbackParams } from './oauth/common'
export {
  createXOAuthHandlers,
  type XOAuthHandlers,
  type XAuthorizeStart,
  type XCallbackArgs,
} from './oauth/x'
export {
  createGbpOAuthHandlers,
  type GbpOAuthHandlers,
  type GbpAuthorizeStart,
  type GbpCallbackArgs,
  type GbpCallbackOutcome,
  type GbpCompleteArgs,
  type GbpLocationChoice,
} from './oauth/gbp'

// ── Zernio rail (Instagram, and the aggregator path for everything after it) ──
// Zernio holds the platform OAuth token; we hold a REFERENCE to an account. That is
// why these do not touch the vault and why an instagram `connections` row has no
// `connection_secrets` sibling.
export {
  createZernioClient,
  ZernioError,
  ZERNIO_BASE_URL,
  ZERNIO_ID_RE,
  BROWSER_UA,
  type ZernioClient,
  type ZernioClientDeps,
  type ZernioAccount,
  type ZernioConnectChoice,
  type ZernioTelegramCode,
  type ZernioTelegramStatus,
  type ZernioSelectionPlatform,
  type ZernioSelectionState,
  type ZernioProfile,
  type ZernioPost,
  type ZernioPlatformResult,
  type ZernioPresign,
  type ZernioCreatePostInput,
  type ZernioCreatePostResponse,
  type ZernioMediaItemInput,
  type ZernioHeadResult,
  type ZernioRateLimit,
} from './zernio/client'

// ── Tenant scoping for Zernio READS ──────────────────────────────────────────
// `profileId` and `accountId` are optional filters on Zernio's side, and an omitted
// profileId reads across every tenant on the key. These branded ids make omission a
// compile error: only scopeProfile/scopeAccount can produce one, and only from a row
// already fetched for a known workspace. See zernio/scope.ts.
export {
  scopeProfile,
  scopeAccount,
  ScopeError,
  type ScopedProfileId,
  type ScopedAccountId,
  type ZernioProfileRow,
  type ZernioConnectionRow,
} from './zernio/scope'

export {
  createZernioReads,
  // The ONE place Zernio's `direction` vocabulary is interpreted. Comparing the raw
  // field is what shipped a thread where every message read as the shop owner's.
  messageDirection,
  type MessageDirection,
  type ZernioReads,
  type ZernioCursorPage,
  type ZernioOffsetPage,
  type ZernioInboxMeta,
  type ZernioPostAnalytics,
  type ZernioPostAnalyticsResult,
  type ZernioPostMetrics,
  type ZernioConversation,
  type ZernioMessage,
  type ZernioCommentedPost,
  type ZernioComment,
  type ZernioReview,
  type ZernioPaged,
  type ZernioPlatformFilter,
  type ZernioMessagePage,
  type MessageSortOrder,
  type ZernioDemographicBucket,
  type ZernioInstagramDemographics,
  type ZernioInboxAnalyticsFilter,
  type ZernioInboxVolume,
  type ZernioInboxVolumeSummary,
  type ZernioInboxVolumeDay,
  type ZernioInboxVolumePlatform,
  type ZernioInboxHeatmap,
  type ZernioInboxHeatmapBucket,
  type ZernioInboxSourceBreakdown,
  type ZernioInboxSourceRow,
  type ZernioInboxSourcePlatform,
  type ZernioInboxResponseTime,
  type ZernioInboxResponseTimeSummary,
  type ZernioInboxResponseTimeBucket,
  type ZernioInboxTopAccounts,
  type ZernioInboxTopAccount,
  // ── posting analytics ──────────────────────────────────────────────────────
  type ZernioDailyMetrics,
  type ZernioDailyMetricsDay,
  type ZernioDailyMetricValues,
  type ZernioDailyMetricsFilter,
  type ZernioDailyPlatformRow,
  type ZernioFollowerAccount,
  type ZernioFollowerPoint,
  type ZernioFollowerStats,
  type ZernioFollowerStatsFilter,
  type ZernioFrequencyRow,
  type ZernioDecayBucket,
  type ZernioPostingAnalyticsFilter,
} from './zernio/reads'

// ── What an audience read is ALLOWED to claim ────────────────────────────────
// Its sibling `analytics-state` exists because Zernio answers with ZEROES where
// nothing was measured. This exists because it answers with an EMPTY ARRAY in four
// situations that need four different sentences — and one of them, an account under
// Meta's 100-follower floor, is byte-identical to "the platform reported nothing".
// Nothing outside this module may decide which it was.
export {
  classifyAudience,
  breakdownFrom,
  bucketsFrom,
  mayOfferRetry,
  AUDIENCE_DIMENSIONS,
  DEMOGRAPHICS_FOLLOWER_FLOOR,
  POPULATION_METRIC,
  type AudienceState,
  type AudienceBreakdown,
  type AudienceBucket,
  type AudienceDimension,
  type AudiencePopulation,
} from './zernio/audience-state'

// ── The inbox WRITE surface, deliberately a separate handle ──────────────────
// `ZernioReads` has no method that can post, and screens that display a conversation
// hold only that. Replying requires importing this instead — so the capability is
// granted where it is used and is absent everywhere else, rather than being present
// and merely unused. Every method takes the workspace's profile FIRST: doc 13 §3, where
// a wrong accountId does not error but replies on another customer's account with a 200.
export {
  createZernioSends,
  type ZernioSends,
  type ReplyReceipt,
  type AttachmentType,
  type SendMessageInput,
  type ReplyToCommentInput,
  type ReplyToReviewInput,
} from './zernio/sends'

// ── What a metric is allowed to CLAIM ────────────────────────────────────────
// Zernio returns zeroes for a post it has not computed (202), one it cannot tie to
// an account (orphaned), and one still inside Instagram's ~48h reporting lag. None
// of those is a measurement. `classifyPostMetrics` is the single place that call is
// made — the UI renders its verdict and never re-derives one. See zernio/analytics-state.ts.
export {
  classifyPostMetrics,
  lagHoursFromDataDelay,
  reportingWindowFor,
  CHANNEL_REPORTING_WINDOW,
  UNKNOWN_WINDOW,
  INSTAGRAM_INSIGHTS_LAG_HOURS,
  INSTAGRAM_FOLLOWER_LAG_HOURS,
  type MetricAvailability,
  type MetricNumber,
  type PostMetrics,
  type ClassifyInput,
  type ReportingWindow,
} from './zernio/analytics-state'

export {
  ensureZernioProfile,
  reconcileAccounts,
  reconcileFromAccounts,
  profileNameForWorkspace,
  ZERNIO_DEFAULT_PROFILE_ID,
  type ReconciledAccount,
} from './zernio/connect'

export {
  uploadMediaToZernio,
  decodeBase64Image,
  sniffMime,
  type UploadedMedia,
  type UploadMediaInput,
} from './zernio/media'

export { createInstagramAdapter, type InstagramAdapterDeps } from './adapters/instagram'

// The format dimension. Lives here rather than in the frozen Constraint Engine,
// and every rule is DERIVED from the spec fields that engine already has — so a
// contract that one day admits a video mime stops refusing video on its own.
export {
  CHANNEL_FORMATS,
  FORMAT_MEDIA,
  POST_FORMATS,
  acceptsMultipleMedia,
  acceptsTextOnly,
  acceptsVideo,
  defaultFormatFor,
  formatsFor,
  isPostFormat,
  mediaRuleFor,
  refuseFormat,
  refuseFormatMedia,
} from './format'
export type {
  FormatAttachment,
  FormatMediaRule,
  FormatRefusal,
  PostFormat,
  ResolvedMediaRule,
  ThreadPlan,
  ThreadPlanResult,
  ThreadSegment,
} from './format'
// One body, split into the posts X publishes. See thread-split.ts for why a
// thread is a DERIVATION of the single body and not a second place to author.
export {
  countCodePoints,
  describeThread,
  linkWeightOf,
  planThread,
  segmentLimitFor,
  splitIntoThread,
} from './format'
export {
  createZernioAdapter,
  ZERNIO_PLATFORM_NAME,
  type ZernioAdapterDeps,
} from './adapters/zernio'

// The per-channel controls a version carries — poll, Google topic, first comment,
// collaborators, AI disclosure. Rules live beside the parse because for most of
// these NOBODY ELSE CHECKS: Zernio validates Google's platformSpecificData not at
// all, and polls are the one block it fully enforces (docs/32 §4).
// The per-platform half of a publish payload. Exported so the chain from a
// composer control to the wire can be followed END TO END in one test — the
// Google button had tests at both ends and died in the middle.
export {
  buildPlatformData,
  zernioMediaType,
  type PlatformData,
  type PlatformDataInput,
  type PlatformDataResult,
} from './zernio/platform-data'

// What can be done to a post AFTER it is live. The platform vocabulary here is
// NOT the publish one — gbp is `googlebusiness`, not `google`, and edit accepts
// only twitter of our four. Both measured from the endpoints' own 400s.
export {
  canRecover,
  recoveryPlatform,
  recoveryUnavailableReason,
  type RecoveryAction,
} from './zernio/recovery'

export {
  refusePoll,
  refuseGbpTopic,
  parseIsoDate,
  LINKEDIN_POLL_DURATIONS,
  POLL_MIN_OPTIONS,
  POLL_MAX_OPTIONS,
  X_POLL_OPTION_MAX,
  X_POLL_MIN_MINUTES,
  X_POLL_MAX_MINUTES,
  LINKEDIN_POLL_QUESTION_MAX,
  INSTAGRAM_MAX_COLLABORATORS,
  type VariantOptions,
  type PollOption,
  type GbpEventOption,
  type GbpOfferOption,
} from './zernio/variant-options'

// ── X's per-post economics ────────────────────────────────────────────────────
// X is the only channel that bills per post, and 13.3× more when the post carries
// a link. Both the /connections meter (apps/web) and the pre-spend refusal
// (apps/jobs) read these, so the ration exists exactly once.
export {
  X_API_PRICE_USD,
  X_RATE_LIMIT,
  X_MONTHLY_RATION,
  X_RATION_EXHAUSTED_CODE,
  X_RATION_UNREADABLE_CODE,
  xRationWindowStart,
  xPostPriceUsd,
  checkXRation,
  xRationRefusalMessage,
  type XRationVerdict,
} from './x-cost'

// ── Zernio webhooks: the INBOUND half of the integration ────────────────────
// Everything else in this package asks Zernio for something. These three modules
// handle Zernio telling US something, which is the direction that makes the inbox
// local and survivable. The contract they implement is parsed, not summarised, in
// docs/29_Zernio_Webhooks_Contract.md.
//
// `VerifiedZernioBody` is a branded type only `verifyZernioWebhook` can mint, and
// `parseZernioWebhook` accepts nothing else — so parsing bytes whose signature was
// never checked is a compile error rather than a review comment.
export {
  ZERNIO_SIGNATURE_HEADER,
  ZERNIO_SIGNATURE_HEADER_LEGACY,
  signZernioBody,
  verifyZernioWebhook,
  type VerifiedZernioBody,
  type ZernioVerification,
} from './zernio/webhook-signature'
export {
  decideRouting,
  parseZernioWebhook,
  type ParsedZernioWebhook,
  type ZernioWebhookParse,
  type ZernioWebhookRouting,
} from './zernio/webhook-payload'
