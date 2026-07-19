import { z } from 'zod'
import { ok, type Result } from '@sahoda/shared'
import type { Transport, TransportResponse } from '../transport'
import type { ConnectionStore, ConnectionSummary } from './store'
import {
  defaultRandomString,
  defaultSeal,
  defaultUnseal,
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
 * Google Business Profile OAuth (authorization-code, offline access), framework-agnostic.
 * After the token exchange the handler discovers the business account + location because
 * the connection contract requires the FULL `accounts/{a}/locations/{l}` id. Exactly one
 * location → auto-connect. Several → a `choose_location` outcome carrying a vault-sealed
 * resume token (wt-web never holds plaintext tokens) that `completeConnection()` redeems
 * within a short TTL. Zero → an honest error, never a fake connect.
 */
const GBP_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GBP_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GBP_ACCOUNTS_URL = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts'
const GBP_LOCATIONS_HOST = 'https://mybusinessbusinessinformation.googleapis.com/v1'
const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage'
const STATE_BYTES = 16
const RESUME_TTL_MS = 10 * 60 * 1000

/** Only a well-formed API resource name may be embedded into a request URL. */
const ACCOUNT_NAME_RE = /^accounts\/[A-Za-z0-9_-]+$/
const LOCATION_NAME_RE = /^locations\/[A-Za-z0-9_-]+$/

const GoogleTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
})

const AccountsResponseSchema = z.object({
  accounts: z.array(z.object({ name: z.string(), accountName: z.string().optional() })).optional(),
})

const LocationsResponseSchema = z.object({
  locations: z.array(z.object({ name: z.string(), title: z.string().optional() })).optional(),
})

const GbpLocationChoiceSchema = z.object({
  name: z.string(),
  title: z.string(),
  accountName: z.string(),
})

/** Sealed into the resume token — server-internal shape, opaque outside this package. */
const ResumePayloadSchema = z.object({
  issuedAt: z.iso.datetime(),
  accessToken: z.string(),
  refreshToken: z.string().nullable(),
  expiresAt: z.string().nullable(),
  scopes: z.array(z.string()),
  locations: z.array(GbpLocationChoiceSchema),
})

export type GbpLocationChoice = z.infer<typeof GbpLocationChoiceSchema>

export interface GbpAuthorizeStart {
  url: string
  state: string
}

export interface GbpCallbackArgs {
  params: OAuthCallbackParams
  expectedState: string
  workspaceId: string
  createdBy?: string
  traceId?: string
}

export type GbpCallbackOutcome =
  | { kind: 'connected'; connection: ConnectionSummary }
  | { kind: 'choose_location'; locations: GbpLocationChoice[]; resumeToken: string }

export interface GbpCompleteArgs {
  resumeToken: string
  locationName: string
  workspaceId: string
  createdBy?: string
  traceId?: string
}

export interface GbpOAuthHandlers {
  beginAuthorize(): GbpAuthorizeStart
  handleCallback(args: GbpCallbackArgs): Promise<Result<GbpCallbackOutcome>>
  completeConnection(args: GbpCompleteArgs): Promise<Result<ConnectionSummary>>
}

