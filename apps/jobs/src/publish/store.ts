import { isPostFormat, type VariantOptions } from '@sahoda/publishing'
import type { Pool } from 'pg'
import { assertPlatformPostId, type Channel, type PublishPostPayload } from '@sahoda/shared'
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
    const r = await pool.query<{
      id: string
      body: string
      extras: unknown
      format: string | null
    }>(
      // `format` joined the select on 2026-08-19. Without it the column exists, the
      // writer picks a format, and the publisher never learns what they picked — a
      // choice collected and ignored, which is the fake-success state this product
      // refuses. Null for every row written before the column, and null means the
      // variant states no intent.
      `select id, body, extras, format from post_variants
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

    // Computed once: the spread below would otherwise call it twice, and a reader
    // would reasonably wonder whether the two answers could differ.
    const cta = readCta(row.extras)
    const options = readOptions(row.extras)

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
      // The writer's choice about how that tail is written. Read here for the
      // same reason the CTA is: the composer has been storing it since the box
      // shipped, and the publisher was defaulting every send back to brackets
      // because `formatForPlatform` reads an absent flag as `true`. A writer who
      // unticked the box was told "Followers see the words on their own" and
      // published `[chai] [pune]`.
      //
      // `undefined` for a row that states no choice, never `false` — absence is
      // not a decision, and every variant written before the box existed must go
      // on publishing exactly as it did.
      keywordBrackets: readKeywordBrackets(row.extras),
      // The Google button. Written to `extras` by the composer since the CTA
      // picker shipped and read by NOTHING until now — the writer chose "ORDER",
      // saw it saved, and Google showed no button. Both halves or neither: Zernio
      // marks `callToAction` as requiring `type` AND `url`.
      ...(cta ? { cta } : {}),
      // ── THE PER-CHANNEL CONTROLS, WHICH MUST BE READ OR THEY ARE THE CTA ──
      // The Google button spent months being written to this column by the
      // composer and read by NOTHING: the writer picked "ORDER", saw it saved,
      // and Google showed no button. Every control added since ships with this
      // line, because a control that reaches no reader is worse than an absent
      // one — an absent control makes no promise.
      //
      // Shape-parsed here, VALUE-checked in `buildPlatformData` by the same
      // `refusePoll` / `refuseGbpTopic` the composer runs. A second copy of a
      // bound in this file is how the editor and the publisher come to disagree.
      ...(options ? { options } : {}),
      // Validated rather than cast. The column carries a CHECK constraint, but a
      // value this code does not recognise must not be handed to the refusal rules
      // as if it were one of theirs — an unknown format states no intent we can
      // hold the post to, so it is read as none.
      format: isPostFormat(row.format) ? row.format : null,
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

  /**
   * Take exclusive ownership of one variant for publishing. True means it is ours.
   *
   * ── THIS SINGLE STATEMENT IS THE WHOLE GUARANTEE ─────────────────────────────
   * A conditional UPDATE is atomic in Postgres: two overlapping cron ticks both run
   * it, exactly one matches a row, and the loser sees rowCount 0. There is no
   * read-then-write window to lose, which is why the check lives in the WHERE
   * clause rather than in a preceding SELECT.
   *
   * The predicate says three things:
   *   · the variant still has work to do — `pending`, `scheduled`, a prior `failed`
   *     (a retry is legitimate), or a `publishing` whose holder is gone. A
   *     `published` variant is never re-claimed, so a duplicate tick cannot post it
   *     a second time — with ONE exception, stated in the next paragraph.
   *
   * ── A FIXTURE "PUBLISH" IS NOT A PUBLISH, SO IT IS STILL WORK TO DO ─────────
   * `published` + a permalink beginning `fixture://` is a row the fixture rail
   * marked. Nothing left the building; the permalink is `fixture.ts`'s own. That
   * row is claimable again, because the alternative was measured: no RPC, no
   * cron and no button could ever publish it for real, and the publish route
   * answered "Already live on X" for it. Re-publishing a fixture row cannot post
   * twice, since the first "post" never existed. A `published` row with a real
   * permalink, or with none, stays exactly as unclaimable as before.
   *   · nobody holds a live claim, OR the claim is older than the lease and its
   *     holder is therefore presumed dead.
   *   · it belongs to the workspace we were given — the payload's workspace is not
   *     trusted for the tenant decision (that is
   *     `assert_account_for_scheduled_post`'s job), but scoping the write to it
   *     costs nothing and keeps this statement from reaching outside its post.
   *
   * ── WHY `publishing` IS IN THAT LIST, AND WAS THE WHOLE BUG ──────────────────
   * It was not, and the lease was therefore dead code. Claiming sets
   * `publish_status = 'publishing'`; the status list excluded `publishing`; so the
   * only rows the age check could ever be evaluated against were rows nobody had
   * claimed. A publisher killed mid-flight left `publishing` + a claim timestamp,
   * and NO later tick could match it — not after ten minutes, not after a week. The
   * variant was stranded in `publishing` permanently, which is exactly the hazard
   * apps/jobs/CLAUDE.md's rule 3 states for `posts.status` ("a run that dies would
   * strand it there forever"), reproduced one table down.
   *
   * With `publishing` in the list the two conditions compose as intended: a LIVE
   * claim is still refused by the age check (`lease.pglite.test.ts` holds the row
   * for the last second of the lease), and only a dead one is taken over.
   *
   * A `publishing` row with a NULL claim is treated as stale rather than untouchable.
   * No path here can produce one — the claim and the status are set in this single
   * statement, and every release clears both — so such a row can only predate the
   * claim existing at all, and leaving it unclaimable would strand it for the same
   * reason the bug above did.
   *
   * ── WHAT THIS TRADES, STATED PLAINLY ────────────────────────────────────────
   * Re-claiming means re-PUBLISHING, and there is one case where that can post
   * twice. `publishing` + a stale claim is reachable only by process death (the
   * transient path releases explicitly and leaves `scheduled`). If the process died
   * AFTER the platform accepted the post but BEFORE `writeLog` committed, the post
   * is live with no log row — so `listUnresolvedPublishes` cannot see it either, and
   * the next tick past the lease publishes it again.
   *
   * The adapter's `requestId` is the caller's key, `${postId}:${channel}:${scheduledAt}`,
   * and Zernio documents collapsing a repeat onto one post — but doc 13 §5 puts that
   * window at ~5 minutes and marks it `[DOC]`, never observed. The lease is ten. A
   * re-claim therefore lands OUTSIDE the window this would rely on. And until
   * 2026-09-02 the two rails did not even mint the same key: the publish route took
   * `scheduled_at` as the RPC's jsonb text (microseconds, numeric offset) while the
   * dispatcher took the driver's `Date.toISOString()`, so a manual press and a cron
   * tick on the same row sent Zernio two different ids. The route now normalises to
   * the driver's shape (`route.publish.test.ts` asserts equality); nothing here
   * relies on the collapse either way.
   *
   * Taken deliberately: the old behaviour was a GUARANTEED permanent strand on every
   * crash, and this is a narrow race requiring death inside the gap between one HTTP
   * response and one INSERT. It is not closed, and it must not be flipped on
   * (`SAHODA_PUBLISH_ENABLED`) as if it were. See SL-069.
   */
  async function claimVariant(payload: PublishPostPayload, leaseSeconds: number): Promise<boolean> {
    const r = await pool.query(
      `update post_variants
          set publish_status = 'publishing',
              publish_claimed_at = now()
        where id = $1
          and post_id = $2
          and workspace_id = $3
          and (publish_status in ('pending', 'scheduled', 'failed', 'publishing')
               or (publish_status = 'published' and permalink like 'fixture://%'))
          and (publish_claimed_at is null
               or publish_claimed_at < now() - make_interval(secs => $4::int))`,
      [payload.variantId, payload.postId, payload.workspaceId, leaseSeconds],
    )
    return (r.rowCount ?? 0) > 0
  }

  /**
   * Hand a claim back without recording an outcome.
   *
   * For the TRANSIENT case only: `runPublishPost` rethrows those so a runner can
   * retry, and it deliberately does not touch the variant — the attempt is not
   * over. Left alone the row would sit `publishing` until its lease ran out, which
   * shows the writer "publishing" for minutes with no error and costs at least one
   * cron cycle. Releasing here makes the retry immediate.
   *
   * Guarded on `publish_status = 'publishing'` so a release arriving after the
   * lease already expired and someone else re-claimed cannot clear THEIR claim.
   * It returns to `scheduled` rather than `pending`: the post is still due.
   */
  async function releaseVariant(payload: PublishPostPayload): Promise<void> {
    await pool.query(
      `update post_variants
          set publish_status = 'scheduled',
              publish_claimed_at = null
        where id = $1
          and workspace_id = $2
          and publish_status = 'publishing'`,
      [payload.variantId, payload.workspaceId],
    )
  }

  async function markVariant(update: VariantUpdate): Promise<void> {
    await pool.query(
      `update post_variants
          set publish_status = $3,
              platform_post_id = coalesce($4, platform_post_id),
              permalink = coalesce($5, permalink),
              last_error = $6,
              -- Every terminal outcome ends the claim. Leaving it set would make a
              -- published row look like it still held a lease.
              publish_claimed_at = null
        where id = $1 and workspace_id = $2`,
      [
        update.variantId,
        update.workspaceId,
        update.publishStatus,
        // Refuses a 24-hex provider object id outright. This column is the analytics
        // key; a Zernio `_id` here reads as populated and returns zeros forever.
        assertPlatformPostId(update.platformPostId),
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
    // ── WHICH RAIL, DECIDED BY THE ROW AND NOT BY THE CHANNEL ─────────────────
    // A Zernio connection is one whose external_account carries a `profileId`,
    // written by `upsert_zernio_connection` from the workspace's MAPPING. That is
    // the only honest test: instagram is always Zernio, but x, gbp and linkedin can
    // be either, and a workspace holding its own X grant must keep using it.
    //
    // Asked before the token read, because the Zernio path must never touch
    // connection_secrets — there is no secret to find and a LEFT JOIN returning
    // null would look identical to a broken vault.
    if (await isZernioConnection(payload)) return loadZernioConnection(payload)

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
  /**
   * Whether this channel's active connection is a Zernio-fronted one.
   *
   * Keyed on `external_account ->> 'profileId'`, which only
   * `upsert_zernio_connection` ever writes and which it takes from the workspace's
   * mapping rather than from its own argument. A native OAuth connection has no
   * such field.
   */
  async function isZernioConnection(payload: PublishPostPayload): Promise<boolean> {
    const r = await pool.query<{ ok: boolean }>(
      `select (c.external_account ->> 'profileId') is not null as ok
         from connections c
        where c.workspace_id = $1 and c.platform = $2 and c.status = 'active'
        order by c.updated_at desc
        limit 1`,
      [payload.workspaceId, payload.channel],
    )
    return r.rows[0]?.ok === true
  }

  async function loadZernioConnection(
    payload: PublishPostPayload,
  ): Promise<StoredConnection | null> {
    const candidate = await pool.query<{ id: string; external_account_id: string | null }>(
      `select c.id, c.external_account ->> 'id' as external_account_id
         from connections c
        where c.workspace_id = $1 and c.platform = $2 and c.status = 'active'
        order by c.updated_at desc
        limit 1`,
      [payload.workspaceId, payload.channel],
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
      viaZernio: true,
    }
  }

  /**
   * Live X sends for this workspace since `since` — the numerator of the X ration.
   *
   * ── `mode = 'live'` IS THE WHOLE POINT OF THIS QUERY ─────────────────────────
   * The obvious counter is `post_variants where channel='x' and publish_status =
   * 'published'`. MEASURED against production on 2026-08-19 that returns 3, and
   * every one of the three is a FIXTURE run whose permalink begins `fixture://`.
   * Nothing reached X and nothing was billed. A ration fed from there would refuse
   * a customer over money nobody spent.
   *
   * `status = 'succeeded'` for the mirror reason: X bills for a request that
   * SUCCEEDS in creating a post. A failed attempt is a different conversation with
   * X's billing and is not this meter's to guess at.
   *
   * `created_at`, not `published_at`: X bills at the moment of the request, and
   * `published_at` is nullable — counting it would silently drop billed requests
   * whose timestamp never arrived, which errs in the permissive direction. A cap
   * must never be wrong in the direction that spends more.
   */
  async function countLiveSends(args: {
    workspaceId: string
    channel: Channel
    since: Date
  }): Promise<number> {
    const r = await pool.query<{ n: string }>(
      `select count(*)::text as n from post_publish_logs
        where workspace_id = $1
          and channel = $2
          and mode = 'live'
          and status = 'succeeded'
          and created_at >= $3`,
      [args.workspaceId, args.channel, args.since.toISOString()],
    )
    // `count(*)` never returns no rows, but a null here would become NaN and NaN
    // compares false against every ration, which reads as "allowed" — the one
    // failure mode a spending cap may not have.
    const n = Number(r.rows[0]?.n)
    if (!Number.isFinite(n)) throw new Error('post_publish_logs count returned no number')
    return n
  }

  return {
    isZernioConnection,
    loadVariant,
    claimVariant,
    releaseVariant,
    writeLog,
    markVariant,
    markConnection,
    loadConnection,
    countLiveSends,
  }
}

/**
 * The hashtag list out of `post_variants.extras`, which is untyped jsonb.
 *
 * Never throws and never returns junk: anything that is not an array of strings
 * comes back undefined, which is exactly "no hashtags" to the Constraint Engine.
 * More than one lane writes this column, so a shape we do not recognise is a
 * reason to ignore the field, not to fail the publish.
 */
/**
 * The Google Business call-to-action stored on `post_variants.extras`.
 *
 * Returns undefined unless BOTH halves are present and non-empty. A type with no
 * URL is not carried forward as a half-CTA to be dropped later — it reaches
 * `buildPlatformData`, which refuses the publish with a sentence about the
 * missing web address, because a button that goes nowhere is a payload Zernio
 * rejects rather than a feature that partly works.
 *
 * Value validation is deliberately NOT here. `isValidGbpCtaType` runs against the
 * frozen Constraint Engine's own list inside the builder, and a second check
 * against a second copy of that list is how the two would eventually disagree.
 */
function readCta(extras: unknown): { type: string; url: string } | undefined {
  if (typeof extras !== 'object' || extras === null || Array.isArray(extras)) return undefined
  const raw = extras as Record<string, unknown>
  const type = raw.gbpCta
  const url = raw.ctaUrl
  if (typeof type !== 'string' || type.trim() === '') return undefined
  if (typeof url !== 'string' || url.trim() === '') return { type, url: '' }
  return { type, url }
}

/**
 * The per-channel controls stored on `post_variants.extras`.
 *
 * Never throws and never returns junk. `extras` is one shared jsonb column that
 * more than one lane writes, so a shape we do not recognise is a reason to ignore
 * the field rather than to fail the publish — the same rule `readHashtags` and
 * `readCta` follow.
 *
 * Deliberately shape-only. Whether a poll has enough answers, whether an event
 * has a date Google will accept — those are `buildPlatformData`'s to refuse, with
 * the functions the composer already ran. Checking them twice in two places is
 * how two answers appear.
 *
 * EXPORTED so it can be tested without a database. This is the link in the chain
 * that was dead for the Google button: both ends were proved and the row-to-
 * variant step in the middle was not, which is precisely where the value was
 * being dropped.
 */
export function readOptions(extras: unknown): VariantOptions | undefined {
  if (typeof extras !== 'object' || extras === null || Array.isArray(extras)) return undefined
  const raw = extras as Record<string, unknown>
  const out: VariantOptions = {}

  const poll = raw.poll
  if (typeof poll === 'object' && poll !== null && !Array.isArray(poll)) {
    const p = poll as Record<string, unknown>
    const answers = Array.isArray(p.options)
      ? p.options.filter((o): o is string => typeof o === 'string')
      : []
    if (answers.length > 0) {
      out.poll = {
        options: answers,
        ...(typeof p.question === 'string' ? { question: p.question } : {}),
        ...(typeof p.durationMinutes === 'number' ? { durationMinutes: p.durationMinutes } : {}),
        ...(typeof p.durationCode === 'string' ? { durationCode: p.durationCode } : {}),
      }
    }
  }

  if (typeof raw.firstComment === 'string' && raw.firstComment.trim() !== '') {
    out.firstComment = raw.firstComment
  }
  if (Array.isArray(raw.collaborators)) {
    const names = raw.collaborators.filter((n): n is string => typeof n === 'string')
    if (names.length > 0) out.collaborators = names
  }
  if (raw.aiGenerated === true) out.aiGenerated = true

  if (raw.gbpTopic === 'EVENT' || raw.gbpTopic === 'OFFER') {
    out.gbpTopic = raw.gbpTopic
    const event = raw.gbpEvent
    if (typeof event === 'object' && event !== null && !Array.isArray(event)) {
      const e = event as Record<string, unknown>
      out.gbpEvent = {
        title: typeof e.title === 'string' ? e.title : '',
        startDate: typeof e.startDate === 'string' ? e.startDate : '',
        ...(typeof e.endDate === 'string' ? { endDate: e.endDate } : {}),
      }
    }
    const offer = raw.gbpOffer
    if (typeof offer === 'object' && offer !== null && !Array.isArray(offer)) {
      const o = offer as Record<string, unknown>
      out.gbpOffer = {
        ...(typeof o.couponCode === 'string' ? { couponCode: o.couponCode } : {}),
        ...(typeof o.redeemUrl === 'string' ? { redeemUrl: o.redeemUrl } : {}),
        ...(typeof o.terms === 'string' ? { terms: o.terms } : {}),
      }
    }
  }

  return Object.keys(out).length === 0 ? undefined : out
}

/**
 * `post_variants.extras.keywordBrackets` — whether the keyword tail publishes as
 * `[chai] [pune]` or as `chai pune`.
 *
 * Only a real boolean counts. A string `'false'` is not a decision this code can
 * read, and guessing at one would publish the opposite of what a writer chose;
 * ignoring it leaves the documented default, which is what every row without the
 * key already gets. Same rule as `readHashtags` and `readCta`: an unrecognised
 * shape drops the field, never the publish.
 */
export function readKeywordBrackets(extras: unknown): boolean | undefined {
  if (typeof extras !== 'object' || extras === null || Array.isArray(extras)) return undefined
  const raw = (extras as Record<string, unknown>).keywordBrackets
  return typeof raw === 'boolean' ? raw : undefined
}

function readHashtags(extras: unknown): string[] | undefined {
  if (typeof extras !== 'object' || extras === null || Array.isArray(extras)) return undefined
  const raw = (extras as Record<string, unknown>).hashtags
  if (!Array.isArray(raw)) return undefined
  const tags = raw.filter((tag): tag is string => typeof tag === 'string')
  return tags.length > 0 ? tags : undefined
}
