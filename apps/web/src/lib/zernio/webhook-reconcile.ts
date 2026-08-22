import 'server-only'

import type { Queryable } from './webhook-store'

/**
 * The reconciliation sweep: what to do about an event that never arrives.
 *
 * ── WHY THIS IS NOT OPTIONAL ─────────────────────────────────────────────────
 * Zernio's delivery is at-least-once IN INTENT and at-most-once IN PRACTICE. After
 * seven attempts spanning ~51 hours an event is moved to a dead-letter queue and is
 * never retried, and there is NO REPLAY ENDPOINT in the API to ask for it again —
 * checked across all 399 paths (docs/29 §0). Replay exists only in Zernio's
 * dashboard, which no cron can press.
 *
 * There is also a live contradiction between Zernio's own two documents about
 * whether a failing subscription is silently DISABLED after ten consecutive failures
 * (docs/29 §4a). The OpenAPI description says it is; the prose guide says it never
 * is. Unresolvable from the documents, so this is built for the worse case: a
 * subscription can stop delivering without telling anyone, and nothing here depends
 * on webhooks working.
 *
 * ── THIS IS NOT THE ONLY RECONCILIATION, AND SAYING SO IS THE POINT ──────────
 * `apps/jobs/src/reconcile/sweep.ts` ALREADY runs on the five-minute cron and
 * already reconciles publishes, correctly — its own comment records the rule this
 * module also obeys ("the one thing that must never happen here is deciding").
 * Shipping a second sweep that duplicated it would be worse than shipping none.
 *
 * What this covers is the set that one CANNOT SEE, and the gap is documented rather
 * than discovered: `listUnresolvedPublishes` selects from `post_publish_logs` and
 * requires `l.platform_post_id is not null`, so it can only find publishes that got
 * far enough to write a log row carrying an id. `apps/jobs/src/publish/store.ts:173`
 * spells out the hole in its own words — if the process dies AFTER the platform
 * accepted the post but BEFORE `writeLog` commits, "the post is live with no log row
 * — so `listUnresolvedPublishes` cannot see it either, and the next tick past the
 * lease publishes it again." That is a DOUBLE POST, and it is invisible.
 *
 * This query drives off `post_variants` instead, so a variant stuck in flight with
 * no log row at all is selected. Being honest about what that buys: it SURFACES
 * those rows; it cannot always resolve them, because resolving means asking Zernio
 * by post id and that case is precisely the one where no id was ever recorded. A
 * surfaced row an operator can see beats a row nobody can.
 *
 * ── ONE CORRECTION TO AN EARLIER NOTE IN THIS LANE ───────────────────────────
 * `webhook-project-publish.ts` says nothing in this schema stores Zernio's own post
 * id. That is true of `posts` and `post_variants` and NOT quite true overall:
 * `apps/jobs/src/reconcile/store.ts:128` records that
 * `post_publish_logs.platform_post_id` holds ZERNIO's id on the STILL_PROCESSING
 * path — "a different column, and a different meaning, from
 * post_variants.platform_post_id". So the id is stored on ONE failure path, in a
 * column whose meaning depends on how the row got there. That is not a join key a
 * projection can rely on, which is why the correlation there is unchanged; it is
 * recorded here so the earlier note is not read as more absolute than it is.
 *
 * ── WHAT DRIVES IT: OUR OWN ROWS, NEVER THE ABSENCE OF EVENTS ────────────────
 * A sweep that looked for "events that did not arrive" would be searching for
 * something it cannot enumerate. This one asks a question it CAN answer: which of
 * OUR variants have been sitting in flight longer than any healthy publish takes?
 * That set is finite, it is in this database, and it is the same set whether the
 * webhook was dropped, disabled, dead-lettered or never sent.
 *
 * ── AND THE RULE IT WILL NOT BREAK ───────────────────────────────────────────
 * A MISSING EVENT MEANS "WE HAVE NOT HEARD". IT NEVER MEANS "IT FAILED."
 *
 * This function does not write a status. It returns the list of variants worth
 * ASKING about, and the caller reads the resource itself — `GET /v1/posts/{id}` —
 * which is the only authority on what happened. If that read also fails, the status
 * stays exactly where it was. Nothing in this file can invent an outcome, because
 * nothing in this file writes one.
 */

/** One variant that has been in flight too long to explain by normal latency. */
export interface StaleVariant {
  variantId: string
  workspaceId: string
  postId: string
  channel: string
  /** Null when the synchronous publish never recorded one — then Zernio must be asked by post. */
  platformPostId: string | null
  publishStatus: string
  staleForSeconds: number
}

