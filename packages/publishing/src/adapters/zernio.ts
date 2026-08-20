import {
  AdapterError,
  CONSTRAINTS,
  type Channel,
  type FormattedContent,
  type PublishAdapter,
  type PublishRequest,
  type PublishSuccess,
} from '@sahoda/shared'

import {
  ZernioError,
  ZERNIO_ID_RE,
  type ZernioClient,
  type ZernioMediaItemInput,
  type ZernioPlatformEntry,
  type ZernioPlatformResult,
  type ZernioPost,
} from '../zernio/client'
import { buildPlatformData, zernioMediaType } from '../zernio/platform-data'
import type { PostFormat } from '../format-vocabulary'

/**
 * The Zernio rail, for every channel it fronts.
 *
 * ── WHY ONE ADAPTER AND NOT FOUR ─────────────────────────────────────────────
 * Zernio's publish call is the same for x, gbp, linkedin and instagram: one POST
 * to /v1/posts naming a platform and an accountId. What differs between them is
 * held in `CONSTRAINTS` already — the character cap, whether media is mandatory,
 * how many items are allowed — and the Constraint Engine has validated all of it
 * before an adapter is ever reached. There is nothing per-channel left for four
 * separate adapters to do except repeat each other.
 *
 * The native x and gbp adapters are NOT retired. They speak to those platforms
 * with OUR OAuth grant and remain the right path for a workspace that holds one;
 * the store picks between them by looking at what the connection row actually is.
 * What changed is that the Zernio path now exists for them at all, which matters
 * because the native path has never published anything — `openSecret` is unwired,
 * so it ends at CONNECTION_UNAVAILABLE every time.
 *
 * ── THE TWO-PHASE RULE APPLIES TO ALL OF THEM ────────────────────────────────
 * Instagram's publish returns 201 with `status: processing` and no URL, and the
 * post goes live ~14s later (observed [LIVE] 2026-07-31). The other channels are
 * usually immediate — but "usually" is not a contract, and the polling loop costs
 * one extra read when the URL is already there. So every channel polls, and every
 * channel reports success on exactly one condition: a `platformPostUrl` came back.
 *
 * That is doc 13 §5's rule and it is the whole point of this file. A post is real
 * when there is a link to it on the internet. Not when the status field says
 * published, not when the HTTP code was 201.
 */

export interface ZernioAdapterDeps {
  client: ZernioClient
  /**
   * What kind of post this version says it is, from `post_variants.format`.
   *
   * Passed to the FACTORY rather than riding on the request, and that is forced
   * rather than chosen: `PublishRequest` lives in `@sahoda/shared`, a frozen
   * contract with no format field. `runPublishPost` builds one adapter per
   * publish and already holds the format, so the seam costs nothing.
   *
   * Null or absent means the version states no intent, and the payload is the
   * one this adapter has always sent.
   */
  format?: PostFormat | null
  /** Injected so a caller can bound total wall-clock; defaults suit a serverless job. */
  poll?: { attempts?: number; intervalMs?: number }
  sleep?: (ms: number) => Promise<void>
  now?: () => Date
}

const DEFAULT_ATTEMPTS = 12
const DEFAULT_INTERVAL_MS = 3000

/**
 * Zernio's platform name for one of our channels.
 *
 * Exported because the reconcile sweep must look for the SAME leg in a post it
 * reads back. Two copies of this map would diverge on the one entry that is not an
 * identity — gbp is `google` — and the sweep would silently find no leg and report
 * every GBP post as still pending forever.
 */
export const ZERNIO_PLATFORM_NAME: Record<Channel, string> = {
  x: 'x',
  gbp: 'google',
  linkedin: 'linkedin',
  instagram: 'instagram',
}

/**
 * The text that goes out, pulled from whichever field this channel's formatted
 * content uses. Exhaustive over the union, so a new channel is a compile error
 * here rather than an empty post.
 */
function bodyOf(content: FormattedContent): string {
  switch (content.channel) {
    case 'x':
      return content.text
    case 'linkedin':
      return content.text
    case 'gbp':
      return content.summary
    case 'instagram':
      return content.caption
  }
}

function accountIdOf(p: ZernioPlatformResult): string | undefined {
  const a = p.accountId
  if (typeof a === 'string') return a
  return a?._id
}

