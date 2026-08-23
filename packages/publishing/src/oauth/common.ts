import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { appError, err, ok, type Result } from '@sahoda/shared'
import type { Transport, TransportRequest, TransportResponse } from '../transport'
import { createTokenVault, keyringFromEnv } from '../vault/token-vault'
import type { ConnectionStore } from './store'

/**
 * Shared plumbing for the framework-agnostic OAuth handlers (X, GBP). The handlers are
 * pure request/response logic: wt-web mounts them as thin routes, owns cookies/sessions
 * for `state`/`codeVerifier` round-trips, and injects the real transport + store.
 */
export interface OAuthHandlerDeps {
  clientId: string
  clientSecret: string
  redirectUri: string
  transport: Transport
  store: ConnectionStore
  /** Seals a secret string for at-rest storage. Defaults to the env-keyed AES-GCM vault. */
  seal?: (plaintext: string) => string
  /** Inverse of `seal`. Defaults to the env-keyed AES-GCM vault. */
  unseal?: (sealed: string) => string
  now?: () => Date
  /** URL-safe random string generator (`bytes` of entropy). Defaults to crypto randomBytes. */
  randomString?: (bytes: number) => string
}

/** Query params a provider sends back to the callback route. */
export interface OAuthCallbackParams {
  code?: string
  state?: string
  error?: string
}

export function requireOAuthConfig(deps: OAuthHandlerDeps, platformLabel: string): void {
  if (!deps.clientId || !deps.clientSecret || !deps.redirectUri) {
    throw new Error(`${platformLabel} OAuth: clientId, clientSecret and redirectUri are required`)
  }
}

export const defaultRandomString = (bytes: number): string =>
  randomBytes(bytes).toString('base64url')

/** Env-vault default sealer — the envelope stays an opaque string outside this package. */
export const defaultSeal = (plaintext: string): string =>
  JSON.stringify(createTokenVault(keyringFromEnv()).encrypt(plaintext))

export const defaultUnseal = (sealed: string): string =>
  createTokenVault(keyringFromEnv()).decrypt(JSON.parse(sealed))

/** The single user-facing message for any failure on the persist path. */
export const CONNECT_SAVE_FAILED = 'Could not save the connection. Try again.'

export const newTraceId = (): string => randomUUID()

export const providerErr = (traceId: string, message: string, details?: unknown): Result<never> =>
  err(appError('PROVIDER_ERROR', message, traceId, details))

export const validationErr = (traceId: string, message: string): Result<never> =>
  err(appError('VALIDATION_ERROR', message, traceId))

/** Only a well-formed OAuth error code may enter a user-facing message. */
export const sanitizeOAuthErrorCode = (code: string): string =>
  /^[a-z0-9_]{1,64}$/.test(code) ? code : 'unknown_error'

export const parseJson = (body: string): unknown => {
  try {
    return JSON.parse(body) as unknown
  } catch {
    return undefined
  }
}

/** RFC 6749 token response — one schema for X and Google; both are spec-shaped. */
export const OAuthTokenResponseSchema = z.object({
  // Printable ASCII only: the value is interpolated into an Authorization header.
  access_token: z
    .string()
    .min(1)
    .regex(/^[\x21-\x7e]+$/),
  refresh_token: z.string().optional(),
  expires_in: z.number().positive().optional(),
  scope: z.string().optional(),
})

/** Constant-time state comparison (over digests, so length differences leak nothing). */
export const stateMatches = (expected: string, actual: string): boolean =>
  timingSafeEqual(
    createHash('sha256').update(expected).digest(),
    createHash('sha256').update(actual).digest(),
  )

/**
 * The shared callback guard, in trust order: CSRF state FIRST (every branch of the
 * callback is state-checked, even pure error mapping), then the provider's error param,
 * then the code. Returns the failure Result, or undefined to proceed.
 */
export function guardCallback(
  params: OAuthCallbackParams,
  expectedState: string,
  traceId: string,
  providerLabel: string,
): Result<never> | undefined {
  if (!params.state || !stateMatches(expectedState, params.state)) {
    return validationErr(traceId, 'OAuth state mismatch. Restart the connect flow.')
  }
  if (params.error) {
    return providerErr(
      traceId,
      `${providerLabel} authorization was declined (${sanitizeOAuthErrorCode(params.error)}).`,
    )
  }
  if (!params.code) {
    return validationErr(traceId, 'Missing authorization code. Restart the connect flow.')
  }
  return undefined
}

/**
 * Provider display strings (names, handles, titles) are third-party-controlled: strip
 * control characters and bidi/zero-width overrides (display spoofing) and cap length
 * before they enter a ConnectionSummary, the store, or a resume payload.
 */
export const cleanDisplay = (value: string): string =>
  value
    .replace(/[\p{Cc}\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/gu, '')
    .trim()
    .slice(0, 200)

export const computeExpiresAt = (now: Date, expiresIn: number | undefined): string | null =>
  expiresIn !== undefined ? new Date(now.getTime() + expiresIn * 1000).toISOString() : null

export const parseScopes = (scope: string | undefined, fallback: string[]): string[] =>
  scope ? scope.split(' ').filter(Boolean) : fallback

/**
 * A provider may issue NO refresh token — normal for grants without offline access.
 * Absent (and an empty string, which is not a credential) collapses to null so the
 * caller stores SQL NULL rather than sealing ''.
 */
export const normalizeOptionalToken = (value: string | undefined): string | null =>
  value !== undefined && value !== '' ? value : null

/**
 * Seal ONE secret behind a Result guard. EVERY seal() call site in this package goes
 * through here or through {@link sealOptionalSecret}: a vault misconfiguration (missing
 * or malformed TOKEN_VAULT_KEY) must surface as a typed PROVIDER_ERROR, never as a raw
 * rejection. The thrown error is swallowed — it is token-adjacent and its text must
 * never reach a caller.
 */
export function sealSecret(
  seal: (plaintext: string) => string,
  plaintext: string,
  traceId: string,
  message: string,
): Result<string> {
  try {
    return ok(seal(plaintext))
  } catch {
    return providerErr(traceId, message)
  }
}

/**
 * Seal an OPTIONAL secret. A null plaintext yields `ok(null)` — NOT a seal of the empty
 * string, and not an error: "this grant has no refresh token" is a legitimate outcome.
 */
export function sealOptionalSecret(
  seal: (plaintext: string) => string,
  plaintext: string | null,
  traceId: string,
  message: string,
): Result<string | null> {
  if (plaintext === null) return ok(null)
  return sealSecret(seal, plaintext, traceId, message)
}

/**
 * One guarded provider call: a transport throw or non-200 becomes a PROVIDER_ERROR
 * Result (raw exception text never escapes — it could echo request headers).
 */
export async function callProvider(
  transport: Transport,
  req: TransportRequest,
  traceId: string,
  labels: { unreachable: string; failed: string },
): Promise<Result<TransportResponse>> {
  let res: TransportResponse
  try {
    res = await transport(req)
  } catch {
    return providerErr(traceId, labels.unreachable)
  }
  if (res.status !== 200) {
    return providerErr(traceId, `${labels.failed} (HTTP ${res.status}).`, { status: res.status })
  }
  return { ok: true, data: res }
}
