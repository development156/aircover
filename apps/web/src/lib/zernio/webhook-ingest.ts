import 'server-only'

import {
  decideRouting,
  parseZernioWebhook,
  type VerifiedZernioBody,
  type ZernioWebhookRouting,
} from '@sahoda/publishing'

import { projectComment, projectMessage, projectReview } from './webhook-project-inbox'
import { projectPostState } from './webhook-project-publish'
import type { ProjectionOutcome, Queryable } from './webhook-store'

/**
 * Storing one delivered Zernio webhook, and projecting it onto the surfaces that
 * read it.
 *
 * ── THE FIVE-SECOND BUDGET IS THE DESIGN CONSTRAINT ──────────────────────────
 * Zernio counts a delivery successful only if the endpoint answers 2xx within five
 * seconds, and counts anything else — INCLUDING A TIMEOUT — as a failure worth
 * retrying, up to seven attempts spanning ~51 hours (docs/29 §4). So a slow handler
 * does not merely lag: it becomes a duplicate storm and then a dead letter.
 *
 * Everything on this path is therefore SQL against one connection. There is NO
 * outbound network call here — not to Zernio, not to a model, not to an error
 * reporter carrying a payload. If a projection needs a fact the payload does not
 * carry, it is not fetched: the event is stored and the reconciliation sweep
 * enriches it later, off the delivery path where five seconds do not matter.
 *
 * ── ONE TRANSACTION, WHICH IS WHAT MAKES IDEMPOTENCY TRUE ────────────────────
 * The insert into `zernio_webhook_events` and every projected write happen in the
 * caller's transaction. Either an event is recorded AND projected, or neither.
 *
 * That is what makes "a replay writes nothing" a guarantee rather than a hope: the
 * unique index refuses the second insert, the zero-row check below returns before
 * any projection runs, and there is no partial state a redelivery could be needed
 * to "finish".
 */

export type { ProjectionOutcome, Queryable } from './webhook-store'

export type IngestOutcome =
  | {
      status: 'stored'
      eventId: string
      event: string
      routing: ZernioWebhookRouting
      workspaceId: string | null
      projection: ProjectionOutcome
    }
  /** An id we already hold. A redelivery, or a replay from Zernio's dashboard. */
  | { status: 'duplicate'; eventId: string }
  | { status: 'rejected'; reason: 'not_json' | 'not_an_object' | 'bad_envelope' }

/**
 * Store one verified delivery, and project it.
 *
 * `db` MUST already be inside a transaction that the caller commits or rolls back.
 * Taking a `Queryable` rather than a pool is what lets the tests drive this exact
 * SQL against a real Postgres: a mocked store cannot fail a unique index, which is
 * the one property here actually worth proving.
 */
export async function ingestZernioWebhook(
  db: Queryable,
  body: VerifiedZernioBody,
): Promise<IngestOutcome> {
  const parse = parseZernioWebhook(body)
  if (!parse.ok) return { status: 'rejected', reason: parse.reason }
  const { eventId, event, eventAt, accountIds, payload } = parse.parsed

  // ── ROUTE ─────────────────────────────────────────────────────────────────
  // ONE indexed lookup, served by `connections_zernio_account_idx`. `= any($1)`
  // rather than a loop: several account ids on one post event is the documented
  // case, and N round trips inside a five-second budget is how a handler times out.
  const owners = accountIds.length
    ? (
        await db.query<{ accountId: string; workspaceId: string }>(
          `select external_account ->> 'id' as "accountId", workspace_id::text as "workspaceId"
             from connections
            where external_account ->> 'id' = any($1::text[])`,
          [accountIds],
        )
      ).rows
    : []

  const { routing, workspaceId } = decideRouting({ accountIds, owners })

  // ── STORE ─────────────────────────────────────────────────────────────────
  // This IS the idempotency mechanism, and it is exactly the pattern Zernio's own
  // guide prescribes: "insert the event ID into a unique-indexed table before
  // processing the payload, and skip processing when the insert conflicts."
  //
  // `do nothing`, never `do update`: the table carries a block_mutations trigger
  // that refuses UPDATE outright, so a receiver written the other way would fail on
  // its first redelivery — which is to say, in production, on the first slow answer.
  const inserted = await db.query<{ id: string }>(
    `insert into zernio_webhook_events
       (event_id, event, workspace_id, routing, zernio_account_ids, payload, event_at)
     values ($1, $2, $3::uuid, $4, $5::text[], $6::jsonb, $7::timestamptz)
     on conflict (event_id) do nothing
     returning id`,
    [
      eventId,
      event,
      workspaceId,
      routing,
      accountIds,
      // The jsonb parameter is passed as TEXT and cast in the statement. Postgres
      // infers ONE type per parameter from its first use and a JS object leaves the
      // driver to guess — the exact failure two earlier sessions hit while seeding.
      JSON.stringify(payload),
      eventAt,
    ],
  )

  // Zero rows means the unique index refused it: we already hold this event.
  // NOTHING BELOW THIS LINE RUNS. That is what "a replay writes nothing" means, and
  // it is the whole of the mechanism — not a comparison, not a timestamp check.
  if (inserted.rows.length === 0) return { status: 'duplicate', eventId }

  const projection =
    workspaceId === null
      ? ({ kind: 'not_routed', routing } as const)
      : await project(db, { event, payload, workspaceId })

  return { status: 'stored', eventId, event, routing, workspaceId, projection }
}

/** Dispatch one stored event onto the surface that reads it. */
async function project(
  db: Queryable,
  args: { event: string; payload: Record<string, unknown>; workspaceId: string },
): Promise<ProjectionOutcome> {
  switch (args.event) {
    case 'message.received':
      return projectMessage(db, args)
    case 'comment.received':
      return projectComment(db, args)
    case 'review.new':
    case 'review.updated':
      return projectReview(db, args)
    case 'post.published':
    case 'post.failed':
    case 'post.partial':
      return projectPostState(db, args)
    default:
      // Stored and not filed. This is the CORRECT answer for 43 of the 49 event
      // types today, and it is what keeps a new Zernio event from being an error
      // rather than a row we simply do not read yet.
      return { kind: 'no_subscriber' }
  }
}
