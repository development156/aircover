import { assertServerOnly } from '../../env'
import type { PaymentMode } from '../types'

export const CASHFREE_SANDBOX_BASE_URL = 'https://sandbox.cashfree.com/pg'
export const CASHFREE_LIVE_BASE_URL = 'https://api.cashfree.com/pg'

/** Pinned API version. The signature algorithm and payload shapes below are 2025-01-01. */
export const CASHFREE_API_VERSION = '2025-01-01'

export type CashfreeEnvName = 'sandbox' | 'live'

export interface CashfreeEnv {
  appId: string
  secretKey: string
  env: CashfreeEnvName
  /** Derived from `env`, never configured — a base URL and an env cannot disagree. */
  baseUrl: string
}

const BASE_URLS: Record<CashfreeEnvName, string> = {
  sandbox: CASHFREE_SANDBOX_BASE_URL,
  live: CASHFREE_LIVE_BASE_URL,
}

/** The honesty label a provider built from this env stamps on all its output. */
export const modeForEnv = (env: CashfreeEnvName): PaymentMode =>
  env === 'live' ? 'live' : 'sandbox'

/**
 * Fail-fast Cashfree env loader (mirrors loadBillingEnv): collect every missing key, then
 * throw once. The error names keys only — never a value — so a secret cannot reach a log.
 *
 * CASHFREE_ENV is REQUIRED and must be exactly 'sandbox' or 'live'. It deliberately does not
 * default: Cashfree's sandbox and production credentials are structurally identical, with no
 * prefix to tell them apart, so nothing downstream can detect a production key pointed at the
 * wrong host. Making the environment explicit is the only available guard.
 */
export function loadCashfreeEnv(source: NodeJS.ProcessEnv = process.env): CashfreeEnv {
  assertServerOnly()

  const missing: string[] = []

  const appId = source.CASHFREE_APP_ID ?? ''
  if (appId.length === 0) missing.push('CASHFREE_APP_ID')

  const secretKey = source.CASHFREE_SECRET_KEY ?? ''
  if (secretKey.length === 0) missing.push('CASHFREE_SECRET_KEY')

  const rawEnv = source.CASHFREE_ENV ?? ''
  const isKnownEnv = rawEnv === 'sandbox' || rawEnv === 'live'
  if (!isKnownEnv) missing.push("CASHFREE_ENV (must be 'sandbox' or 'live')")

  if (missing.length > 0) {
    throw new Error(`@sahoda/billing: missing required env — ${missing.join(', ')}`)
  }

  const env = rawEnv as CashfreeEnvName
  return { appId, secretKey, env, baseUrl: BASE_URLS[env] }
}
