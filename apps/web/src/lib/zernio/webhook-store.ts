import 'server-only'

import type { ZernioWebhookRouting } from '@sahoda/publishing'

/**
 * The shared vocabulary and SQL primitives the webhook projections are built from.
 *
 * Split out of `webhook-ingest.ts` so each projection file stays readable and so the
 * two things worth reviewing closely — the thread upsert's `updated_at` rule and the
 * message insert's constraint obligation — sit in one place instead of being repeated
 * three times with three chances to drift.
 */

/**
 * The narrow surface both `pg` and PGlite present.
 *
 * Deliberately just `query`. A wider port would let a test double satisfy the type
 * while behaving nothing like Postgres, and the properties worth proving here — a
 * unique index refusing a second insert, a CHECK refusing an impossible row — only
 * exist in a real database.
 */
export interface Queryable {
  query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>
}

/**
 * What became of the projection. Five outcomes, and the four that are not
 * `projected` each say WHY.
 *
 * This is the standing distinction this codebase keeps everywhere else — not
 * connected, could not read, not configured, nothing yet, nothing to report —
 * applied to ingestion. A single boolean would make "stored an event for a channel
 * this database cannot represent" indistinguishable from "stored it and filed it",
 * and the inbox would then be missing rows nobody could account for.
 */
export type ProjectionOutcome =
  /** Filed onto a surface that reads it. */
  | { kind: 'projected'; surface: 'inbox' | 'publish_state'; rows: number }
  /** Stored, and no surface subscribes to this event type. Not a failure. */
  | { kind: 'no_subscriber' }
  /** Stored, but not attributable to a workspace, so there is nowhere to file it. */
  | { kind: 'not_routed'; routing: ZernioWebhookRouting }
  /**
   * Stored, attributable, and the platform it names has no representation here.
   * Zernio's comment events span seven platforms and its DM events five; this
   * product models four channels. A Reddit comment is a real event we genuinely
   * cannot file, and saying so is the honest answer — inventing a channel would put
   * a Reddit thread in the Instagram tab.
   */
  | { kind: 'channel_not_representable'; platform: string }
  /** Stored, attributable, and the row it refers to is not in this database. */
  | { kind: 'referent_absent'; what: string }

/**
 * Zernio's platform names → this product's four channels.
 *
 * NOT a lookup with a fallback. A fallback is how a Reddit comment becomes an
 * Instagram row. An unmapped platform returns undefined and the caller reports
 * `channel_not_representable`, which is a fact rather than a guess.
 *
 * `twitter` is Zernio's spelling and `x` is ours. Both are listed because Zernio
 * uses BOTH depending on the endpoint — its own publish, validate, edit and
 * unpublish surfaces disagree about the name of the same platform, and this map is
 * the one place that has to survive all four.
 */
export const CHANNEL: Readonly<Record<string, 'x' | 'gbp' | 'linkedin' | 'instagram'>> = {
  instagram: 'instagram',
  twitter: 'x',
  x: 'x',
  linkedin: 'linkedin',
  googlebusiness: 'gbp',
  gbp: 'gbp',
}

/** Read a nested string. Returns null for absent, non-string, or blank. */
export function str(o: unknown, ...path: string[]): string | null {
  let cur: unknown = o
  for (const key of path) {
    if (typeof cur !== 'object' || cur === null || Array.isArray(cur)) return null
    cur = (cur as Record<string, unknown>)[key]
  }
  return typeof cur === 'string' && cur.trim() !== '' ? cur : null
}

/** Read a nested finite number. Returns null for anything else. */
export function num(o: unknown, ...path: string[]): number | null {
  let cur: unknown = o
  for (const key of path) {
    if (typeof cur !== 'object' || cur === null || Array.isArray(cur)) return null
    cur = (cur as Record<string, unknown>)[key]
  }
  return typeof cur === 'number' && Number.isFinite(cur) ? cur : null
}

