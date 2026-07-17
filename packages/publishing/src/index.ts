// @sahoda/publishing — the Constraint Engine (declarative per-platform specs,
// consumed by BOTH the editor and the adapters) plus one adapter per file
// (x.ts, gbp.ts, fixture.ts) satisfying the single PublishAdapter contract, and
// the AES-256-GCM token-vault helper. Owned by wt-pub.
//
// EncryptedToken shapes and token material stay server-internal to this package —
// they never enter @sahoda/shared. Fixture results are always labeled mode:'fixture'.
export const PUBLISHING_PACKAGE = '@sahoda/publishing' as const
