import { assertServerOnly } from '../../env'
import type { PaymentMode } from '../types'
import { modeForEnv, type CashfreeEnvName } from './env'

/**
 * The two values a Cashfree webhook endpoint needs — and NOTHING else.
 *
 * ── WHY THIS IS NOT `loadCashfreeEnv` ────────────────────────────────────────
 * `loadCashfreeEnv` also requires `CASHFREE_APP_ID`, because the provider needs it to
 * authenticate outbound Create Order calls. A webhook receiver makes no outbound call: it
 * verifies an HMAC and writes to our own database. Requiring the app id here would let a
 * missing OUTBOUND credential take down INBOUND payment confirmation — money that already
 * left a customer's account, arriving at an endpoint that answers 500 because a variable it
 * never reads is unset. The receiver depends on exactly what it uses.
 */
export interface CashfreeWebhookEnv {
  /** The HMAC key for `x-webhook-signature`. See the note on which secret this is. */
  secretKey: string
  /** Honesty label stamped on every event parsed from this endpoint. */
  mode: PaymentMode
}

/**
 * Which secret signs a Cashfree webhook.
 *
 * ── THE ANSWER, AND WHY IT LOOKS LIKE A MISCONFIGURATION ──────────────────────
 * Cashfree PG signs webhooks with the MERCHANT SECRET KEY — the same value sent as the
 * `x-client-secret` header on API calls. Their signature-verification page states it as
 * "You need your Cashfree PG secret key and the payload to verify the signature", and the
 * documented algorithm is
 *
 *     Base64Encode(HMACSHA256($timestamp.$payload, $merchantSecretKey))
 *
 * So `CASHFREE_WEBHOOK_SECRET === CASHFREE_SECRET_KEY` is the CORRECT configuration, not
 * evidence that nobody set it. A guard rejecting the two for being byte-identical would
 * answer 503 to every genuine delivery — this module deliberately does not have one.
 *
 * `CASHFREE_WEBHOOK_SECRET` still exists as an OPTIONAL OVERRIDE. The docs name the PG
 * secret key but never enumerate a dashboard path, so they do not rule out this merchant's
 * account issuing a per-endpoint secret (Cashfree's PARTNER webhooks already use a different
 * key — the partner API key — which proves the key is not universally the merchant secret).
 * If one turns up, it is set here and nothing else changes.
 *
 * Returns `''` when neither is set. The caller must treat that as "not configured" and
 * refuse the delivery — `verifyCashfreeWebhook` also refuses an empty secret outright,
 * because HMAC-ing against `""` verifies every payload against a secret an attacker knows.
 */
export function resolveCashfreeWebhookSecret(source: NodeJS.ProcessEnv = process.env): string {
  const override = source.CASHFREE_WEBHOOK_SECRET ?? ''
  if (override.length > 0) return override
  return source.CASHFREE_SECRET_KEY ?? ''
}

/**
 * Load the webhook receiver's environment, or `null` when it is not configured.
 *
 * `null` rather than a throw: an unconfigured endpoint is a deployment state the route must
 * answer honestly (503, accept nothing), not an exception to be caught by a handler that
 * cannot tell it apart from a bug.
 *
 * `CASHFREE_ENV` must be exactly 'sandbox' or 'live' — it does not default, for the same
 * reason `loadCashfreeEnv` refuses to default it: Cashfree's sandbox and production
 * credentials are structurally identical, so nothing downstream can detect the wrong one.
 * Here the stake is the `mode` label carried onto every ledger entry. Defaulting to
 * 'sandbox' would mark a REAL payment as simulated in the audit trail; defaulting to 'live'
 * would do the reverse. Both are lies about money, so an unset value configures nothing.
 */
export function loadCashfreeWebhookEnv(
  source: NodeJS.ProcessEnv = process.env,
): CashfreeWebhookEnv | null {
  assertServerOnly()

  const secretKey = resolveCashfreeWebhookSecret(source)
  if (secretKey.length === 0) return null

  const rawEnv = source.CASHFREE_ENV ?? ''
  if (rawEnv !== 'sandbox' && rawEnv !== 'live') return null

  return { secretKey, mode: modeForEnv(rawEnv as CashfreeEnvName) }
}