export function createGbpOAuthHandlers(deps: OAuthHandlerDeps): GbpOAuthHandlers {
  requireOAuthConfig(deps, 'GBP')
  const now = deps.now ?? (() => new Date())
  const randomString = deps.randomString ?? defaultRandomString
  const seal = deps.seal ?? defaultSeal
  const unseal = deps.unseal ?? defaultUnseal

  async function persist(args: {
    workspaceId: string
    createdBy?: string
    location: GbpLocationChoice
    scopes: string[]
    expiresAt: string | null
    accessToken: string
    refreshToken: string | null
  }): Promise<Result<ConnectionSummary>> {
    const externalAccount = {
      id: `${args.location.accountName}/${args.location.name}`,
      name: args.location.title,
    }
    const { connectionId } = await deps.store.upsertConnection({
      workspaceId: args.workspaceId,
      platform: 'gbp',
      externalAccount,
      scopes: args.scopes,
      expiresAt: args.expiresAt,
      createdBy: args.createdBy ?? null,
      encryptedSecret: seal(
        JSON.stringify({ accessToken: args.accessToken, refreshToken: args.refreshToken }),
      ),
    })
    return ok({
      connectionId,
      platform: 'gbp' as const,
      externalAccount,
      scopes: args.scopes,
      expiresAt: args.expiresAt,
    })
  }

  return {
    beginAuthorize(): GbpAuthorizeStart {
      const state = randomString(STATE_BYTES)
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: deps.clientId,
        redirect_uri: deps.redirectUri,
        scope: GBP_SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        state,
      })
      return { url: `${GBP_AUTHORIZE_URL}?${params.toString()}`, state }
    },

    async handleCallback(args: GbpCallbackArgs): Promise<Result<GbpCallbackOutcome>> {
      const traceId = args.traceId ?? newTraceId()

      if (args.params.error) {
        return providerErr(
          traceId,
          `Google authorization was declined (${sanitizeOAuthErrorCode(args.params.error)}).`,
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
          url: GBP_TOKEN_URL,
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: args.params.code,
            client_id: deps.clientId,
            client_secret: deps.clientSecret,
            redirect_uri: deps.redirectUri,
          }).toString(),
        })
      } catch {
        return providerErr(traceId, 'Could not reach Google to exchange the authorization code.')
      }
      if (tokenRes.status !== 200) {
        return providerErr(traceId, `Google token exchange failed (HTTP ${tokenRes.status}).`, {
          status: tokenRes.status,
        })
      }
      const token = GoogleTokenResponseSchema.safeParse(parseJson(tokenRes.body))
      if (!token.success) {
        return providerErr(traceId, 'Google returned an unexpected token response.')
      }
      const accessToken = token.data.access_token
      const refreshToken = token.data.refresh_token ?? null
      const scopes = token.data.scope ? token.data.scope.split(' ').filter(Boolean) : [GBP_SCOPE]
      const expiresAt =
        token.data.expires_in !== undefined
          ? new Date(now().getTime() + token.data.expires_in * 1000).toISOString()
          : null

      const locations = await discoverLocations(deps.transport, accessToken)
      if (locations === undefined) {
        return providerErr(traceId, 'Could not list Google Business Profile accounts.')
      }
      if (locations.length === 0) {
        return providerErr(
          traceId,
          'No Google Business Profile location was found on this Google account.',
        )
      }

      if (locations.length === 1) {
        const connected = await persist({
          workspaceId: args.workspaceId,
          ...(args.createdBy !== undefined ? { createdBy: args.createdBy } : {}),
          location: locations[0]!,
          scopes,
          expiresAt,
          accessToken,
          refreshToken,
        })
        if (!connected.ok) return connected
        return ok({ kind: 'connected' as const, connection: connected.data })
      }

      const resumeToken = seal(
        JSON.stringify({
          issuedAt: now().toISOString(),
          accessToken,
          refreshToken,
          expiresAt,
          scopes,
          locations,
        }),
      )
      return ok({ kind: 'choose_location' as const, locations, resumeToken })
    },

    async completeConnection(args: GbpCompleteArgs): Promise<Result<ConnectionSummary>> {
      const traceId = args.traceId ?? newTraceId()

      let payload: z.infer<typeof ResumePayloadSchema>
      try {
        const parsed = ResumePayloadSchema.safeParse(JSON.parse(unseal(args.resumeToken)))
        if (!parsed.success) {
          return validationErr(traceId, 'Invalid resume token — restart the connect flow.')
        }
        payload = parsed.data
      } catch {
        return validationErr(traceId, 'Invalid resume token — restart the connect flow.')
      }

      if (now().getTime() - Date.parse(payload.issuedAt) > RESUME_TTL_MS) {
        return validationErr(traceId, 'The location choice expired — restart the connect flow.')
      }
      const location = payload.locations.find((l) => l.name === args.locationName)
      if (!location) {
        return validationErr(traceId, 'That location was not offered — restart the connect flow.')
      }

      return persist({
        workspaceId: args.workspaceId,
        ...(args.createdBy !== undefined ? { createdBy: args.createdBy } : {}),
        location,
        scopes: payload.scopes,
        expiresAt: payload.expiresAt,
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
      })
    },
  }
}

/**
 * Accounts → locations discovery. Returns undefined when the accounts call itself fails;
 * an account whose resource name is malformed is SKIPPED (never embedded into a URL).
 */
async function discoverLocations(
  transport: Transport,
  accessToken: string,
): Promise<GbpLocationChoice[] | undefined> {
  let accountsRes: TransportResponse
  try {
    accountsRes = await transport({
      method: 'GET',
      url: GBP_ACCOUNTS_URL,
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch {
    return undefined
  }
  if (accountsRes.status !== 200) return undefined
  const accounts = AccountsResponseSchema.safeParse(parseJson(accountsRes.body))
  if (!accounts.success) return undefined

  const validAccounts = (accounts.data.accounts ?? []).filter((a) => ACCOUNT_NAME_RE.test(a.name))

  const perAccount = await Promise.all(
    validAccounts.map(async (account): Promise<GbpLocationChoice[]> => {
      let res: TransportResponse
      try {
        res = await transport({
          method: 'GET',
          url: `${GBP_LOCATIONS_HOST}/${account.name}/locations?readMask=name,title&pageSize=100`,
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      } catch {
        return []
      }
      if (res.status !== 200) return []
      const parsed = LocationsResponseSchema.safeParse(parseJson(res.body))
      if (!parsed.success) return []
      return (parsed.data.locations ?? [])
        .filter((l) => LOCATION_NAME_RE.test(l.name))
        .map((l) => ({ name: l.name, title: l.title ?? l.name, accountName: account.name }))
    }),
  )
  return perAccount.flat()
}
