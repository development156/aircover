import type { PublishPostPayload } from '@sahoda/shared'
import type { ResolvedConnection } from './runPublishPost'

/** A connections row plus its sealed secret, exactly as stored. */
export interface StoredConnection {
  connectionId: string
  externalAccountId: string
  status: string
  /** The `connection_secrets.access_token_enc` jsonb value, untouched. */
  sealedAccessToken: unknown
}

/**
 * Opens a sealed token envelope. BLOCKED: packages/publishing deliberately exports no
 * vault symbol and its `exports` map has no subpath, so there is currently no sanctioned
 * implementation — see apps/jobs/REQUESTS.md ("wt-pub: no way to open a connection
 * secret"). Re-implementing AES-256-GCM here would duplicate a private envelope format
 * and break the rule that token material stays inside packages/publishing, so this stays
 * an unfilled seam until that export lands.
 */
export type OpenSecret = (sealed: unknown) => string

export interface ConnectionResolverDeps {
  loadConnection(payload: PublishPostPayload): Promise<StoredConnection | null>
  openSecret?: OpenSecret
}

/**
 * Resolves the connection a publish attempt will use, returning the access token in job
 * memory only — it is never logged, persisted, or attached to an error. Every failure is
 * a bare code so nothing about the envelope or the token can reach post_publish_logs.
 */
export function createConnectionResolver(
  deps: ConnectionResolverDeps,
): (payload: PublishPostPayload) => Promise<ResolvedConnection> {
  return async (payload: PublishPostPayload): Promise<ResolvedConnection> => {
    const connection = await deps.loadConnection(payload)
    if (!connection) {
      throw new Error(`CONNECTION_NOT_FOUND: no ${payload.channel} connection for this workspace`)
    }
    if (connection.status !== 'active') {
      throw new Error(
        `CONNECTION_NOT_ACTIVE: ${payload.channel} connection is ${connection.status}`,
      )
    }
    if (!deps.openSecret) {
      throw new Error(
        'TOKEN_VAULT_UNAVAILABLE: no sanctioned opener for connection secrets (see REQUESTS.md)',
      )
    }

    let accessToken: string
    try {
      accessToken = deps.openSecret(connection.sealedAccessToken)
    } catch {
      // The cause is swallowed on purpose: an opener's own message may embed the
      // ciphertext or key material, and this error is written to a log row.
      throw new Error('TOKEN_OPEN_FAILED: could not open the stored connection secret')
    }

    if (accessToken.length === 0) {
      throw new Error('TOKEN_OPEN_FAILED: opened secret was empty')
    }

    return {
      connectionId: connection.connectionId,
      externalAccountId: connection.externalAccountId,
      accessToken,
    }
  }
}
