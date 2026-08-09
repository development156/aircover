import type { PublishPostPayload } from '@sahoda/shared'
import type { ResolvedConnection } from './runPublishPost'

/** A connections row plus its sealed secret, exactly as stored. */
export interface StoredConnection {
  connectionId: string
  externalAccountId: string
  status: string
  /**
   * The `connection_secrets.access_token_enc` jsonb value, untouched.
   *
   * NULL for a Zernio-fronted channel. Those connections are a REFERENCE to an
   * account Zernio holds, not a credential we hold, so there is no row in
   * `connection_secrets` to read and nothing to open (doc 13 §7).
   */
  sealedAccessToken: unknown
  /**
   * True when this row is a Zernio-fronted account rather than an OAuth grant of
   * ours. Determined by the STORE, from `external_account->>'profileId'`, because
   * only the row can answer it: x, gbp and linkedin exist in both shapes.
   */
  viaZernio?: boolean
}

/**
 * Channels whose credential lives at the aggregator rather than in our vault.
 *
 * Kept as a set rather than a boolean on the row so the reason is legible at the one
 * place it changes behaviour: these have no sealed token BY DESIGN, and demanding one
 * would fail every scheduled Instagram publish with a vault error that has nothing to
 * do with the vault.
 */
/**
 * Instagram is ALWAYS aggregator-fronted — we hold no Meta credential and file no
 * app review, so there is no other shape it could take. x, gbp and linkedin can be
 * either, and for those the answer comes from the row (`StoredConnection.viaZernio`)
 * rather than from this set. Membership here means "never has a secret of ours",
 * not "uses Zernio".
 */
const AGGREGATOR_FRONTED = new Set<string>(['instagram'])

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
    // Zernio-fronted channels carry no secret of ours. The adapter authenticates to
    // Zernio with OUR API key; the per-connection token is Meta's and Zernio's, and we
    // never see it. So the vault is not consulted, and its absence is not an error.
    if (AGGREGATOR_FRONTED.has(payload.channel) || connection.viaZernio === true) {
      if (!connection.externalAccountId) {
        throw new Error('CONNECTION_NOT_FOUND: connection carries no external account id')
      }
      return {
        connectionId: connection.connectionId,
        externalAccountId: connection.externalAccountId,
        // Deliberately empty: there is no token here, and an empty string is more
        // honest than a placeholder that could be mistaken for one.
        accessToken: '',
        // The reason we are in THIS branch, carried forward rather than re-derived.
        // `adapters.ts` cannot work it out again: x, gbp and linkedin exist in both
        // shapes, so only the row knows, and this is the last point that still holds it.
        viaZernio: true,
      }
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
      // Stated, not omitted. Reaching here means the vault opened a secret of OURS, so
      // this is an OAuth grant and not a Zernio-fronted account — and saying so costs
      // nothing while leaving it out is what broke live publishing once already.
      viaZernio: false,
    }
  }
}
