import 'server-only'

import { createPgLedgerPort, loadBillingEnv, type PgLedgerPort } from '@sahoda/billing'
import type { MarketingObservation } from '@sahoda/shared'

import type { AudienceReading } from './observe/audience-growth'
import type { ChannelOutcome } from './observe/channel-return'
import type { FeaturedPost } from './observe/format-effect'
import type { CapturedPost } from './observe/edit-distance'
import type { PublishedPost } from './observe/tone-drift'

/**
 * THE MARKETING BRAIN'S WRITE PATH — a direct Postgres connection, server-only.
 *
 * ── WHY NOT THE RLS-SCOPED CLIENT ────────────────────────────────────────────
 * `marketing_observations` has a SELECT policy and nothing else, on purpose: a
 * customer may read what Sahoda noticed and may never write it. So the weekly
 * job cannot use the client the pages use, and runs as the table owner instead.
 * That makes `workspaceId` a parameter this module is TRUSTED with rather than
 * one it verifies, exactly as `lib/loop/store.ts` is — every statement below
 * carries it in the WHERE or the INSERT, and `server-only` keeps the whole file
 * out of a client bundle.
 *
 * The pool is borrowed from `createPgLedgerPort` for the three reasons the loop
 * store spells out: one pool per function rather than two against the same
 * pooler, the idle-client error guard that a module-level singleton must have,
 * and no `pg` type import so the lockfile does not move.
 */
/**
 * The narrow slice of a Postgres client these readers need.
 *
 * Identical in shape to `lib/zernio/webhook-store.ts`'s, and here for the same
 * reason: it lets a PGlite-backed test drive the REAL SQL below rather than a
 * copy of it pasted into a test file. A copied query proves the copy works and
 * says nothing about the one that ships, which matters more here than usual —
 * the three most consequential decisions in these features are all in SQL that
 * a unit test cannot see.
 */
export interface Queryable {
  query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>
}

let portSingleton: PgLedgerPort | undefined

function getPool(): PgLedgerPort['pool'] {
  if (!portSingleton) {
    const { databaseUrl } = loadBillingEnv()
    portSingleton = createPgLedgerPort({ connectionString: databaseUrl })
  }
  return portSingleton.pool
}

/**
 * The captions a workspace actually published, newest last.
 *
 * ── WHY post_variants AND NOT posts.body ─────────────────────────────────────
 * `posts.body` is the shared draft; `post_variants.body` is what went out on a
 * channel, after per-channel editing. An observation about how a business writes
 * has to read what a reader read, or the first claim it makes is about text
 * nobody ever saw.
 *
 * ── ONE ROW PER POST, NOT PER CHANNEL ────────────────────────────────────────
 * A post published to three channels is one act of writing. Counting it three
 * times would let a business that cross-posts more widely drift faster than one
 * that does not, which is a claim about their distribution wearing the clothes
 * of a claim about their voice. `distinct on (p.id)` takes the first variant per
 * post; which channel that is does not matter, because the variants of one post
 * are the same caption with per-channel trims.
 *
 * ── THE DATE IS WHEN IT WENT OUT, NOT WHEN THE ROW LAST MOVED ────────────────
 * `post_publish_logs.published_at` is the moment a platform accepted the post.
 * `posts.updated_at` is the moment anything about the row changed, which
 * includes a metric backfill and a status correction months later. Ordering a
 * habit-over-time claim by `updated_at` would let a bulk update reshuffle a
 * customer's writing history into a drift that never happened, so the log is the
 * source and `updated_at` is only the fallback for a post marked published with
 * no successful log behind it.
 */
export async function readPublishedPosts(
  workspaceId: string,
  limit = 200,
  db: Queryable = getPool(),
): Promise<PublishedPost[]> {
  const r = await db.query<{ id: string; body: string; published_on: string }>(
    `select id, body, published_on from (
       select distinct on (p.id)
              p.id   as id,
              v.body as body,
              (coalesce(
                 (select min(l.published_at)
                    from post_publish_logs l
                   where l.post_id = p.id
                     and l.workspace_id = p.workspace_id
                     and l.status = 'succeeded'
                     and l.published_at is not null),
                 p.updated_at
               ) at time zone 'utc')::date::text as published_on
         from posts p
         join post_variants v
           on v.post_id = p.id and v.workspace_id = p.workspace_id
        where p.workspace_id = $1
          and p.status = 'published'
          and v.publish_status = 'published'
          and length(btrim(v.body)) > 0
        order by p.id, v.created_at asc
     ) t
     order by published_on asc
     limit $2`,
    [workspaceId, limit],
  )
  return r.rows.map((row) => ({ id: row.id, body: row.body, publishedOn: row.published_on }))
}

