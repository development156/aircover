import {
  CashfreeTagsMissingError,
  parseCashfreeTimestampMs,
  parseVerifiedCashfreeWebhook,
  verifyCashfreeWebhook,
  type ParsedWebhookEvent,
  type PaymentMode,
  type ProcessResult,
} from '@sahoda/billing/server-webhook'
import type { Result } from '@sahoda/shared'

/**
 * The Cashfree webhook handler, as a pure `Request → Response` function.
 *
 * ── WHY THE HANDLER IS NOT IN route.ts ───────────────────────────────────────
 * Everything money-critical here is about ORDER: verify, then parse, then write. Proving
 * that order requires driving real Requests through the real billing internals and watching
 * which statements reach the database. A `route.ts` that reads `process.env` and opens a
 * `pg` Pool at first request cannot be driven that way, so the ordering would only ever be
 * reviewed, never executed. This split lets `route.test.ts` assert on ledger rows.
 *
 * ── THE ONE IMPORT RULE ──────────────────────────────────────────────────────
 * This module and its route import from `@sahoda/billing/server-webhook` ONLY — never from
 * `@sahoda/billing`. The main barrel re-exports the fixture provider, whose HMAC secret is a
 * source literal in a public repository; reaching it from a public endpoint would make
 * forged credits a copy-paste away. `cashfree-webhook.guard.test.ts` fails if that import
 * ever appears here.
 */

/**
 * Largest body we will HMAC.
 *
 * The signature check hashes the entire body, so without a ceiling an unauthenticated caller
 * can make us do unbounded CPU work by POSTing a huge payload — the verification step is
 * itself the amplifier. Cashfree's own payloads are a couple of KB; 64 KiB is generous.
 */
const MAX_BODY_BYTES = 64 * 1024

/** What the operator needs to hear about. Never sent to the caller. */
export interface CashfreeWebhookNotice {
  kind: 'signature_rejected' | 'grant_replayed' | 'tags_missing' | 'process_failed' | 'unhandled'
  message: string
  eventId?: string
  workspaceId?: string
  cause?: unknown
}

/**
 * Why a delivery failed verification — for the OPERATOR only. The response stays a uniform
 * 401 regardless, so this never becomes an oracle telling a forger what to fix.
 *
 * Derived from headers alone; the secret is not involved, so nothing here can leak it.
 */
function rejectionReason(headers: Headers, nowMs: number): string {
  const signature = headers.get('x-webhook-signature')
  const rawTimestamp = headers.get('x-webhook-timestamp')

  if (!rawTimestamp) return 'no_timestamp_header'

  const issuedAtMs = parseCashfreeTimestampMs(rawTimestamp)
  if (issuedAtMs === null) return 'unparseable_timestamp'

  const skewSeconds = Math.round((nowMs - issuedAtMs) / 1000)
  if (Math.abs(skewSeconds) > 300) {
    // The one an operator most needs named. A wholesale unit mismatch shows up here as a
    // skew of billions of seconds; ordinary clock drift shows up as tens.
    return `outside_window (skew ${skewSeconds}s)`
  }

  return signature ? 'hmac_mismatch' : 'no_signature_header'
}

export interface CashfreeWebhookDeps {
  /** The HMAC key. Empty means "not provisioned" — the endpoint then accepts nothing. */
  secretKey: string
  /** Honesty label stamped on the parsed event; derived from CASHFREE_ENV, never defaulted. */
  mode: PaymentMode
  /** webhook → billing_webhook_events → applyPlanGrant → app.apply_ledger_entry. */
  process: (event: ParsedWebhookEvent) => Promise<Result<ProcessResult>>
  /** Injected so the signature's ±5 minute window is deterministic in tests. */
  now?: () => Date
  /** Server-side observability. A throwing implementation must never affect the response. */
  onNotice?: (note: CashfreeWebhookNotice) => void
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

export function createCashfreeWebhookHandler(
  deps: CashfreeWebhookDeps,
): (request: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date())

  const notify = (note: CashfreeWebhookNotice): void => {
    try {
      deps.onNotice?.(note)
    } catch {
      // A broken reporter must not turn a handled webhook into a 500.
    }
  }

