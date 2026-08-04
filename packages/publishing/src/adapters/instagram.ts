import {
  AdapterError,
  type PublishAdapter,
  type PublishRequest,
  type PublishSuccess,
} from '@sahoda/shared'

import {
  ZernioError,
  ZERNIO_ID_RE,
  type ZernioClient,
  type ZernioMediaItemInput,
  type ZernioPlatformResult,
  type ZernioPost,
} from '../zernio/client'

/**
 * Instagram, via the Zernio rail.
 *
 * ── WHY THIS ADAPTER POLLS ────────────────────────────────────────────────────
 * Instagram publishing is TWO-PHASE and Zernio returns before it finishes. Observed
 * [LIVE] on 2026-07-31, publishing the first real post through this integration:
 *
 *   HTTP 201
 *   { "message": "Post published successfully",
 *     "post": { "status": "publishing",
 *               "platforms": [{ "status": "processing",
 *                               "platformSpecificData": { "lastPublishStage": "awaiting-finalize",
 *                                                         "pendingContainerId": "…" } }] } }
 *
 * No platformPostId. No platformPostUrl. The post went live ~14 seconds later.
 *
 * Their own OpenAPI spec says "Immediate posts (publishNow: true) include
 * platformPostUrl in the response". For Instagram that is **false**. The spec is
 * wrong; the observation is right.
 *
 * ── THE ONE RULE ──────────────────────────────────────────────────────────────
 * Doc 13 §5: `.is-real` keys off the PRESENCE OF platformPostUrl, never off which
 * code path ran. This adapter is where that rule is enforced or lost: an adapter
 * that maps `201 → published` would mark posts real while they sit in a container
 * flow, and would never learn whether they failed at finalize. So success here means
 * exactly one thing — a URL came back. A post is real if there is a link to it on
 * the internet.
 *
 * Note also `lastPublishStage` stays `awaiting-finalize` on a post that IS published.
 * It is a stale breadcrumb, not a state machine. Do not build on it.
 */

export interface InstagramAdapterDeps {
  client: ZernioClient
  /** Injected so a caller can bound total wall-clock; defaults suit a serverless job. */
  poll?: { attempts?: number; intervalMs?: number }
  sleep?: (ms: number) => Promise<void>
  now?: () => Date
}

const DEFAULT_ATTEMPTS = 12
const DEFAULT_INTERVAL_MS = 3000

const fail = (
  message: string,
  code: string,
  classification: 'transient' | 'permanent',
  raw?: unknown,
) => new AdapterError({ message, code, classification, channel: 'instagram', raw })

/** Zernio nests accountId as an object on reads and a string on writes. */
function accountIdOf(p: ZernioPlatformResult): string | undefined {
  const a = p.accountId
  if (typeof a === 'string') return a
  return a?._id
}

function instagramLeg(post: ZernioPost | undefined): ZernioPlatformResult | undefined {
  return post?.platforms?.find((p) => p.platform === 'instagram')
}

export function createInstagramAdapter(deps: InstagramAdapterDeps): PublishAdapter {
  const attempts = deps.poll?.attempts ?? DEFAULT_ATTEMPTS
  const intervalMs = deps.poll?.intervalMs ?? DEFAULT_INTERVAL_MS
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = deps.now ?? (() => new Date())

  /**
   * Poll until the Instagram leg carries a platformPostUrl, or fails, or we give up.
   * Returns the last state seen — never invents one.
   */
  const waitForUrl = async (initial: ZernioPost): Promise<ZernioPost> => {
    let current = initial
    for (let i = 0; i < attempts; i += 1) {
      const leg = instagramLeg(current)
      if (leg?.platformPostUrl) return current
      if (leg?.status === 'failed') return current
      await sleep(intervalMs)
      try {
        current = await deps.client.getPost(current._id)
      } catch (err) {
        // A read failure mid-poll is not a publish failure — keep the last state and
        // let the loop decide. Never downgrade "unknown" to "failed".
        if (!(err instanceof ZernioError) || err.classification === 'permanent') throw err
      }
    }
    return current
  }

  return {
    channel: 'instagram',

    async publish(req: PublishRequest): Promise<PublishSuccess> {
      if (req.content.channel !== 'instagram') {
        throw fail(
          `instagram adapter received ${req.content.channel} content.`,
          'CHANNEL_MISMATCH',
          'permanent',
        )
      }

      const accountId = req.auth.externalAccountId
      if (!ZERNIO_ID_RE.test(accountId)) {
        // The account id must have come from a workspace-scoped lookup. A malformed
        // one means the caller assembled it rather than resolving it.
        throw fail(
          'instagram adapter needs a 24-char Zernio account id.',
          'INVALID_ACCOUNT_ID',
          'permanent',
        )
      }

      const media = req.content.media
      if (media.length === 0) {
        // Belt and braces with the Constraint Engine's MEDIA_REQUIRED: there is no
        // text-only Instagram post, and reaching the network to be told so wastes a
        // publish attempt against a 100/24h cap.
        throw fail(
          'Instagram needs at least one photo — there is no text-only post.',
          'MEDIA_REQUIRED',
          'permanent',
        )
      }

      const mediaItems: ZernioMediaItemInput[] = media.map((m) => ({
        type: 'image',
        url: m.url,
        mimeType: m.mime,
        ...(m.altText ? { altText: m.altText } : {}),
      }))

      // ── THE KEY COMES FROM THE CALLER, NOT FROM HERE ────────────────────────
      // It used to be `sahoda:{variantId}:{accountId}`, derived locally. That is
      // stable, but it is stable in the WRONG dimension: it never changes, so a
      // post rescheduled to next Tuesday collapses onto the Zernio post from last
      // Tuesday and the new publish comes back as `existingPost` with the old URL.
      //
      // `publishIdempotencyKey(postId, channel, scheduledAt)` is the one definition
      // (shared/jobs/payloads.ts), and the scheduled instant is written once on the
      // row so every racing worker reads the same value. Same post, same minute →
      // same key → one Instagram post. Rescheduled → new key → a real new post.
      //
      // The fallback keeps the old shape rather than inventing a fresh id: a caller
      // that forgot the key must still de-duplicate its own retries.
      const requestId = req.idempotencyKey ?? `sahoda:${req.variantId}:${accountId}`

      let created
      try {
        created = await deps.client.createPost(
          {
            content: req.content.caption,
            mediaItems,
            platforms: [{ platform: 'instagram', accountId }],
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
      // HTTP 200 — not an error. Unwrap it and carry on; the post it names is ours.
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
      const leg = instagramLeg(settled)
      const url = leg?.platformPostUrl ?? null

      if (!url) {
        const reason = leg?.error ?? leg?.errorMessage
        if (leg?.status === 'failed') {
          throw fail(
            reason ? `Instagram refused this post: ${reason}` : 'Instagram refused this post.',
            'PLATFORM_REJECTED',
            'permanent',
            leg,
          )
        }
        // Still processing when we ran out of patience. Transient by construction:
        // the post may yet go live, so a retry must not assume it did not.
        throw fail(
          'Instagram is still processing this post — no live link yet.',
          'STILL_PROCESSING',
          'transient',
          { postId: post._id, status: leg?.status },
        )
      }

      const boundAccount = accountIdOf(leg!)
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
        platformPostId: leg!.platformPostId ?? post._id,
        permalink: url,
        publishedAt: now().toISOString(),
        mode: 'live',
      }
    },
  }
}
