import type { ParsedWebhookEvent } from '../types'
import { verifyCashfreeSignature, type CashfreeSignatureInput } from './signature'
import { parseCashfreeWebhook, type ParseCashfreeWebhookOptions } from './webhook'

/**
 * The webhook admission gate: a body may not be parsed until it has been proven to
 * carry a valid Cashfree HMAC.
 *
 * ── WHY A BRAND AND NOT A RUNTIME CHECK ──────────────────────────────────────
 * "Verify before parse" is an ordering rule, and ordering rules are exactly what a
 * refactor quietly breaks — the code still compiles, the tests still pass, and the
 * endpoint starts trusting unverified bytes. Encoding it in the type makes the wrong
 * order unrepresentable: `parseVerifiedCashfreeWebhook` accepts only a
 * `LiveVerifiedBody`, and `verifyCashfreeWebhook` is the only function that can
 * produce one. There is no cast in this package and there must never be one.
 *
 * ── THE FORGERY PATH THIS CLOSES ─────────────────────────────────────────────
 * `providers/fixture.ts:14` hardcodes `DEFAULT_SECRET = 'fixture-webhook-secret'`, and
 * this repository is public. The fixture's verifier is a real HMAC check — it is simply
 * keyed on a secret the whole world can read, over a different algorithm (hex digest of
 * the body alone, no timestamp). Honouring it on a public endpoint would let anyone mint
 * `{workspace_id, plan_id, period}` and be granted a month of credits.
 *
 * Nothing here can reach the fixture: this module imports only the Cashfree signature
 * and parser, and `../../server-webhook` — the entry point the route uses — deliberately
 * does not re-export the fixture at all. The exclusion is in the import graph, not in a
 * conditional someone can invert.
 */

declare const verified: unique symbol

/**
 * A raw webhook body whose Cashfree HMAC has been verified.
 *
 * Structurally a string, so it can still be logged or stored verbatim — but not
 * assignable FROM a string, so an unverified body cannot be smuggled into a parser.
 */
export type LiveVerifiedBody = string & { readonly [verified]: 'cashfree-hmac' }

export interface VerifyCashfreeWebhookInput extends CashfreeSignatureInput {}

/**
 * Verify a Cashfree webhook and, only on success, brand the body as parseable.
 *
 * Returns `null` rather than throwing: a bad signature is an expected condition on a
 * public endpoint (scanners, replays, misconfiguration), not an exceptional one, and a
 * throw here would land in a catch-all that cannot tell forgery from a bug.
 *
 * An empty `secretKey` is refused outright. Without that check a missing environment
 * variable would verify payloads against `""` — a secret an attacker also knows.
 */
export function verifyCashfreeWebhook(input: VerifyCashfreeWebhookInput): LiveVerifiedBody | null {
  if (typeof input.secretKey !== 'string' || input.secretKey.length === 0) return null
  if (typeof input.signature !== 'string' || input.signature.trim().length === 0) return null
  if (!verifyCashfreeSignature(input)) return null
  return input.rawBody as LiveVerifiedBody
}

/**
 * Parse a body that has been proven verified. The `LiveVerifiedBody` parameter is the
 * whole point — passing a plain string is a compile error, so this cannot run first.
 */
export function parseVerifiedCashfreeWebhook(
  body: LiveVerifiedBody,
  opts: ParseCashfreeWebhookOptions = {},
): ParsedWebhookEvent {
  return parseCashfreeWebhook(body, opts)
}
