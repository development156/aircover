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

// OAuth handlers (framework-agnostic; wt-web mounts them as thin routes) + the
// ConnectionStore port wt-web implements with the service-role client.
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