/**
 * The platform's own post id off a leg, or null.
 *
 * Two things are rejected, and the second is the one that bit us:
 *   - a missing id — the leg simply has not been given one yet;
 *   - an id in Zernio's OWN format (24-char hex). Real platform ids are not that
 *     shape — Instagram's is 17 decimal digits, X's is a decimal snowflake, GBP's is
 *     an `accounts/…/localPosts/…` path — so a 24-hex value here can only be a
 *     provider id that has leaked into a platform-id field, and storing it makes
 *     analytics return zeros forever with no way to notice.
 *
 * Belt and braces with the callers' own guard: this refuses to PRODUCE one,
 * `assertPlatformPostId` refuses to WRITE one.
 */
function platformIdOf(leg: ZernioPlatformResult | undefined): string | null {
  const id = leg?.platformPostId
  if (typeof id !== 'string' || id.length === 0) return null
  return ZERNIO_ID_RE.test(id) ? null : id
}

export function createZernioAdapter(channel: Channel, deps: ZernioAdapterDeps): PublishAdapter {
  const attempts = deps.poll?.attempts ?? DEFAULT_ATTEMPTS
  const intervalMs = deps.poll?.intervalMs ?? DEFAULT_INTERVAL_MS
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = deps.now ?? (() => new Date())
  const platform = ZERNIO_PLATFORM_NAME[channel]
  const spec = CONSTRAINTS[channel]

  const fail = (
    message: string,
    code: string,
    classification: 'transient' | 'permanent',
    raw?: unknown,
  ) => new AdapterError({ message, code, classification, channel, raw })

  const legOf = (post: ZernioPost | undefined): ZernioPlatformResult | undefined =>
    post?.platforms?.find((p) => p.platform === platform)

  /**
   * Poll until this channel's leg carries a URL, or fails, or we give up.
   *
   * ── WHY THE URL ALONE IS NOT THE EXIT CONDITION ──────────────────────────────
   * `platformPostUrl` and `platformPostId` are SIBLING fields on the same leg, and
   * Zernio does not promise to fill them together. This loop used to stop on the URL
   * and let the caller read the id off that same snapshot — so when the URL landed
   * first, it returned on the very first check and the id, which is the analytics
   * key, was read as absent and never asked for again. The result was a real,
   * live post whose Performance panel could never resolve, with nothing downstream
   * able to repair it: `listUnresolvedPublishes` only chases publishes that did NOT
   * succeed.
   *
   * So an absent id now buys exactly ONE more read. The URL still terminates the
   * loop — it is what makes the post a success — and the extra read is bounded by
   * the same attempt budget. A Zernio that never issues an id costs one extra GET
   * and still returns the URL; it must never turn a live post into STILL_PROCESSING.
   *
   * `platformIdOf` rather than a truthiness check, deliberately: a 24-hex provider id
   * is NOT an id for this purpose, so a leg carrying one is worth re-reading too.
   */
  const waitForUrl = async (initial: ZernioPost): Promise<ZernioPost> => {
    let current = initial
    let rereadForId = false
    for (let i = 0; i < attempts; i += 1) {
      const leg = legOf(current)
      if (leg?.platformPostUrl) {
        if (platformIdOf(leg) !== null || rereadForId) return current
        rereadForId = true
      } else if (leg?.status === 'failed') return current
      await sleep(intervalMs)
      try {
        current = await deps.client.getPost(current._id)
      } catch (err) {
        // A read failure mid-poll is not a publish failure — keep the last state
        // and let the loop decide. Never downgrade "unknown" to "failed".
        if (!(err instanceof ZernioError) || err.classification === 'permanent') throw err
      }
    }
    return current
  }

  return {
    channel,

    async publish(req: PublishRequest): Promise<PublishSuccess> {
      if (req.content.channel !== channel) {
        throw fail(
          `${channel} adapter received ${req.content.channel} content.`,
          'CHANNEL_MISMATCH',
          'permanent',
        )
      }

      const accountId = req.auth.externalAccountId
      if (!ZERNIO_ID_RE.test(accountId)) {
        // The account id must have come from a workspace-scoped lookup. A malformed
        // one means the caller assembled it rather than resolving it.
        throw fail(
          `${channel} on Zernio needs a 24-char account id.`,
          'INVALID_ACCOUNT_ID',
          'permanent',
        )
      }

      const media = req.content.media
      if (spec.requiresMedia === true && media.length === 0) {
        // Belt and braces with the Constraint Engine's MEDIA_REQUIRED. Reaching the
        // network to be told so wastes an attempt against a per-day cap.
        throw fail(
          `${channel} needs at least one photo — there is no text-only post.`,
          'MEDIA_REQUIRED',
          'permanent',
        )
      }
      if (media.length > spec.maxMediaCount) {
        throw fail(
          `${channel} allows ${spec.maxMediaCount} media items.`,
          'MAX_MEDIA_COUNT',
          'permanent',
        )
      }

      // `type` from the file's own mime, never the literal 'image'. That literal
      // was named in migration 20260819000200's header as the first thing that
      // had to change before a format picker could exist, and it is already wrong
      // today: X accepts image/gif and the engine allows it.
      const mediaItems: ZernioMediaItemInput[] = media.map((m) => ({
        type: zernioMediaType(m.mime),
        url: m.url,
        mimeType: m.mime,
        ...(m.altText ? { altText: m.altText } : {}),
      }))

      // ── THE PER-CHANNEL HALF OF THE PAYLOAD ──────────────────────────────────
      // Refuses rather than drops. A Google button with no destination is a
      // payload Zernio rejects, and dropping it silently would leave the writer
      // where they were before this existed: filling in a control that changes
      // nothing on the platform.
      const platformData = buildPlatformData({
        channel,
        format: deps.format ?? null,
        content: req.content,
      })
      if (!platformData.ok) {
        throw fail(platformData.refusal.message, platformData.refusal.code, 'permanent')
      }

      const entry: ZernioPlatformEntry = {
        platform,
        accountId,
        ...(platformData.data === undefined ? {} : { platformSpecificData: platformData.data }),
      }

      // From the caller, never assembled here — two workers racing on one post must
      // mint the SAME key. See publishIdempotencyKey.
      const requestId = req.idempotencyKey ?? `sahoda:${req.variantId}:${accountId}`

      let created
      try {
        created = await deps.client.createPost(
          {
            content: bodyOf(req.content),
            mediaItems,
            platforms: [entry],
            publishNow: true,
            timezone: 'UTC',
          },
          requestId,
        )
      } catch (err) {
        if (err instanceof ZernioError) {
          throw fail(err.message, err.code, err.classification, { status: err.status })
        }
        throw err
      }

      // A duplicate inside the idempotency window comes back as `existingPost` with
      // HTTP 200 — not an error. Unwrap it; the post it names is ours.
      const post = created.post ?? created.existingPost
      if (!post?._id) {
        throw fail(
          'Zernio accepted the post but returned no post id.',
          'NO_POST_ID',
          'transient',
          created.message,
        )
      }

      const settled = await waitForUrl(post)
      const leg = legOf(settled)
      const url = leg?.platformPostUrl ?? null

      if (!url) {
        const reason = leg?.error ?? leg?.errorMessage
        if (leg?.status === 'failed') {
          throw fail(
            reason ? `${channel} refused this post: ${reason}` : `${channel} refused this post.`,
            'PLATFORM_REJECTED',
            'permanent',
            leg,
          )
        }
        // Still processing when we ran out of patience. Transient by construction:
        // the post may yet go live, so a retry must not assume it did not. The
        // platform post id rides on `raw` so the reconcile sweep can ask later.
        throw fail(
          `${channel} is still processing this post — no live link yet.`,
          'STILL_PROCESSING',
          'transient',
          { postId: post._id, status: leg?.status },
        )
      }

      const boundAccount = leg ? accountIdOf(leg) : undefined
      if (boundAccount && boundAccount !== accountId) {
        // Zernio validates accountId against the whole TEAM, not the profile in the
        // request — a wrong id publishes successfully to another customer's account
        // and returns 200 (doc 13 §3). If the URL we are about to record came back
        // bound to a different account, say so loudly rather than storing it.
        throw fail(
          'Zernio published to a different account than the one requested.',
          'ACCOUNT_MISMATCH',
          'permanent',
          { requested: accountId, published: boundAccount },
        )
      }

      return {
        // NEVER `?? post._id`. That is Zernio's own id, and it used to be the fallback
        // here — which put a 24-hex Mongo id into post_variants.platform_post_id, the
        // column analytics keys off. Zernio answers HTTP 202 with every metric 0 for
        // that id, permanently, once the account is reconnected (observed [LIVE]
        // 2026-08-08 against the 31 July post). Null means "not known yet", which is
        // true and recoverable; a provider id here is silently and forever wrong.
        platformPostId: platformIdOf(leg),
        permalink: url,
        publishedAt: now().toISOString(),
        mode: 'live',
      }
    },
  }
}