export async function saveObservation(
  workspaceId: string,
  observation: MarketingObservation,
): Promise<{ inserted: boolean }> {
  const r = await getPool().query<{ inserted: boolean }>(
    `insert into marketing_observations
       (workspace_id, kind, subject, claim, evidence, computed_on)
     values ($1, $2, $3, $4, $5::jsonb, $6::date)
     on conflict (workspace_id, kind, subject, computed_on) do update
       set claim = excluded.claim,
           evidence = excluded.evidence,
           updated_at = now()
     returning (xmax = 0) as inserted`,
    [
      workspaceId,
      observation.kind,
      observation.subject,
      observation.claim,
      JSON.stringify(observation.evidence),
      observation.computedOn,
    ],
  )
  return { inserted: r.rows[0]?.inserted === true }
}

/**
 * Every workspace with at least one published post.
 *
 * The floor is deliberately at the database rather than in the runner: a
 * workspace that has published nothing can produce no observation of any kind,
 * and fetching two hundred rows to discover that costs a round trip per empty
 * workspace on a job that already loops over all of them.
 */
export async function workspacesWithPublishedPosts(limit = 500): Promise<string[]> {
  const r = await getPool().query<{ workspace_id: string }>(
    `select distinct p.workspace_id
       from posts p
      where p.status = 'published'
      limit $1`,
    [limit],
  )
  return r.rows.map((row) => row.workspace_id)
}

/**
 * Posts that carry a model draft, oldest first.
 *
 * ── WHY posts.body HERE, WHERE `readPublishedPosts` USES post_variants ───────
 * Those two functions answer different questions and the difference is the
 * point. A habit claim has to read what a READER read, so it takes the channel
 * copy. This is a claim about what the CUSTOMER changed, so it must compare the
 * same column before and after: `generated_body` was written from `body` at
 * generation, and `body` is what the edit moved. Reading the draft from one
 * column and the result from another would measure the per-channel trim as if
 * the customer had made it.
 *
 * ── PUBLISHED IS NOT REQUIRED, AND THAT IS DELIBERATE ────────────────────────
 * The edit happens when the draft is corrected, not when it goes out. A post
 * rewritten and never published still says what the business wanted changed,
 * which is the signal. Requiring `published` would throw away every correction
 * on a draft that was abandoned - and those are the most informative ones.
 *
 * ── NULL DRAFTS ARE FILTERED IN SQL, NOT DEFAULTED ───────────────────────────
 * `generated_body is not null` is the whole exclusion. A row without one is a
 * post a person typed, and handing it to the computer as a zero-distance post
 * would manufacture an improvement out of Sahoda being used less.
 */
export async function readCapturedPosts(
  workspaceId: string,
  limit = 200,
  db: Queryable = getPool(),
): Promise<CapturedPost[]> {
  const r = await db.query<{
    id: string
    generated_body: string
    body: string
    created_on: string
  }>(
    `select id,
            generated_body,
            coalesce(body, '') as body,
            (created_at at time zone 'utc')::date::text as created_on
       from posts
      where workspace_id = $1
        and generated_body is not null
      order by created_at asc
      limit $2`,
    [workspaceId, limit],
  )
  return r.rows.map((row) => ({
    id: row.id,
    generatedBody: row.generated_body,
    body: row.body,
    createdOn: row.created_on,
  }))
}

/**
 * Every workspace holding at least one captured draft.
 *
 * Separate from `workspacesWithPublishedPosts` because the two computers need
 * different populations: a business can have drafted with Sahoda for a month and
 * published none of it, and it still has a rewrite history worth measuring.
 * Unioning the two lists in the runner is what stops either computer being
 * silently skipped for a workspace the other one does not care about.
 */
/**
 * What each post earned on each channel, at its most recent measurement.
 *
 * ── WHY `distinct on` AND NOT `sum` ──────────────────────────────────────────
 * MEASURED in production 2026-08-26: `post_metric_snapshots` holds 40 rows for
 * 5 Instagram posts across 8 days. The platform is re-reported daily and the
 * value is the running total, so SUMMING would multiply one post's engagement
 * by the number of days we happened to poll — a number that says more about our
 * cron than about the customer's audience. The latest row per (post, channel,
 * metric) is the only honest reading.
 *
 * Rows are pivoted in TypeScript rather than with `filter (where …)` aggregates
 * so that a metric name we do not know about yet is ignored rather than folded
 * into a column it does not belong in.
 */
export async function readChannelOutcomes(
  workspaceId: string,
  limit = 400,
  db: Queryable = getPool(),
): Promise<ChannelOutcome[]> {
  const r = await db.query<{
    post_id: string
    channel: string
    metric: string
    value: string | number
    measured_on: string
  }>(
    `select distinct on (post_id, channel, metric)
            post_id, channel, metric, value,
            measured_on::text as measured_on
       from post_metric_snapshots
      where workspace_id = $1
        and metric in ('engagement', 'reach')
      order by post_id, channel, metric, measured_on desc
      limit $2`,
    [workspaceId, limit],
  )

  const byKey = new Map<string, ChannelOutcome>()
  for (const row of r.rows) {
    const key = `${row.post_id}:${row.channel}`
    const existing = byKey.get(key) ?? {
      postId: row.post_id,
      channel: row.channel,
      engagement: 0,
      reach: 0,
      measuredOn: row.measured_on,
    }
    const value = typeof row.value === 'number' ? row.value : Number(row.value)
    if (row.metric === 'engagement') existing.engagement = value
    if (row.metric === 'reach') existing.reach = value
    /** The later of the two metric rows dates the pair. */
    if (row.measured_on > existing.measuredOn) existing.measuredOn = row.measured_on
    byKey.set(key, existing)
  }
  return [...byKey.values()]
}

