import {
  AdapterError,
  CONSTRAINTS,
  formatForPlatform,
  publishIdempotencyKey,
  validateVariant,
  type Channel,
  type PublishAdapter,
  type MediaRef,
  type PublishPostPayload,
  type PublishRequestMedia,
} from '@sahoda/shared'

/** Auth-class failures the user can only fix by reconnecting the account. */
const RECONNECT_CODES = new Set(['UNAUTHORIZED', 'FORBIDDEN'])

export type PublishMode = 'live' | 'fixture'

/** The post_variants row being published, plus its attachments. */
export interface PublishVariant {
  variantId: string
  body: string
  hashtags?: string[]
  hasLink?: boolean
  media: PublishRequestMedia[]
}

/** Connection identity + the in-memory-only access token. Never persisted from here. */
export interface ResolvedConnection {
  connectionId: string
  externalAccountId: string
  accessToken: string
}

/** One immutable post_publish_logs row. The table is append-only — insert once, terminally. */
export interface PublishLogEntry {
  workspaceId: string
  postId: string
  variantId: string
  connectionId: string | null
  channel: Channel
  attempt: number
  status: 'succeeded' | 'failed'
  mode: PublishMode
  platformPostId: string | null
  permalink: string | null
  error: PublishLogError | null
  jobRunId: string
  publishedAt: string | null
}

export interface PublishLogError {
  code: string
  classification: 'transient' | 'permanent'
  message: string
}

export interface VariantUpdate {
  workspaceId: string
  variantId: string
  publishStatus: 'published' | 'failed'
  platformPostId?: string | null
  permalink?: string | null
  lastError?: PublishLogError | null
}

export interface PublishPostDeps {
  /** Which rail this run is on. The adapter's own result still wins when it disagrees. */
  mode: PublishMode
  loadVariant(payload: PublishPostPayload): Promise<PublishVariant | null>
  resolveConnection(payload: PublishPostPayload): Promise<ResolvedConnection>
  adapterFor(channel: Channel): PublishAdapter
  /**
   * Turn `post_media` attachments into URLs the platform can fetch.
   *
   * Optional, and absent means `[]` — which is correct for every channel that takes
   * its bytes to the platform directly. It is NOT correct for instagram, which
   * receives a URL and nothing else; without this wired, `content.media` is empty and
   * the adapter refuses the post with MEDIA_REQUIRED.
   */
  hostMedia?(channel: Channel, media: PublishRequestMedia[]): Promise<MediaRef[]>
  writeLog(entry: PublishLogEntry): Promise<void>
  markVariant(update: VariantUpdate): Promise<void>
  /** Flip connections.status so the UI can raise a reconnect CTA. */
  markConnection?(connectionId: string, status: 'expired'): Promise<void>
  now?(): Date
}

/** Runner-supplied identity for this attempt (Trigger.dev ctx, or the fallback runner's). */
export interface PublishJobContext {
  attempt: number
  jobRunId: string
}

export type PublishOutcome =
  | { status: 'succeeded'; mode: PublishMode; platformPostId: string; permalink: string }
  | {
      status: 'failed'
      classification: 'permanent'
      code: string
      message: string
      reconnectRequired: boolean
    }

/**
 * The publishPost job core — deliberately free of any scheduler SDK so it is unit-testable
 * and so the sanctioned Vercel-cron + QStash fallback is a wrapper swap, not a rewrite.
 *
 * Control flow follows the AdapterError contract: a TRANSIENT failure is rethrown so the
 * durable runner retries it (adapters never retry — that is this job's responsibility), and
 * a PERMANENT failure returns terminally so the runner does not burn attempts on something
 * that cannot succeed. Either way a post_publish_logs row is written first: "nothing
 * publishes without a post_publish_logs row" (apps/jobs/CLAUDE.md) covers failed attempts
 * too, and because that table is append-only each attempt appends its own row rather than
 * updating one.
 *
 * `validateVariant` runs BEFORE the adapter on purpose — `formatForPlatform` performs no
 * checking and the fixture adapter accepts anything, so this is the only real gate.
 */
