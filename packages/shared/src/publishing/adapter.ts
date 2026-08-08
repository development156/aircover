import type { Channel } from '../enums'
import type { FormattedContent } from './constraints'

/** Decrypted OAuth material, in-memory only — never logged or persisted from here. */
export interface ConnectionAuth {
  connectionId: string
  accessToken: string
  /** Platform-native full resource id (GBP: `accounts/{a}/locations/{l}`; X: numeric user id). */
  externalAccountId: string
}

export interface PublishRequestMedia {
  storagePath: string
  mime: string
  bytes: number
}

export interface PublishRequest {
  workspaceId: string
  postId: string
  variantId: string
  content: FormattedContent
  media: PublishRequestMedia[]
  auth: ConnectionAuth
  /**
   * The de-duplication key for this publish, from `publishIdempotencyKey`.
   *
   * Supplied by the caller rather than derived inside an adapter, and that is the
   * whole point: two workers racing on the same scheduled post must mint the SAME
   * key, so it has to come from facts they share — the post, the channel and the
   * scheduled instant — never from an adapter's local view or a clock.
   *
   * Optional so an adapter that has no such concept ignores it; an adapter that
   * does have one (Zernio's `x-request-id`, 5-minute window) must prefer it over
   * anything it could assemble itself.
   */
  idempotencyKey?: string
}

export interface PublishSuccess {
  /**
   * The PLATFORM's own id for this post — Instagram's media id, X's tweet id, GBP's
   * localPosts path. Null when the platform has not given us one yet.
   *
   * Nullable on purpose. It used to be `string`, which forced an adapter with no
   * platform id to substitute something, and the Zernio adapter substituted Zernio's
   * own 24-hex `_id`. That id is not a platform id: Zernio's analytics answer HTTP 202
   * with every metric 0 for it, permanently, once the account is reconnected. A wrong
   * id is worse than no id, because nothing downstream can tell it is wrong.
   *
   * Never put a provider's internal id here. The reconcile handle lives on
   * `post_publish_logs.platform_post_id` and is written from `AdapterError.raw`.
   */
  platformPostId: string | null
  permalink: string
  publishedAt: string // ISO-8601
  /** Fixture results are always labelled — never presented as real success. */
  mode: 'live' | 'fixture'
}

/**
 * A provider's own object id — Zernio's `_id` is 24 lowercase hex characters.
 *
 * Deliberately NOT exported as a general "id" matcher. It exists to be refused.
 */
const PROVIDER_OBJECT_ID_RE = /^[0-9a-f]{24}$/

/**
 * The chokepoint in front of `post_variants.platform_post_id`.
 *
 * Every write to that column goes through here. It throws rather than coercing,
 * because a provider id reaching this point means a caller believed it had a platform
 * id and did not — silently storing null would hide the bug that produced it, and
 * silently storing the value is the bug we are closing.
 *
 * Note this guards the ANALYTICS key only. `post_publish_logs.platform_post_id` is a
 * different column in a different table and legitimately holds Zernio's `_id` — it is
 * the handle the reconcile sweep passes to `GET /posts/{id}`. Do not call this on it.
 */
export function assertPlatformPostId(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  if (PROVIDER_OBJECT_ID_RE.test(value)) {
    throw new Error(
      `platform_post_id refused: "${value}" is a 24-hex provider object id, not a platform post id. ` +
        'Store null instead — see PublishSuccess.platformPostId.',
    )
  }
  return value
}

export type AdapterErrorClassification = 'transient' | 'permanent'

/** Thrown by an adapter; classification drives retry (transient) vs reconnect CTA (permanent). */
export class AdapterError extends Error {
  readonly code: string
  readonly classification: AdapterErrorClassification
  readonly channel: Channel
  readonly raw?: unknown

  constructor(args: {
    message: string
    code: string
    classification: AdapterErrorClassification
    channel: Channel
    raw?: unknown
  }) {
    super(args.message)
    this.name = 'AdapterError'
    this.code = args.code
    this.classification = args.classification
    this.channel = args.channel
    this.raw = args.raw
  }
}

/**
 * The single contract every publish adapter satisfies — X, GBP, LinkedIn, and the
 * fixture adapter all implement exactly this.
 */
export interface PublishAdapter {
  readonly channel: Channel
  publish(req: PublishRequest): Promise<PublishSuccess>
  fetchMetrics?(conn: ConnectionAuth, since: Date): Promise<unknown>
}