/**
 * Every follower reading a workspace has, oldest first.
 *
 * Only the `total` bucket. `gained` and `lost` are read by nothing: MEASURED in
 * production 2026-08-26 they are zero on every row, so a computer built on them
 * would decline forever for a reason that looked like flat growth.
 */
export async function readAudienceReadings(
  workspaceId: string,
  limit = 800,
  db: Queryable = getPool(),
): Promise<AudienceReading[]> {
  const r = await db.query<{
    account_id: string
    channel: string
    measured_on: string
    value: string | number
  }>(
    `select account_id, channel, measured_on::text as measured_on, value
       from audience_snapshots
      where workspace_id = $1
        and bucket = 'total'
      order by measured_on asc
      limit $2`,
    [workspaceId, limit],
  )
  return r.rows.map((row) => ({
    accountId: row.account_id,
    channel: row.channel,
    measuredOn: row.measured_on,
    total: typeof row.value === 'number' ? row.value : Number(row.value),
  }))
}

/** Workspaces with any follower reading, for the weekly pass's union. */
export async function workspacesWithAudience(limit = 500): Promise<string[]> {
  const r = await getPool().query<{ workspace_id: string }>(
    `select distinct workspace_id from audience_snapshots where bucket = 'total' limit $1`,
    [limit],
  )
  return r.rows.map((row) => row.workspace_id)
}

/**
 * Published captions with what they earned, one row per post.
 *
 * ── WHY THIS IS NOT `readChannelOutcomes` PLUS A JOIN AT THE CALLER ──────────
 * That reader returns one row per post PER CHANNEL, because comparing channels
 * is its whole job. This compares CAPTIONS, and a post cross-published to three
 * channels is one caption — counting it three times would let a business that
 * cross-posts more widely dominate its own comparison, which is a claim about
 * distribution wearing the clothes of a claim about writing. Same reasoning as
 * `readPublishedPosts`, and the same `distinct on (p.id)`.
 *
 * Engagement and reach are SUMMED across the channels a post went out on,
 * because the question is what that caption earned in total. The metric rows
 * are already the latest per post per channel before they are added.
 */
export async function readFeaturedPosts(
  workspaceId: string,
  limit = 400,
  db: Queryable = getPool(),
): Promise<FeaturedPost[]> {
  const r = await db.query<{
    post_id: string
    body: string
    engagement: string | number
    reach: string | number
    measured_on: string
  }>(
    `with latest as (
       select distinct on (post_id, channel, metric)
              post_id, channel, metric, value, measured_on
         from post_metric_snapshots
        where workspace_id = $1
          and metric in ('engagement', 'reach')
        order by post_id, channel, metric, measured_on desc
     ),
     totals as (
       select post_id,
              sum(value) filter (where metric = 'engagement') as engagement,
              sum(value) filter (where metric = 'reach')       as reach,
              max(measured_on)::text                           as measured_on
         from latest
        group by post_id
     ),
     caption as (
       select distinct on (p.id) p.id as post_id, v.body as body
         from posts p
         join post_variants v
           on v.post_id = p.id and v.workspace_id = p.workspace_id
        where p.workspace_id = $1
          and length(btrim(v.body)) > 0
        order by p.id, v.created_at asc
     )
     select t.post_id, c.body, t.engagement, t.reach, t.measured_on
       from totals t
       join caption c on c.post_id = t.post_id
      order by t.measured_on asc
      limit $2`,
    [workspaceId, limit],
  )
  const num = (v: string | number): number => (typeof v === 'number' ? v : Number(v))
  return r.rows.map((row) => ({
    postId: row.post_id,
    body: row.body,
    engagement: num(row.engagement),
    reach: num(row.reach),
    measuredOn: row.measured_on,
  }))
}

/** Workspaces with any measured post outcome, for the weekly pass's union. */
export async function workspacesWithChannelMetrics(limit = 500): Promise<string[]> {
  const r = await getPool().query<{ workspace_id: string }>(
    `select distinct workspace_id from post_metric_snapshots limit $1`,
    [limit],
  )
  return r.rows.map((row) => row.workspace_id)
}

export async function workspacesWithCapturedDrafts(limit = 500): Promise<string[]> {
  const r = await getPool().query<{ workspace_id: string }>(
    `select distinct workspace_id
       from posts
      where generated_body is not null
      limit $1`,
    [limit],
  )
  return r.rows.map((row) => row.workspace_id)
}
