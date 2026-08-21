import { z } from 'zod'

import type { VerifiedZernioBody } from './webhook-signature'

/**
 * Parsing an arriving Zernio webhook into the few facts the receiver acts on.
 *
 * Shapes come from the top-level `webhooks:` object of the OpenAPI document at
 * `https://docs.zernio.com/api/openapi` (3.1.0, info.version 1.0.4, 2,298,592
 * bytes), read on 2026-08-21. 49 event types, 26 `WebhookPayload*` schemas.
 * `docs/29_Zernio_Webhooks_Contract.md` carries the extraction.
 *
 * ── THE ROUTING FACT THIS FILE EXISTS TO GET RIGHT ───────────────────────────
 * Doc 13 §11 asks, as an open question, "does the event carry the profile ID for
 * workspace routing?". Answered here from the document rather than from memory:
 * `profileId` is present on 18 of the 26 payload schemas and ABSENT from these:
 *
 *   WebhookPayloadComment        comment.received      <- inbox
 *   WebhookPayloadReviewNew      review.new            <- inbox
 *   WebhookPayloadReviewUpdated  review.updated        <- inbox
 *   WebhookPayloadPost           post.published/…      <- publish state
 *   WebhookPayloadPostPlatform   post.platform.*       <- publish state
 *   WebhookPayloadExternalPost   post.external.*
 *   WebhookPayloadLead           lead.received
 *   WebhookPayloadTest           webhook.test          (carries NO id at all)
 *
 * Every surface this lane exists to fix is on that list. "Yes, it carries
 * profileId" is a true summary and a broken router. `accountId` is on 25 of 26 —
 * everything except `webhook.test` — so ACCOUNT is the routing key and profile is
 * never relied on.
 *
 * ── WHY THE SCHEMA IS DELIBERATELY LOOSE ─────────────────────────────────────
 * This parser validates the four fields the receiver acts on and passes everything
 * else through untouched. It does NOT model 26 payload variants. Two reasons:
 *
 *   · An event we cannot parse is an event we drop, and Zernio adds events. A
 *     strict discriminated union over today's 49 names would reject tomorrow's
 *     50th, and a rejection costs seven retries and a dead letter.
 *   · The raw payload is stored whole. Anything a future surface needs is already
 *     in the database; re-parsing it later costs nothing, whereas an event never
 *     stored is gone.
 *
 * The zod parse is therefore a GUARD on the envelope, not a model of the contents.
 */

/**
 * The envelope every one of the 26 payload schemas shares: `id`, `event`,
 * `timestamp`. All three are in the `required` list of every schema.
 *
 * `id` is `z.string().min(1)` and NOT `z.uuid()`. The OpenAPI document types it
 * `string` ("Stable webhook event ID"); the prose guide calls it a UUID. When two
 * primary sources disagree about how precise a field is, the looser one is the safe
 * assumption — a `uuid()` here would reject a real delivery to enforce a claim only
 * one document makes.
 */
const EnvelopeSchema = z.object({
  id: z.string().min(1),
  event: z.string().min(1),
  timestamp: z.string().min(1).optional(),
})

/** How the workspace for an event was decided. Mirrors the `routing` column's CHECK. */
export type ZernioWebhookRouting = 'routed' | 'no_account_id' | 'unknown_account' | 'ambiguous'

export interface ParsedZernioWebhook {
  /** `payload.id`. The idempotency key. */
  eventId: string
  /** `payload.event`, e.g. 'post.published'. Never validated against a list — see above. */
  event: string
  /** `payload.timestamp` as sent. NOT delivery time; see `webhook-signature.ts`. */
  eventAt: string | null
  /** Every Zernio account id named anywhere in the payload, deduplicated and ordered. */
  accountIds: string[]
  /** The payload, whole, exactly as delivered. */
  payload: Record<string, unknown>
}

export type ZernioWebhookParse =
  | { ok: true; parsed: ParsedZernioWebhook }
  | { ok: false; reason: 'not_json' | 'not_an_object' | 'bad_envelope' }

/**
 * Every path an `accountId` appears at across the 26 payload schemas, extracted
 * from the document rather than assumed.
 *
 * `post.platforms[]` is the one that is an ARRAY, and its own description says so:
 * "A post can span multiple accounts." Reading `platforms[0]` would file a
 * multi-account publish under one account and lose the rest — the exact shape of
 * defect this codebase has already shipped three times by treating a list as a
 * scalar. It is walked, not indexed.
 */
function collectAccountIds(payload: Record<string, unknown>): string[] {
  const found: string[] = []

  const take = (v: unknown): void => {
    if (typeof v === 'string' && v.trim() !== '') found.push(v.trim())
  }
  const obj = (v: unknown): Record<string, unknown> | null =>
    typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

  // `.account.accountId` — 25 of 26 schemas.
  take(obj(payload.account)?.accountId)

  const post = obj(payload.post)
  if (post) {
    // `.post.accountId` — WebhookPayloadExternalPost.
    take(post.accountId)
    // `.post.platforms[].accountId` — WebhookPayloadPost and WebhookPayloadPostPlatform.
    if (Array.isArray(post.platforms)) for (const p of post.platforms) take(obj(p)?.accountId)
  }

  // `.call.accountId` — the three call.* payloads.
  take(obj(payload.call)?.accountId)

  // Deduplicated ONCE, here, at the boundary that produces it. Every reader may
  // assume a set. Sorted so that two deliveries of the same event — and the tests
  // that compare them — cannot differ by ordering alone.
  return [...new Set(found)].sort()
}

/**
 * Parse verified bytes.
 *
 * Takes a `VerifiedZernioBody`, so it is not possible to call this on bytes whose
 * signature has not been checked: there is no other way to obtain that type.
 */
export function parseZernioWebhook(body: VerifiedZernioBody): ZernioWebhookParse {
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return { ok: false, reason: 'not_json' }
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'not_an_object' }
  }

  const envelope = EnvelopeSchema.safeParse(raw)
  if (!envelope.success) return { ok: false, reason: 'bad_envelope' }

  const payload = raw as Record<string, unknown>
  return {
    ok: true,
    parsed: {
      eventId: envelope.data.id,
      event: envelope.data.event,
      eventAt: envelope.data.timestamp ?? null,
      accountIds: collectAccountIds(payload),
      payload,
    },
  }
}

/**
 * Decide the routing outcome from the account ids on the event and the workspaces
 * that own them.
 *
 * `owners` is what the database said: one entry per account id that matched a
 * connection. Ids with no match simply do not appear.
 *
 * NEVER GUESSES. Four outcomes, and the three that are not `routed` all record why
 * rather than substituting a workspace. Picking the first match would file one
 * customer's event under another customer's name in exactly the case — a shared
 * team API key — where that is most damaging and least visible.
 */
export function decideRouting(args: {
  accountIds: string[]
  owners: { accountId: string; workspaceId: string }[]
}): { routing: ZernioWebhookRouting; workspaceId: string | null } {
  if (args.accountIds.length === 0) return { routing: 'no_account_id', workspaceId: null }

  const workspaces = [...new Set(args.owners.map((o) => o.workspaceId))]
  if (workspaces.length === 0) return { routing: 'unknown_account', workspaceId: null }
  if (workspaces.length > 1) return { routing: 'ambiguous', workspaceId: null }

  // Exactly one workspace owns every account we could match. Note that this is
  // still `routed` when SOME ids matched and others did not: the event belongs to
  // that workspace, and an unmatched sibling id means an account we do not have a
  // connection for, not a second tenant.
  return { routing: 'routed', workspaceId: workspaces[0]! }
}