export async function runPublishPost(
  payload: PublishPostPayload,
  ctx: PublishJobContext,
  deps: PublishPostDeps,
): Promise<PublishOutcome> {
  const now = deps.now ?? (() => new Date())
  const spec = CONSTRAINTS[payload.channel]

  const fail = async (
    code: string,
    message: string,
    connectionId: string | null,
  ): Promise<PublishOutcome> => {
    const error: PublishLogError = { code, classification: 'permanent', message }
    await deps.writeLog(logRow(payload, ctx, deps.mode, 'failed', { error, connectionId }))
    await deps.markVariant({
      workspaceId: payload.workspaceId,
      variantId: payload.variantId,
      publishStatus: 'failed',
      lastError: error,
    })
    const reconnectRequired = RECONNECT_CODES.has(code)
    if (reconnectRequired && connectionId) await deps.markConnection?.(connectionId, 'expired')
    return { status: 'failed', classification: 'permanent', code, message, reconnectRequired }
  }

  if (!spec.publishable) {
    return fail(
      'CHANNEL_NOT_PUBLISHABLE',
      `${payload.channel} cannot be published in this release.`,
      null,
    )
  }

  const variant = await deps.loadVariant(payload)
  if (!variant) {
    return fail(
      'VARIANT_NOT_FOUND',
      `No ${payload.channel} variant for post ${payload.postId}.`,
      null,
    )
  }

  // The real gate. Must run before the adapter, which validates nothing.
  const { violations } = validateVariant(spec, {
    body: variant.body,
    hashtags: variant.hashtags,
    hasLink: variant.hasLink,
    mediaCount: variant.media.length,
  })
  if (violations.length > 0) {
    const first = violations[0]!
    return fail(first.code, first.message, null)
  }

  let connection: ResolvedConnection
  try {
    connection = await deps.resolveConnection(payload)
  } catch (e) {
    // No token ⇒ nothing was attempted. Still logged, and never presented as success.
    return fail('CONNECTION_UNAVAILABLE', messageOf(e), null)
  }

  try {
    // Hosting runs INSIDE the try, and after validateVariant, on purpose. Inside, so a
    // failed upload is classified and logged by the same path as a failed publish —
    // otherwise a permanently-unusable file would be retried forever. After, so we
    // never pay to upload the media of a variant the Constraint Engine has already
    // rejected.
    const hosted: MediaRef[] = deps.hostMedia
      ? await deps.hostMedia(payload.channel, variant.media)
      : []

    const request = {
      workspaceId: payload.workspaceId,
      postId: payload.postId,
      variantId: variant.variantId,
      content: formatForPlatform(
        spec,
        {
          body: variant.body,
          hashtags: variant.hashtags,
          hasLink: variant.hasLink,
          mediaCount: variant.media.length,
        },
        hosted,
      ),
      media: variant.media,
      auth: {
        connectionId: connection.connectionId,
        accessToken: connection.accessToken,
        externalAccountId: connection.externalAccountId,
      },
      // Built from the payload, never from a clock: every worker racing on this
      // post reads the same `scheduledAt` off the same row, so they all mint the
      // same key and the platform collapses them onto one post.
      idempotencyKey: publishIdempotencyKey(payload.postId, payload.channel, payload.scheduledAt),
    }

    const result = await deps.adapterFor(payload.channel).publish(request)

    // The adapter's own mode is authoritative: a fixture result is recorded as a fixture
    // even when this run believed it was live (CLAUDE.md honesty rule).
    await deps.writeLog(
      logRow(payload, ctx, result.mode, 'succeeded', {
        connectionId: connection.connectionId,
        platformPostId: result.platformPostId,
        permalink: result.permalink,
        publishedAt: result.publishedAt,
      }),
    )
    await deps.markVariant({
      workspaceId: payload.workspaceId,
      variantId: payload.variantId,
      publishStatus: 'published',
      platformPostId: result.platformPostId,
      permalink: result.permalink,
      lastError: null,
    })
    return {
      status: 'succeeded',
      mode: result.mode,
      platformPostId: result.platformPostId,
      permalink: result.permalink,
    }
  } catch (e) {
    const adapterError = e instanceof AdapterError ? e : null
    const classification = adapterError?.classification ?? 'transient'
    const code = adapterError?.code ?? 'ADAPTER_ERROR'
    const error: PublishLogError = { code, classification, message: messageOf(e) }

    // `raw` is deliberately dropped — it is adapter-controlled and may echo request
    // material — with ONE exception, pulled out by shape rather than passed through.
    //
    // When Instagram is still in its container flow the adapter gives up with
    // STILL_PROCESSING, and the post may yet go live. Without the platform's id for
    // it, nobody can ever ask how it ended: the variant sits unresolved and the
    // customer's feed and our record disagree forever. Recording the id is what
    // makes that recoverable, and an id is not free-text — it is validated below.
    const platformPostId = platformPostIdFrom(adapterError)

    await deps.writeLog(
      logRow(payload, ctx, deps.mode, 'failed', {
        error,
        connectionId: connection.connectionId,
        ...(platformPostId ? { platformPostId } : {}),
      }),
    )

    if (classification === 'transient') {
      // Leave the variant mid-flight — a retry is coming, so it is not terminally failed.
      throw e
    }

    await deps.markVariant({
      workspaceId: payload.workspaceId,
      variantId: payload.variantId,
      publishStatus: 'failed',
      lastError: error,
    })
    const reconnectRequired = RECONNECT_CODES.has(code)
    if (reconnectRequired) await deps.markConnection?.(connection.connectionId, 'expired')
    return {
      status: 'failed',
      classification: 'permanent',
      code,
      message: error.message,
      reconnectRequired,
    }
  }

  function logRow(
    p: PublishPostPayload,
    c: PublishJobContext,
    mode: PublishMode,
    status: 'succeeded' | 'failed',
    extra: {
      connectionId: string | null
      error?: PublishLogError
      platformPostId?: string
      permalink?: string
      publishedAt?: string
    },
  ): PublishLogEntry {
    return {
      workspaceId: p.workspaceId,
      postId: p.postId,
      variantId: p.variantId,
      connectionId: extra.connectionId,
      channel: p.channel,
      attempt: c.attempt,
      status,
      mode,
      platformPostId: extra.platformPostId ?? null,
      permalink: extra.permalink ?? null,
      error: extra.error ?? null,
      jobRunId: c.jobRunId,
      publishedAt: status === 'succeeded' ? (extra.publishedAt ?? now().toISOString()) : null,
    }
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Zernio ids are 24-char lowercase hex. Anything else is not an id and is dropped. */
const PLATFORM_ID_RE = /^[0-9a-f]{24}$/

/**
 * The platform's own id for a post that was accepted but has not finished.
 *
 * Read off `AdapterError.raw` by SHAPE — a string field named postId that matches
 * the id format — never by trusting the object. `raw` is adapter-controlled, so
 * everything else in it stays dropped.
 */
function platformPostIdFrom(error: AdapterError | null): string | null {
  if (!error || typeof error.raw !== 'object' || error.raw === null) return null
  const value = (error.raw as Record<string, unknown>).postId
  return typeof value === 'string' && PLATFORM_ID_RE.test(value) ? value : null
}
