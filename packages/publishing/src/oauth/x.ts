import { createHash } from 'node:crypto'
import { z } from 'zod'
import { ok, type Result } from '@sahoda/shared'
import type { ConnectionExternalAccount, ConnectionSummary } from './store'
import {
  callProvider,
  cleanDisplay,
  computeExpiresAt,
  defaultRandomString,
  defaultSeal,
  guardCallback,
  newTraceId,
  parseJson,
  parseScopes,
  providerErr,
  requireOAuthConfig,
  OAuthTokenResponseSchema,
  type OAuthCallbackParams,
  type OAuthHandlerDeps,
} from './common'

/**
 * X OAuth 2.0 (authorization-code + PKCE S256), framework-agnostic. wt-web mounts
 * these as thin routes: `beginAuthorize()` → redirect + stash {state, codeVerifier}
 * in an httpOnly cookie; the callback route replays them into `handleCallback()`.
 * Tokens are sealed in-memory and persisted only through the ConnectionStore port —
 * they never appear in results, errors, or logs.
 */
const X_AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize'
const X_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'
const X_ME_URL = 'https://api.twitter.com/2/users/me'
/** tweet.write to publish; media.write for media upload; offline.access for refresh. */
const X_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access', 'media.write']
const STATE_BYTES = 16
const VERIFIER_BYTES = 32 // → 43 base64url chars, the PKCE minimum

const XMeResponseSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    name: z.string().optional(),
    username: z.string().optional(),
  }),
})

export interface XAuthorizeStart {
  url: string
  state: string
  codeVerifier: string
}

export interface XCallbackArgs {
  params: OAuthCallbackParams
  expectedState: string
  codeVerifier: string
  workspaceId: string
  createdBy?: string
  traceId?: string
}

export interface XOAuthHandlers {
  beginAuthorize(): XAuthorizeStart
  handleCallback(args: XCallbackArgs): Promise<Result<ConnectionSummary>>
}

export function createXOAuthHandlers(deps: OAuthHandlerDeps): XOAuthHandlers {
  requireOAuthConfig(deps, 'X')
  const now = deps.now ?? (() => new Date())
  const randomString = deps.randomString ?? defaultRandomString
  const seal = deps.seal ?? defaultSeal

  return {
    beginAuthorize(): XAuthorizeStart {
      const state = randomString(STATE_BYTES)
      const codeVerifier = randomString(VERIFIER_BYTES)
      const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: deps.clientId,
        redirect_uri: deps.redirectUri,
        scope: X_SCOPES.join(' '),
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      })
      return { url: `${X_AUTHORIZE_URL}?${params.toString()}`, state, codeVerifier }
    },

    async handleCallback(args: XCallbackArgs): Promise<Result<ConnectionSummary>> {
      const traceId = args.traceId ?? newTraceId()

      const guarded = guardCallback(args.params, args.expectedState, traceId, 'X')
      if (guarded) return guarded

      const tokenRes = await callProvider(
        deps.transport,
        {
          method: 'POST',
          url: X_TOKEN_URL,
          headers: {
            Authorization: `Basic ${Buffer.from(`${deps.clientId}:${deps.clientSecret}`).toString('base64')}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: args.params.code ?? '',
            redirect_uri: deps.redirectUri,
            code_verifier: args.codeVerifier,
          }).toString(),
        },
        traceId,
        {
          unreachable: 'Could not reach X to exchange the authorization code.',
          failed: 'X token exchange failed',
        },
      )
      if (!tokenRes.ok) return tokenRes
      const token = OAuthTokenResponseSchema.safeParse(parseJson(tokenRes.data.body))
      if (!token.success) {
        return providerErr(traceId, 'X returned an unexpected token response.')
      }

      const meRes = await callProvider(
        deps.transport,
        {
          method: 'GET',
          url: X_ME_URL,
          headers: { Authorization: `Bearer ${token.data.access_token}` },
        },
        traceId,
        {
          unreachable: 'Could not reach X to verify the connected account.',
          failed: 'X profile check failed',
        },
      )
      if (!meRes.ok) return meRes
      const me = XMeResponseSchema.safeParse(parseJson(meRes.data.body))
      if (!me.success) {
        return providerErr(traceId, 'X returned an unexpected profile response.')
      }

      const expiresAt = computeExpiresAt(now(), token.data.expires_in)
      const scopes = parseScopes(token.data.scope, X_SCOPES)
      const handle =
        me.data.data.username !== undefined ? cleanDisplay(me.data.data.username) : undefined
      const name = me.data.data.name !== undefined ? cleanDisplay(me.data.data.name) : undefined
      const externalAccount: ConnectionExternalAccount = {
        id: me.data.data.id,
        ...(handle !== undefined ? { handle } : {}),
        ...(name !== undefined ? { name } : {}),
      }

      try {
        const { connectionId } = await deps.store.upsertConnection({
          workspaceId: args.workspaceId,
          platform: 'x',
          externalAccount,
          scopes,
          expiresAt,
          createdBy: args.createdBy ?? null,
          encryptedSecret: seal(
            JSON.stringify({
              accessToken: token.data.access_token,
              refreshToken: token.data.refresh_token ?? null,
            }),
          ),
        })
        return ok({ connectionId, platform: 'x' as const, externalAccount, scopes, expiresAt })
      } catch {
        // Seal/store failures must surface as a Result, and their raw error text (which
        // handled token material moments earlier) must never escape to the caller.
        return providerErr(traceId, 'Could not save the connection — try again.')
      }
    },
  }
}
