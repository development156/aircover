import { createHash } from 'node:crypto'
import { z } from 'zod'
import { ok, type Result } from '@sahoda/shared'
import type { TransportResponse } from '../transport'
import type { ConnectionExternalAccount, ConnectionSummary } from './store'
import {
  defaultRandomString,
  defaultSeal,
  newTraceId,
  parseJson,
  providerErr,
  requireOAuthConfig,
  sanitizeOAuthErrorCode,
  validationErr,
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
/** tweet.write to publish; offline.access for the refresh token the expiry sweep needs. */
const X_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access']
const STATE_BYTES = 16
const VERIFIER_BYTES = 32 // → 43 base64url chars, the PKCE minimum

const XTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
})

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

      if (args.params.error) {
        return providerErr(
          traceId,
          `X authorization was declined (${sanitizeOAuthErrorCode(args.params.error)}).`,
        )
      }
      if (!args.params.state || args.params.state !== args.expectedState) {
        return validationErr(traceId, 'OAuth state mismatch — restart the connect flow.')
      }
      if (!args.params.code) {
        return validationErr(traceId, 'Missing authorization code — restart the connect flow.')
      }

      let tokenRes: TransportResponse
      try {
        tokenRes = await deps.transport({
          method: 'POST',
          url: X_TOKEN_URL,
          headers: {
            Authorization: `Basic ${Buffer.from(`${deps.clientId}:${deps.clientSecret}`).toString('base64')}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: args.params.code,
            redirect_uri: deps.redirectUri,
            code_verifier: args.codeVerifier,
          }).toString(),
        })
      } catch {
        return providerErr(traceId, 'Could not reach X to exchange the authorization code.')
      }
      if (tokenRes.status !== 200) {
        return providerErr(traceId, `X token exchange failed (HTTP ${tokenRes.status}).`, {
          status: tokenRes.status,
        })
      }
      const token = XTokenResponseSchema.safeParse(parseJson(tokenRes.body))
      if (!token.success) {
        return providerErr(traceId, 'X returned an unexpected token response.')
      }

      let meRes: TransportResponse
      try {
        meRes = await deps.transport({
          method: 'GET',
          url: X_ME_URL,
          headers: { Authorization: `Bearer ${token.data.access_token}` },
        })
      } catch {
        return providerErr(traceId, 'Could not reach X to verify the connected account.')
      }
      if (meRes.status !== 200) {
        return providerErr(traceId, `X profile check failed (HTTP ${meRes.status}).`, {
          status: meRes.status,
        })
      }
      const me = XMeResponseSchema.safeParse(parseJson(meRes.body))
      if (!me.success) {
        return providerErr(traceId, 'X returned an unexpected profile response.')
      }

      const expiresAt =
        token.data.expires_in !== undefined
          ? new Date(now().getTime() + token.data.expires_in * 1000).toISOString()
          : null
      const scopes = token.data.scope ? token.data.scope.split(' ').filter(Boolean) : X_SCOPES
      const externalAccount: ConnectionExternalAccount = {
        id: me.data.data.id,
        ...(me.data.data.username !== undefined ? { handle: me.data.data.username } : {}),
        ...(me.data.data.name !== undefined ? { name: me.data.data.name } : {}),
      }

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
    },
  }
}
