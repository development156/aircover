import type { ConnectionPlatform } from '@sahoda/shared'

/**
 * The persistence port the OAuth callback handlers write through — THE seam between
 * wt-pub and wt-web. wt-pub owns this interface and the handlers that call it; wt-web
 * implements it with the service-role Supabase client at the mount point (writes the
 * `connections` row + the secret into `connection_secrets`).
 *
 * `encryptedSecret` is an OPAQUE string (a vault-sealed envelope, serialized). Store it
 * verbatim; never parse, never log, never send to a client. Plaintext tokens and the
 * envelope shape stay inside @sahoda/publishing.
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
  /** Opaque vault-sealed token bundle. Persist verbatim into connection_secrets. */
  encryptedSecret: string
}

export interface ConnectionStore {
  /** Insert or refresh the (workspace, platform, external account) connection; returns its row id. */
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
