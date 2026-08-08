import type { Pool } from 'pg'
import { assertPlatformPostId, type Channel } from '@sahoda/shared'

import type { AccountFacts, ConnectionToCheck, PublishResolution, UnresolvedPublish } from './sweep'

/**
 * The database side of the reconciliation pass — the four statements, and nothing
 * that talks to Zernio.
 *
 * Split out of `deps.ts` so it can be EXECUTED in a test rather than read. The
 * publish lease spent weeks with a predicate that looked right and could never
 * match (see `store.ts` in ../publish), and every statement here carries the same
 * kind of load: one of them is the only thing that stops a dead account being
 * polled and published to forever.
 */

/**
 * How many rows one pass takes on. Each connection is one Zernio request and each
 * unresolved publish is another, so this is a request budget as much as a row
 * budget. Oldest-first everywhere, so a backlog drains across passes.
 */
export const DEFAULT_LIMIT = 25

/**
 * How long after an unfinished attempt it is worth asking again.
 *
 * The adapter already polled for ~36 seconds. Asking again immediately would
 * mostly re-learn "still processing" at the cost of a request; two minutes is
 * comfortably past the ~14s Instagram was observed to take, so a post that was
 * going to finish has finished.
 */
export const RESOLVE_AFTER_SECONDS = 120

export interface ReconcileStoreOptions {
  pool: Pool
  limit?: number
}