/** Read a nested boolean WITHOUT coercing. `undefined` means "not stated". */
export function bool(o: unknown, ...path: string[]): boolean | undefined {
  let cur: unknown = o
  for (const key of path) {
    if (typeof cur !== 'object' || cur === null || Array.isArray(cur)) return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return typeof cur === 'boolean' ? cur : undefined
}

/**
 * Upsert a thread and return its id.
 *
 * `on conflict … do update` here is NOT in tension with the append-only event log:
 * a thread is a mutable summary of a conversation, the event log is the immutable
 * record of what arrived. Re-running the same event writes the same values.
 *
 * `coalesce(excluded, existing)` on every field: a later event that omits a field
 * must not erase what an earlier one established. Zernio's payloads for one thread
 * are not uniform across event types.
 *
 * ── `updated_at` IS NOT SET HERE, AND THAT IS NOT AN OVERSIGHT ───────────────
 * `inbox_foundations.sql:161` puts a BEFORE UPDATE trigger on this table, and
 * `app.set_updated_at` assigns `new.updated_at := now()` UNCONDITIONALLY. Anything
 * this statement wrote to that column would be overwritten a moment later.
 *
 * The first version of this function carried an elaborate
 * `updated_at = case when (…) is distinct from (…) then now() else … end`, with a
 * comment claiming it was "what makes nothing changed true". It was dead code: a
 * mutation that replaced the whole expression with a bare `now()` changed no test's
 * result, because the trigger produced the same value either way. It is deleted
 * rather than kept as harmless decoration — a guard that cannot fail is a guard
 * that will be trusted by the next reader.
 *
 * SO WHAT ACTUALLY MAKES A REPLAY WRITE NOTHING is the duplicate short-circuit in
 * `ingestZernioWebhook`: on a redelivery the unique index refuses the event insert
 * and this function is never called at all. There is one mechanism, not two, and
 * `webhook-ingest.pglite.test.ts` pins it from both directions.
 */
export async function upsertThread(
  db: Queryable,
  t: {
    workspaceId: string
    channel: string
    kind: string
    platformThreadId: string
    authorName: string | null
    authorHandle: string | null
    rating: number | null
    body: string | null
    permalink: string | null
    postedAt: string | null
  },
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into inbox_threads
       (workspace_id, channel, kind, platform_thread_id,
        author_name, author_handle, rating, body, permalink, posted_at)
     values ($1::uuid, $2, $3, $4, $5, $6, $7::int, $8, $9, $10::timestamptz)
     on conflict (workspace_id, channel, platform_thread_id) do update set
       author_name   = coalesce(excluded.author_name, inbox_threads.author_name),
       author_handle = coalesce(excluded.author_handle, inbox_threads.author_handle),
       rating        = coalesce(excluded.rating, inbox_threads.rating),
       body          = coalesce(excluded.body, inbox_threads.body),
       permalink     = coalesce(excluded.permalink, inbox_threads.permalink),
       posted_at     = coalesce(excluded.posted_at, inbox_threads.posted_at)
     returning id`,
    [
      t.workspaceId,
      t.channel,
      t.kind,
      t.platformThreadId,
      t.authorName,
      t.authorHandle,
      t.rating,
      t.body,
      t.permalink,
      t.postedAt,
    ],
  )
  return r.rows[0]!.id
}

/**
 * Insert one platform-named message. Returns the number of rows written (0 on a
 * redelivery, which the partial unique index refuses).
 *
 * ── THE CONSTRAINT THIS PATH IS THE OTHER SIDE OF ────────────────────────────
 * `inbox_messages` carries `check ((sent_at is null) = (platform_message_id is
 * null))`, and its INSERT policy for `authenticated` admits only rows where both
 * are null. That pair exists so a member cannot fabricate a message claiming to
 * have reached a platform.
 *
 * A webhook message is the opposite case — the platform NAMED it — so both are set,
 * together. The receiver is allowed to do that because it is not a member: it
 * writes over a direct Postgres connection, and the policies are `TO authenticated`.
 * NOTHING HERE WEAKENS THAT POLICY OR THAT CHECK. Needing to edit either one would
 * mean this path was wrong, not that the constraint was.
 *
 * `sent_at` is the PLATFORM's stamp, never `now()`, for the same reason the thread
 * keeps `posted_at` apart from `first_seen_at`: an SLA measured from our own ingest
 * restarts every time we are late and hides the delay it exists to surface. The
 * `coalesce` fallback applies only when the payload carried no stamp at all, where
 * the alternative is violating the CHECK and dropping a real message.
 */
export async function insertMessage(
  db: Queryable,
  m: {
    workspaceId: string
    threadId: string
    direction: 'inbound' | 'outbound'
    body: string
    platformMessageId: string
    sentAt: string | null
  },
): Promise<number> {
  const r = await db.query<{ id: string }>(
    `insert into inbox_messages
       (workspace_id, thread_id, direction, body, platform_message_id, sent_at)
     values ($1::uuid, $2::uuid, $3, $4, $5, coalesce($6::timestamptz, now()))
     on conflict (workspace_id, platform_message_id) where platform_message_id is not null
       do nothing
     returning id`,
    [m.workspaceId, m.threadId, m.direction, m.body, m.platformMessageId, m.sentAt],
  )
  return r.rows.length
}