/**
 * How long a variant may sit in flight before it is worth asking about.
 *
 * Derived from the measured distribution in docs/32 §P6, not chosen: the
 * wait-for-tick component is uniform on [0, 300) s and the observed post-tick job
 * runtime is 49-79 s, so a HEALTHY publish can legitimately take ~380 s end to end.
 * Fifteen minutes is comfortably past that and comfortably inside Zernio's own
 * retry schedule — attempt 4 lands at ~18m 30s, so a sweep at 15 minutes asks about
 * posts whose webhook may still be coming.
 *
 * THAT OVERLAP IS DELIBERATE AND HARMLESS. Asking Zernio about a post whose event is
 * still in flight costs one read and returns the same answer the event would; the
 * ingest is idempotent, so whichever arrives second writes nothing. Waiting until
 * after the dead-letter window instead would mean a customer stares at "publishing"
 * for two days.
 */
export const STALE_AFTER_SECONDS = 15 * 60

/**
 * Which variants to ask Zernio about.
 *
 * `limit` is passed by the caller and is a real cap, not a formality: this runs
 * inside a serverless invocation, and whatever does not fit is picked up by the next
 * tick rather than silently dropped. The caller reports the remainder.
 */
export async function findStaleVariants(
  db: Queryable,
  args: { staleAfterSeconds?: number; limit: number },
): Promise<StaleVariant[]> {
  const staleAfter = args.staleAfterSeconds ?? STALE_AFTER_SECONDS

  const { rows } = await db.query<StaleVariant>(
    `select
       v.id::text            as "variantId",
       v.workspace_id::text  as "workspaceId",
       v.post_id::text       as "postId",
       v.channel             as "channel",
       v.platform_post_id    as "platformPostId",
       v.publish_status      as "publishStatus",
       extract(epoch from (now() - v.updated_at))::int as "staleForSeconds"
     from post_variants v
     where v.publish_status in ('scheduled', 'publishing')
       and v.updated_at < now() - make_interval(secs => $1::int)
       -- SKIP ANYTHING AN EVENT ALREADY EXPLAINED. Without this the sweep would
       -- re-ask about every variant a webhook has already resolved, spending a
       -- Zernio read per tick to learn what is already in this database.
       --
       -- Matched on the stored payload rather than on a lifted column because the
       -- post id sits at a different path per event family; the GIN index on
       -- payload is what makes that affordable.
       and not exists (
         select 1 from zernio_webhook_events e
          where e.workspace_id = v.workspace_id
            and e.event in ('post.published', 'post.failed', 'post.partial')
            and e.received_at > v.updated_at
            and e.payload @> jsonb_build_object(
                  'post', jsonb_build_object(
                    'platforms', jsonb_build_array(
                      jsonb_build_object('platformPostId', v.platform_post_id))))
       )
     order by v.updated_at asc
     limit $2::int`,
    [staleAfter, args.limit],
  )

  return rows
}

/**
 * What a reconciliation attempt concluded. FOUR outcomes, and only one of them is a
 * statement about the post.
 *
 * `unheard` is the important one and it is the DEFAULT, not a fallback: it is what a
 * variant stays at when the resource read failed, when Zernio has no record, or when
 * the answer was a state this schema has no name for. The alternative — writing
 * `failed` because nothing said otherwise — would tell a shop owner their post did
 * not go out on the strength of no evidence at all.
 */
export type ReconcileOutcome =
  /** Zernio's resource named a terminal state and it was written. */
  | { kind: 'resolved'; publishStatus: 'published' | 'failed' }
  /** We asked and could not get an answer, or the answer settled nothing. */
  | { kind: 'unheard'; because: 'read_failed' | 'no_record' | 'still_in_flight' }
  /** The variant moved on between selection and the write. Not an error. */
  | { kind: 'superseded' }

/**
 * Write a reconciled outcome.
 *
 * Guarded exactly as the webhook projection is, and for the same reason: between
 * selecting a stale variant and writing to it, a user may have deleted, re-drafted or
 * rescheduled the post. The `where` clause makes that a no-op rather than a
 * resurrection, and the caller is told it was `superseded` rather than being allowed
 * to believe it wrote something.
 */
export async function applyReconciledStatus(
  db: Queryable,
  args: { variantId: string; publishStatus: 'published' | 'failed'; permalink?: string | null },
): Promise<ReconcileOutcome> {
  const { rows } = await db.query<{ id: string }>(
    `update post_variants
        set publish_status = $2,
            permalink      = coalesce($3, permalink),
            updated_at     = now()
      where id = $1::uuid
        and publish_status in ('scheduled', 'publishing')
      returning id`,
    [args.variantId, args.publishStatus, args.permalink ?? null],
  )

  return rows.length > 0
    ? { kind: 'resolved', publishStatus: args.publishStatus }
    : { kind: 'superseded' }
}