export function createReconcileStore(opts: ReconcileStoreOptions) {
  const { pool } = opts
  const limit = opts.limit ?? DEFAULT_LIMIT

  /**
   * Active Zernio connections, oldest-checked first, joined to the profile the
   * workspace is actually mapped to.
   *
   * The join is not decoration: `external_account->>'profileId'` is written by
   * `upsert_zernio_connection` from the MAPPING rather than from its argument, so
   * reading the profile back through `zernio_profiles` re-derives the same tenant
   * boundary instead of trusting a jsonb field.
   *
   * `status = 'active'` is also the whole of the "a dead account is never asked
   * about again" rule: `applyAccountFacts` moves a flagged connection to `expired`,
   * and this clause is what makes that terminal. Nothing else re-polls.
   */
  async function listConnectionsToCheck(): Promise<ConnectionToCheck[]> {
    // EVERY Zernio-fronted connection, not just instagram. A connection is one
    // of Zernio's when `external_account` carries the profileId that
    // upsert_zernio_connection wrote from the workspace's mapping; a native OAuth
    // row has no such field and is not ours to ask Zernio about.
    const r = await pool.query<{
      id: string
      workspace_id: string
      profile_id: string
      account_id: string
      platform: string
    }>(
      `select c.id, c.workspace_id, zp.profile_id,
              c.external_account ->> 'id' as account_id,
              c.platform
         from connections c
         join zernio_profiles zp on zp.workspace_id = c.workspace_id
        where c.status = 'active'
          and c.external_account ->> 'id' is not null
          and c.external_account ->> 'profileId' is not null
        order by c.last_checked_at nulls first, c.created_at
        limit $1`,
      [limit],
    )
    return r.rows.map((row) => ({
      connectionId: row.id,
      workspaceId: row.workspace_id,
      profileId: row.profile_id,
      accountId: row.account_id,
      platform: row.platform,
    }))
  }

  /**
   * Variants the platform accepted but that never resolved here.
   *
   * Found through `post_publish_logs`: when the adapter gives up on Instagram's
   * container flow it throws STILL_PROCESSING, and `runPublishPost` records the
   * platform's post id on that failed log row precisely so this query can exist.
   * Without the id there would be nothing to ask about.
   *
   * Excludes anything already settled with a permalink — that one is done.
   */
  async function listUnresolvedPublishes(): Promise<UnresolvedPublish[]> {
    const r = await pool.query<{
      variant_id: string
      workspace_id: string
      post_id: string
      channel: string
      platform_post_id: string
    }>(
      `select distinct on (l.variant_id)
              l.variant_id, l.workspace_id, l.post_id, l.channel, l.platform_post_id
         from post_publish_logs l
         join post_variants v on v.id = l.variant_id
        -- Every channel on the rail. The two-phase wait is instagram's most
        -- visible symptom but the others go through the same Zernio post object,
        -- so the same "accepted, never resolved" gap exists for all of them.
        where l.platform_post_id is not null
          and l.created_at < now() - make_interval(secs => $2::int)
          and v.permalink is null
          and v.publish_status <> 'published'
        order by l.variant_id, l.created_at desc
        limit $1`,
      [limit, RESOLVE_AFTER_SECONDS],
    )
    return r.rows.map((row) => ({
      variantId: row.variant_id,
      workspaceId: row.workspace_id,
      postId: row.post_id,
      channel: row.channel as Channel,
      // post_publish_logs.platform_post_id holds ZERNIO's id on the STILL_PROCESSING
      // path — that is what makes the post addressable here. Different column, and a
      // different meaning, from post_variants.platform_post_id.
      providerPostId: row.platform_post_id,
    }))
  }

  /**
   * Write account health back onto the row the connections page reads.
   *
   * `external_account` is merged rather than replaced: it also carries the id and
   * the profile id, and those are the tenant boundary — an overwrite that dropped
   * them would leave a connection nobody can match to an account.
   *
   * `expires_at` is the ONLY input to the T-7 warning. apps/web derives that at read
   * time (`lib/connections/health.ts`) from this column alone, so a pass that does
   * not write it is a warning that can never fire. `coalesce` keeps a previously
   * known deadline when this read did not carry one, rather than blanking it.
   */
  async function applyAccountFacts(
    connection: ConnectionToCheck,
    facts: AccountFacts,
  ): Promise<void> {
    await pool.query(
      `update connections
          set external_account = external_account
                || jsonb_build_object(
                     'needsReconnection', $3::boolean,
                     'platformStatus', $4::text
                   ),
              expires_at = coalesce($5::timestamptz, expires_at),
              last_checked_at = now(),
              -- A connection Zernio has flagged is no longer active, and the
              -- publisher reads this column: leaving it 'active' would let a
              -- scheduled post attempt an account that cannot publish.
              status = case when $3::boolean then 'expired' else status end
        where id = $1 and workspace_id = $2`,
      [
        connection.connectionId,
        connection.workspaceId,
        facts.needsReconnection,
        facts.platformStatus,
        facts.tokenExpiresAt,
      ],
    )
  }

  /**
   * Settle a variant that has finally resolved, and append the log row that
   * records how we found out.
   *
   * The log is an append — `post_publish_logs` is immutable and the earlier
   * STILL_PROCESSING row stays exactly as it was written. The history reads as
   * what actually happened: we tried, we gave up waiting, we asked later, it had
   * gone live. Rewriting the first row would erase the giving-up.
   */
  async function applyResolution(
    item: UnresolvedPublish,
    resolution: PublishResolution,
  ): Promise<void> {
    if (resolution.kind === 'pending') return

    const succeeded = resolution.kind === 'published'
    await pool.query(
      `insert into post_publish_logs
         (workspace_id, post_id, variant_id, connection_id, channel, attempt,
          status, mode, platform_post_id, permalink, error, job_run_id, published_at)
       values ($1,$2,$3,null,$4,0,$5,'live',$6,$7,$8,$9,$10)`,
      [
        item.workspaceId,
        item.postId,
        item.variantId,
        item.channel,
        succeeded ? 'succeeded' : 'failed',
        // The log keeps ZERNIO's id: this row is the reconcile trail, and the handle
        // has to stay addressable. Only post_variants gets the platform id.
        item.providerPostId,
        succeeded ? resolution.permalink : null,
        succeeded
          ? null
          : JSON.stringify({
              code: 'PLATFORM_REJECTED',
              classification: 'permanent',
              message: resolution.reason ?? 'The platform refused this post.',
            }),
        `reconcile:${item.variantId}`,
        succeeded ? new Date().toISOString() : null,
      ],
    )

    await pool.query(
      `update post_variants
          set publish_status = $3,
              platform_post_id = coalesce($4, platform_post_id),
              permalink = coalesce($5, permalink),
              publish_claimed_at = null
        where id = $1 and workspace_id = $2`,
      [
        item.variantId,
        item.workspaceId,
        succeeded ? 'published' : 'failed',
        // The PLATFORM's id, taken from the leg we just re-read — never
        // `item.providerPostId`, which is Zernio's `_id`. `coalesce` above means a
        // null leaves whatever is already there rather than clearing it.
        resolution.kind === 'published' ? assertPlatformPostId(resolution.platformPostId) : null,
        succeeded ? resolution.permalink : null,
      ],
    )
  }

  return { listConnectionsToCheck, listUnresolvedPublishes, applyAccountFacts, applyResolution }
}