  return async function handle(request: Request): Promise<Response> {
    try {
      // Not provisioned → accept nothing, and say so distinctly. Answering 401 here would
      // make a deployment mistake indistinguishable from an attack in the logs, and the
      // mistake is the one that silently loses real payments.
      if (deps.secretKey.length === 0) {
        return json({ ok: false, error: 'not_configured' }, 503)
      }

      const declared = Number(request.headers.get('content-length') ?? '')
      if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
        return json({ ok: false, error: 'payload_too_large' }, 413)
      }

      // .text(), never .json(). The HMAC covers these exact bytes: a parse-and-restringify
      // reorders keys and normalizes numbers (1.80 → 1.8) and would verify a different string
      // than the one Cashfree signed.
      const rawBody = await request.text()
      if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
        return json({ ok: false, error: 'payload_too_large' }, 413)
      }

      // ── The admission gate. Nothing below this line runs on unverified bytes, and the
      // return type enforces it: `verified` is a LiveVerifiedBody, the only thing the parser
      // accepts, and this call is the only thing that can mint one.
      const verified = verifyCashfreeWebhook({
        rawBody,
        signature: request.headers.get('x-webhook-signature') ?? '',
        timestamp: request.headers.get('x-webhook-timestamp') ?? undefined,
        secretKey: deps.secretKey,
        now: now(),
      })

      if (verified === null) {
        // A rejection writes no database row by design — so without this it would leave no
        // trace ANYWHERE. That is the state in which a misconfigured secret, a clock skew,
        // or a timestamp-unit mismatch looks exactly like "payments taken, credits never
        // arrived" with nothing to debug. The reason goes to the operator; the caller still
        // gets one uniform status.
        //
        // Reported only when a signature was actually PRESENT. A public endpoint is scanned
        // continuously, and a bare probe carries no signature — emitting for those would
        // bury the one delivery that matters under noise an attacker controls the volume of.
        if (request.headers.get('x-webhook-signature')) {
          notify({
            kind: 'signature_rejected',
            message: `cashfree webhook rejected: ${rejectionReason(request.headers, now().getTime())}`,
          })
        }

        // One status for every rejection — wrong secret, stale timestamp, tampered body,
        // missing header. Distinguishing them would turn this endpoint into an oracle that
        // tells a forger which part of their attempt to fix.
        return json({ ok: false, error: 'invalid_signature' }, 401)
      }

      let event: ParsedWebhookEvent
      try {
        event = parseVerifiedCashfreeWebhook(verified, { mode: deps.mode })
      } catch (cause) {
        if (cause instanceof CashfreeTagsMissingError) {
          // RECOVERABLE, and deliberately not a 400. GET /pg/orders/{id} returns the tags,
          // but that recovery lives on `resolveWebhookEvent` behind the main barrel this
          // route must not import. 502 makes Cashfree redeliver, which keeps the payment
          // alive while the gap is closed, instead of dropping money on the floor.
          notify({
            kind: 'tags_missing',
            message: `cashfree webhook for order ${cause.orderId} carried no order_tags`,
            cause,
          })
          return json({ ok: false, error: 'tags_unresolved' }, 502)
        }
        // A verified body we cannot understand is OUR bug or a contract change, not a
        // transient fault — a redelivery would fail identically. 400 stops the retries.
        notify({ kind: 'unhandled', message: 'cashfree webhook failed to parse', cause })
        return json({ ok: false, error: 'invalid_payload' }, 400)
      }

      const result = await deps.process(event)

      if (!result.ok) {
        notify({
          kind: 'process_failed',
          message: result.error.message,
          eventId: event.eventId,
          workspaceId: event.workspaceId,
          cause: result.error,
        })
        // Genuinely transient (the ledger or the events table was unreachable). 502 so
        // Cashfree DOES retry — the grant replays idempotently by monthlyGrantKey.
        return json({ ok: false, error: 'unavailable' }, 502)
      }

      // A grant that replayed on a FIRST-SEEN event id means the ledger already held a grant
      // for this (plan, period, workspace): a second real payment that produced no credits.
      // The customer paid twice and was credited once, so this must reach a human for
      // refund/support rather than pass as a clean success (applyPlanGrant's own contract).
      if (result.data.status === 'processed' && result.data.grant?.replayed === true) {
        notify({
          kind: 'grant_replayed',
          message:
            'cashfree payment granted nothing — a grant already stands for this plan+period; ' +
            'check for a duplicate charge needing refund',
          eventId: event.eventId,
          workspaceId: event.workspaceId,
        })
      }

      // 200 for processed, duplicate AND ignored. All three are correctly handled deliveries;
      // a non-2xx would make Cashfree redeliver an event that will never do anything.
      return json({ ok: true, status: result.data.status }, 200)
    } catch (cause) {
      notify({ kind: 'unhandled', message: 'cashfree webhook handler threw', cause })
      return json({ ok: false, error: 'unavailable' }, 502)
    }
  }
}
