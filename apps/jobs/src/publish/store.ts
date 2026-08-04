import type { Pool } from 'pg'
import type { PublishPostPayload } from '@sahoda/shared'
import type { PublishLogEntry, PublishVariant, VariantUpdate } from './runPublishPost'
import type { StoredConnection } from './tokens'

export interface PublishStoreOptions {
  pool: Pool
}

/**
 * The database side of publishPost, over the same direct `pg` pool the ledger already
 * requires. apps/jobs/CLAUDE.md describes this as "the Supabase service-role client";
 * a direct owner connection bypasses RLS the same way and avoids standing up a second
 * privileged path just for these five statements. Either way it is server-only and must
 * never be reachable from client code.
 *
 * post_publish_logs is append-only (a block_mutations trigger that service_role does NOT
 * bypass), so `writeLog` only ever inserts — one immutable row per attempt. Everything
 * mutable lives on post_variants and connections.
 */
export function createPublishStore(opts: PublishStoreOptions) {
  const { pool } = opts

  async function loadVariant(payload: PublishPostPayload): Promise<PublishVariant | null> {
    const r = await pool.query<{ id: string; body: string; extras: unknown }>(
      `select id, body, extras from post_variants
        where id = $1 and post_id = $2 and workspace_id = $3`,
      [payload.variantId, payload.postId, payload.workspaceId],
    )
    const row = r.rows[0]
    if (!row) return null

    const media = await pool.query<{
      storage_path: string
      mime: string | null
      bytes: number | null
    }>(
      `select storage_path, mime, bytes from post_media
        where post_id = $1 and workspace_id = $2
        order by created_at`,
      [payload.postId, payload.workspaceId],
    )

    return {
      variantId: row.id,
      body: row.body,
      // The composer validates the hashtag count against `spec.maxHashtags`, and
      // until this was read the publisher validated a variant with none — so a
      // 40-hashtag Instagram caption was red in the editor and green here.
      //
      // `hasLink` is deliberately still absent. Computing it needs apps/web's
      // `detect-link` heuristic, and a second copy of a 300-line list of TLDs is a
      // guarantee the meter and the publisher will one day disagree. It is only
      // read for `linkPolicy: 'counted_fixed'` (X), which cannot publish at all
      // until the vault opener exists — so this costs nothing today and must be
      // revisited with X. See REQUESTS.md.
      hashtags: readHashtags(row.extras),
      media: media.rows.map((m) => ({
        storagePath: m.storage_path,
        mime: m.mime ?? 'application/octet-stream',
        bytes: m.bytes ?? 0,
      })),
    }
  }

  async function writeLog(entry: PublishLogEntry): Promise<void> {
    await pool.query(
      `insert into post_publish_logs
         (workspace_id, post_id, variant_id, connection_id, channel, attempt,
          status, mode, platform_post_id, permalink, error, job_run_id, published_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        entry.workspaceId,
        entry.postId,
        entry.variantId,
        entry.connectionId,
        entry.channel,
        entry.attempt,
        entry.status,
        entry.mode,
        entry.platformPostId,
        entry.permalink,
        entry.error ? JSON.stringify(entry.error) : null,
        entry.jobRunId,
        entry.publishedAt,
      ],
    )
  }

  async function markVariant(update: VariantUpdate): Promise<void> {
    await pool.query(
      `update post_variants
          set publish_status = $3,
              platform_post_id = coalesce($4, platform_post_id),
              permalink = coalesce($5, permalink),
              last_error = $6
        where id = $1 and workspace_id = $2`,
      [
        update.variantId,
        update.workspaceId,
        update.publishStatus,
        update.platformPostId ?? null,
        update.permalink ?? null,
        update.lastError ? JSON.stringify(update.lastError) : null,
      ],
    )
  }

  /** Flip a connection out of `active` so the UI can raise a reconnect CTA. */
  async function markConnection(connectionId: string, status: 'expired'): Promise<void> {
    await pool.query('update connections set status = $2 where id = $1', [connectionId, status])
  }

  /**
   * The connection for this payload's channel, with its secret left SEALED — opening it
   * is the token resolver's job, and this layer never sees plaintext.
   *
   * ── WHY THE ZERNIO CHANNELS TAKE A DIFFERENT PATH ───────────────────────────
   * This query selects by `payload.workspaceId`. That value is DERIVED at dispatch
   * from `posts.workspace_id` (dispatch/pgDispatch.ts:100) — but it then crosses the
   * Trigger.dev queue as ordinary payload data, and between enqueue and execute
   * nothing re-checks it.
   *
   * For x/gbp/linkedin that is survivable: we hold the credential, and a wrong
   * workspace yields a connection whose token simply does not work.
   *
   * For instagram it is not. Zernio validates an accountId against your whole TEAM,
   * not against the profile in the request (doc 13 §3), so a wrong id does not
   * error — it publishes successfully to another customer's Instagram, returns HTTP
   * 200, and hands back a live platformPostUrl. There is nothing to catch.
   *
   * So instagram resolves through `assert_account_for_scheduled_post`, which takes
   * NO workspace argument at all: it re-derives the workspace from `posts` by
   * post id, the profile from that workspace, and returns the account id only if it
   * belongs to both. The payload's workspaceId becomes decoration on that path.
   */
  async function loadConnection(payload: PublishPostPayload): Promise<StoredConnection | null> {
    if (payload.channel === 'instagram') return loadZernioConnection(payload)

    const r = await pool.query<{
      id: string
      external_account_id: string | null
      status: string
      access_token_enc: unknown
    }>(
      `select c.id,
              c.external_account ->> 'id' as external_account_id,
              c.status,
              s.access_token_enc
         from connections c
         left join connection_secrets s on s.connection_id = c.id
        where c.workspace_id = $1 and c.platform = $2
        order by (c.status = 'active') desc, c.updated_at desc
        limit 1`,
      [payload.workspaceId, payload.channel],
    )
    const row = r.rows[0]
    if (!row) return null

    return {
      connectionId: row.id,
      externalAccountId: row.external_account_id ?? '',
      status: row.status,
      sealedAccessToken: row.access_token_enc,
    }
  }

  /**
   * The guarded path. The account id comes back from the database or not at all —
   * there is no branch here that assembles one.
   *
   * A refusal raises CROSS_TENANT_ACCOUNT (one error for every failure below the
   * line, so a caller cannot enumerate another tenant's ids by probing) and this
   * returns null, which the caller already treats as "no usable connection".
   *
   * No `connection_secrets` read: a Zernio connection has no sealed token, because
   * Zernio holds the Meta credential and we never see one.
   */
  async function loadZernioConnection(
    payload: PublishPostPayload,
  ): Promise<StoredConnection | null> {
    const candidate = await pool.query<{ id: string; external_account_id: string | null }>(
      `select c.id, c.external_account ->> 'id' as external_account_id
         from connections c
        where c.workspace_id = $1 and c.platform = 'instagram' and c.status = 'active'
        order by c.updated_at desc
        limit 1`,
      [payload.workspaceId],
    )
    const row = candidate.rows[0]
    if (!row?.external_account_id) return null

    // THE GATE. Nothing above this line is trusted: the id just read is only a
    // candidate until the database re-derives it from the post itself.
    const verified = await pool.query<{ account_id: string }>(
      `select public.assert_account_for_scheduled_post($1, $2, $3) as account_id`,
      [payload.postId, payload.variantId, row.external_account_id],
    )
    const accountId = verified.rows[0]?.account_id
    if (!accountId) return null

    return {
      connectionId: row.id,
      externalAccountId: accountId,
      status: 'active',
      sealedAccessToken: null,
    }
  }

  return { loadVariant, writeLog, markVariant, markConnection, loadConnection }
}

/**
 * The hashtag list out of `post_variants.extras`, which is untyped jsonb.
 *
 * Never throws and never returns junk: anything that is not an array of strings
 * comes back undefined, which is exactly "no hashtags" to the Constraint Engine.
 * More than one lane writes this column, so a shape we do not recognise is a
 * reason to ignore the field, not to fail the publish.
 */
function readHashtags(extras: unknown): string[] | undefined {
  if (typeof extras !== 'object' || extras === null || Array.isArray(extras)) return undefined
  const raw = (extras as Record<string, unknown>).hashtags
  if (!Array.isArray(raw)) return undefined
  const tags = raw.filter((tag): tag is string => typeof tag === 'string')
  return tags.length > 0 ? tags : undefined
}
