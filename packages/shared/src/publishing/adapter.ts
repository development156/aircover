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
  platformPostId: string
  permalink: string
  publishedAt: string // ISO-8601
  /** Fixture results are always labelled — never presented as real success. */
  mode: 'live' | 'fixture'
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
