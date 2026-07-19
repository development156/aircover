import type { ConnectionPlatform } from '@sahoda/shared'

/**
 * The persistence port the OAuth callback handlers write through — THE seam between
 * wt-pub and wt-web. wt-pub owns this interface and the handlers that call it; wt-web
 * implements it with the service-role Supabase client at the mount point (writes the
 * `connections` row + the secrets into `connection_secrets`, via `upsert_connection`).
 *
 * `accessTokenEnc` and `refreshTokenEnc` are OPAQUE strings — TWO INDEPENDENT vault
 * envelopes, one per token, each serialized with `JSON.stringify`. They are sealed
 * separately (not as one bundle) precisely so each can land in its own column: the
 * envelope carries a single AES-GCM authentication tag, so a bundle could never be
 * split downstream — Postgres has no vault key and must not try.
 *
 * Store each verbatim; never parse to INSPECT, never log, never send to a client.
 * Plaintext tokens and the envelope shape stay inside @sahoda/publishing.
 *
 * Wire note for the mount: `upsert_connection` types both blobs as `jsonb` and rejects
 * anything whose `jsonb_typeof` is not `'object'`, so re-hydrate each string with
 * `JSON.parse` AT THE RPC BOUNDARY ONLY — a structural cast to hand Postgres a jsonb
 * object, never a read of the envelope's fields.
 */
export interface ConnectionExternalAccount {
  /** Platform-native full resource id (X: numeric user id; GBP: `accounts/{a}/locations/{l}`). */
  id: string
  name?: string
  handle?: string
}

export interface ConnectionUpsert {
  workspaceId: string
  platform: ConnectionPlatform
  externalAccount: ConnectionExternalAccount
  scopes: string[]
  /** ISO-8601, or null when the platform did not report an expiry. */
  expiresAt: string | null
  createdBy: string | null
  /**
   * Opaque vault-sealed ACCESS token — one envelope, this token only.
   * → `connection_secrets.access_token_enc` (jsonb NOT NULL), i.e. the
   * `p_access_token_enc` argument of `upsert_connection`. Always present.
   */
  accessTokenEnc: string
  /**
   * Opaque vault-sealed REFRESH token — one envelope, this token only.
   * → `connection_secrets.refresh_token_enc` (jsonb NULLABLE), i.e. the
   * `p_refresh_token_enc` argument of `upsert_connection`.
   *
   * `null` when the provider issued no refresh token (normal for some grants): persist
   * SQL NULL. Never substitute a sealed empty string — that would read as a credential.
   */
  refreshTokenEnc: string | null
}

export interface ConnectionStore {
  /**
   * Insert or refresh the (workspace, platform, external account) connection; returns
   * its row id. Reject/throw on failure — the OAuth handlers catch and map it to a
   * PROVIDER_ERROR Result, so implementations should NOT swallow errors themselves.
   */
  upsertConnection(record: ConnectionUpsert): Promise<{ connectionId: string }>
}

/** What a completed OAuth connect returns to the UI — metadata only, never token material. */
export interface ConnectionSummary {
  connectionId: string
  platform: ConnectionPlatform
  externalAccount: ConnectionExternalAccount
  scopes: string[]
  expiresAt: string | null
}
