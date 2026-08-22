import 'server-only'

import { verifyZernioWebhook } from '@sahoda/publishing'

import { ingestZernioWebhook, type IngestOutcome, type Queryable } from './webhook-ingest'

/**
 * The Zernio webhook receiver's BEHAVIOUR, separated from its wiring so that
 * `route.test.ts` can drive real `Request`s through it against a real Postgres.
 * The route file next door is only the env-and-pool construction a test cannot
 * exercise. Same split, and for the same reason, as the Cashfree receiver.
 *
 * ── EVERY STATUS CODE, AND WHY IT IS TRUTHFUL ────────────────────────────────
 * A wrong code here is not cosmetic. Zernio retries a non-2xx up to seven times
 * across ~51 hours and then dead-letters the event, and a 4xx on a fault of OURS
 * tells the operator the caller was wrong while the event is lost. The rule that
 * decides each line: WHOSE FAULT IS IT, and WOULD RETRYING HELP?
 *
 *   503  no secret configured        Ours, and fixable. Retry helps — the event is
 *                                    still coming after the deploy. NEVER 401: that
 *                                    would make a deployment mistake read as an
 *                                    attack, and hide the one that loses real data.
 *   503  database unreachable        Ours, transient. Retry helps. Never 500 (which
 *                                    a 5xx filter sees but reads as a code defect)
 *                                    and never 4xx (which blames Zernio).
 *   413  body over the cap           Theirs, and no retry will shrink it. Checked
 *                                    from content-length BEFORE reading the body.
 *   401  signature header absent     Fail closed. The header is optional on ZERNIO's
 *                                    side, so its absence means the subscription is
 *                                    misconfigured or the caller is not Zernio.
 *   401  signature mismatch          Either a forgery or a rotated secret. Retrying
 *                                    is right in the second case and harmless in the
 *                                    first, since it will keep failing.
 *   400  verified but unparseable    A genuine contract break. Retry cannot help, so
 *                                    burning seven attempts on it is worse than
 *                                    dead-lettering it now.
 *   200  duplicate delivery          An idempotent accept is not an error. Answering
 *                                    409 would make Zernio retry a success.
 *   200  unknown event type          A 4xx here would dead-letter every event Zernio
 *                                    adds after this deploy.
 *   200  webhook.test                Accepted, recorded, attributed to nobody.
 *   200  unroutable account          WE WILL NEVER BE ABLE TO ROUTE IT. Retrying for
 *                                    51 hours would be a lie about that. It is stored
 *                                    with its reason and is visible to operators via
 *                                    the partial index on `routing <> 'routed'`.
 *
 * ── WHAT IS NOT REPORTED, AND WHY ────────────────────────────────────────────
 * No payload ever reaches the error reporter. These bodies carry customer DMs,
 * comments and reviewer names; the redaction path in this repo is already recorded
 * as a DoS surface that runs on the crash path. The reporter gets the event id, the
 * event type and the failure kind — enough to find the row, which is stored anyway.
 */

/** Fixed envelopes. Functions, not constants: a Response body is consumed once. */
const reply = (status: number, body: Record<string, unknown>): Response =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

/**
 * 1 MiB. Zernio's largest documented payload is a post event with a handful of
 * platform entries; a megabyte is orders of magnitude above it. The cap exists so
 * an unauthenticated caller cannot make the server read an unbounded body BEFORE
 * the signature check — the check needs the whole body, so it cannot come first.
 */
const MAX_BODY_BYTES = 1_048_576

export interface ZernioWebhookDeps {
  /** Empty string means unconfigured, which is a 503 and never a rejection. */
  secret: string
  /**
   * Run `fn` inside a transaction. Injected so the handler owns no pool and the
   * test can supply PGlite. The implementation MUST roll back when `fn` throws —
   * that rollback is what makes a failed projection leave no half-written event.
   */
  withTransaction<T>(fn: (db: Queryable) => Promise<T>): Promise<T>
  /** Never called with a payload. Id, type and kind only. */
  onError?(cause: unknown, context: Record<string, string>): void
}

export function createZernioWebhookHandler(
  deps: ZernioWebhookDeps,
): (request: Request) => Promise<Response> {
  const report = (cause: unknown, context: Record<string, string>): void => {
    try {
      deps.onError?.(cause, context)
    } catch {
      // A broken reporter must never turn a handled delivery into a 500.
    }
  }

  return async function handle(request: Request): Promise<Response> {
    // Not provisioned. Distinct from a rejection on purpose: this is our fault and
    // the event is still coming once it is fixed.
    if (deps.secret.length === 0) return reply(503, { ok: false, error: 'not_configured' })

    const declared = Number(request.headers.get('content-length') ?? '')
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return reply(413, { ok: false, error: 'payload_too_large' })
    }

    let rawBody: string
    try {
      // `.text()`, never `.json()`. The HMAC covers THESE EXACT BYTES; parsing and
      // re-stringifying reorders keys and normalises numbers, and would verify a
      // different string than the one Zernio signed.
      rawBody = await request.text()
    } catch (cause) {
      report(cause, { action: 'zernioWebhook:body' })
      return reply(400, { ok: false, error: 'unreadable_body' })
    }

    if (rawBody.length > MAX_BODY_BYTES) {
      return reply(413, { ok: false, error: 'payload_too_large' })
    }

    // ── THE TRUST BOUNDARY ────────────────────────────────────────────────────
    // Nothing below this line runs on unverified bytes, and that is enforced by the
    // type system rather than by this comment: `ingestZernioWebhook` accepts only a
    // `VerifiedZernioBody`, which only `verifyZernioWebhook` can mint.
    const verified = verifyZernioWebhook({ headers: request.headers, rawBody, secret: deps.secret })
    if (!verified.ok) {
      // The REASON is not echoed to the caller — "bad_signature" versus
      // "no_signature" tells a prober which half they got right. It is reported
      // internally, where an operator diagnosing a rotated secret needs it.
      report(new Error(`zernio webhook rejected: ${verified.reason}`), {
        action: 'zernioWebhook:verify',
        reason: verified.reason,
      })
      return reply(401, { ok: false, error: 'unauthorized' })
    }

    let outcome: IngestOutcome
    try {
      outcome = await deps.withTransaction((db) => ingestZernioWebhook(db, verified.body))
    } catch (cause) {
      // The database is unreachable, or a projection threw and the transaction rolled
      // back. Ours, transient, and retrying is exactly right — 503, so a 5xx log
      // filter sees it and nobody reads it as Zernio sending something bad.
      report(cause, { action: 'zernioWebhook:ingest' })
      return reply(503, { ok: false, error: 'unavailable' })
    }

    if (outcome.status === 'rejected') {
      // Verified as genuinely from Zernio, and still unparseable. A contract break
      // worth surfacing, and one no retry can fix.
      report(new Error(`zernio webhook unparseable: ${outcome.reason}`), {
        action: 'zernioWebhook:parse',
        reason: outcome.reason,
      })
      return reply(400, { ok: false, error: 'malformed_payload' })
    }

    if (outcome.status === 'duplicate') {
      return reply(200, { ok: true, status: 'duplicate', eventId: outcome.eventId })
    }

    // Stored. 200 for every routing and projection outcome, including the ones that
    // could not be filed — see the table above for why each of those is not a 4xx.
    return reply(200, {
      ok: true,
      status: 'stored',
      eventId: outcome.eventId,
      routing: outcome.routing,
      projection: outcome.projection.kind,
    })
  }
}
