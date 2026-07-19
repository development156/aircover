import { randomBytes, randomUUID } from 'node:crypto'
import { appError, err, type Result } from '@sahoda/shared'
import type { Transport } from '../transport'
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
