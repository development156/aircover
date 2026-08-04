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

export {
  ensureZernioProfile,
  reconcileAccounts,
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
export {
  createZernioAdapter,
  ZERNIO_PLATFORM_NAME,
  type ZernioAdapterDeps,
} from './adapters/zernio'
