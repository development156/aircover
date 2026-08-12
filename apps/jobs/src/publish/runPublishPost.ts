import {
  AdapterError,
  CONSTRAINTS,
  GATE_BLOCKED_CODE,
  GATE_HELD_CODE,
  formatForPlatform,
  gateHoldIsTransient,
  publishIdempotencyKey,
  publishedTextOf,
  validateVariant,
  type Channel,
  type GateVerdict,
  type PublishAdapter,
  type PublishGate,
  type MediaRef,
  type PublishPostPayload,
  type PublishRequestMedia,
  type RuleTier,
} from '@sahoda/shared'

/**
 * The refusal gate could not be reached — so nothing about this post is in
 * question, and a retry is the correct next move.
 *
 * Thrown rather than returned, because "transient" in this file MEANS thrown:
 * `runClaimedPublish` catches it, hands the claim back, and the next tick picks
 * the variant up. Returning a permanent failure instead would let one provider
 * outage mark every post scheduled inside it as failed, needing a person to
 * press Publish on each by hand.
 */
export class GateUnavailableError extends Error {
  constructor(reason: string) {
    super(`refusal gate unavailable: ${reason}`)
    this.name = 'GateUnavailableError'
  }
}

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
  /**
   * Whether this connection publishes through Zernio rather than an OAuth grant of
   * ours. Decided by the row, so it must travel WITH the resolved connection —
   * the channel alone cannot answer it for x, gbp or linkedin.
   *
   * REQUIRED, and it must stay required. It was optional until 2026-08-09, which meant
   * a `return` that simply forgot it still typechecked: both branches of
   * `createConnectionResolver` built a fresh three-field literal, the field vanished,
   * and `connection.viaZernio === true` below read `undefined` as `false`. Every live
   * Instagram publish then died at NO_ADAPTER holding a perfectly good connection.
   * Optional is what let the value go missing without anyone being asked.
   */
  viaZernio: boolean
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
  /**
   * The refusal gate's verdict, when the gate is what refused.
   *
   * Carried as STRUCTURE rather than prose in `message`, and the reason is
   * requirement 3: the refusal has to name the line it trips, say whether it is
   * inherited or theirs, and offer a compliant rewrite. A sentence cannot be
   * rendered as a rule chip with a one-click fix, and `describePublishError` in
   * apps/web is an allowlist that deliberately never echoes a stored message —
   * so prose here would arrive on screen as the generic "something went wrong".
   *
   * `post_publish_logs.error` and `post_variants.last_error` are both jsonb and
   * both already carry this object whole, so the audit half of doc 18 §8 rides
   * along on the existing write with no migration.
   */
  gate?: GateErrorDetail
}

/** The refusal, in the shape apps/web renders it. Nothing here is model prose. */
export interface GateErrorDetail {
  decision: 'block' | 'hold'
  ruleSetVersion: string
  brandVersion: number | null
  /** How the regime was arrived at — never flattened into a claim it was declared. */
  regime: { value: string; basis: 'declared' | 'derived' | 'default' }
  findings: {
    ruleId: string
    /** `mandated` reads as inherited; `owner` reads as theirs. */
    tier: RuleTier
    statement: string
    quote?: string
    rewrite?: string
  }[]
  holdReason?: string
}

/** `GateVerdict` → the slice that travels on an error row. */
function gateDetail(verdict: GateVerdict): GateErrorDetail {
  return {
    decision: verdict.decision === 'block' ? 'block' : 'hold',
    ruleSetVersion: verdict.ruleSet.ruleSetVersion,
    brandVersion: verdict.brandVersion,
    regime: { value: verdict.ruleSet.regime.value, basis: verdict.ruleSet.regime.basis },
    findings: verdict.findings.map((f) => ({
      ruleId: f.ruleId,
      tier: f.tier,
      statement: f.statement,
      ...(f.quote ? { quote: f.quote } : {}),
      ...(f.rewrite ? { rewrite: f.rewrite } : {}),
    })),
    ...(verdict.holdReason ? { holdReason: verdict.holdReason } : {}),
  }
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
  /**
   * The refusal gate (doc 18 §8). REQUIRED, AND IT MUST STAY REQUIRED.
   *
   * `viaZernio` on `ResolvedConnection` is the cautionary tale, forty lines up in
   * this same file: it was optional, a `return` that simply forgot it still
   * typechecked, and every live Instagram publish then died holding a perfectly
   * good connection. "Optional is what let the value go missing without anyone
   * being asked."
   *
   * The same shape here fails in the opposite and worse direction. An optional
   * `gate?` is a gate that silently does not run in whichever call site forgets
   * it — and a publish path with no gate does not look broken, it looks fast.
   * Required means every deps-constructing site in the repo fails to COMPILE
   * until it supplies one, which is the only form of proof that no publish path
   * skipped the check.
   */
  gate: PublishGate
  loadVariant(payload: PublishPostPayload): Promise<PublishVariant | null>
  resolveConnection(payload: PublishPostPayload): Promise<ResolvedConnection>
  adapterFor(channel: Channel, viaZernio: boolean): PublishAdapter
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
  | {
      status: 'succeeded'
      mode: PublishMode
      /** Null when the platform has not issued an id yet. A real success still has a permalink. */
      platformPostId: string | null
      permalink: string
    }
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
    gate?: GateErrorDetail,
  ): Promise<PublishOutcome> => {
    const error: PublishLogError = {
      code,
      classification: 'permanent',
      message,
      ...(gate ? { gate } : {}),
    }
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

  // Hoisted: the Constraint Engine, the refusal gate and the adapter request all
  // describe the SAME draft, and three literals would be three chances for them
  // to drift — which is how the composer's hashtag count and the publisher's
  // once disagreed for weeks.
  const draft = {
    body: variant.body,
    hashtags: variant.hashtags,
    hasLink: variant.hasLink,
    mediaCount: variant.media.length,
  }

  // The channel's own limits. Must run before the adapter, which validates nothing.
  const { violations } = validateVariant(spec, draft)
  if (violations.length > 0) {
    const first = violations[0]!
    return fail(first.code, first.message, null)
  }

  // ── THE REFUSAL GATE (doc 18 §8) ────────────────────────────────────────────
  // A CONDITION OF PUBLISHING, NOT A PREFLIGHT. It sits on the one function all
  // four entries into publishing pass through — the publish-now route, the cron
  // sweep, the Trigger.dev task and the bare `@sahoda/jobs/publish` export — so
  // there is no rail that reaches an adapter around it.
  //
  // ── WHY EXACTLY HERE, AND NOT A LINE EITHER SIDE ────────────────────────────
  //  · AFTER `validateVariant`, so the words checked are words that could
  //    actually be published. Gating a 600-character X post that the engine is
  //    about to refuse spends a model call to refuse it twice.
  //  · BEFORE `resolveConnection`, for the reason this file already gives about
  //    `hostMedia` ("so we never pay to upload the media of a variant the
  //    Constraint Engine has already rejected"), one step earlier: a post that
  //    is not going out has no business causing a token to be decrypted.
  //
  // `publishedTextOf` rather than `variant.body`: `formatForPlatform` appends the
  // hashtag tail, and a red line written into a hashtag is still on the post.
  // Media is deliberately omitted from this call — it changes `content.media`
  // and never the text, and the real request re-formats with the hosted URLs.
  const verdict = await deps.gate.check({
    workspaceId: payload.workspaceId,
    postId: payload.postId,
    variantId: variant.variantId,
    channel: payload.channel,
    text: publishedTextOf(formatForPlatform(spec, draft)),
    jobRunId: ctx.jobRunId,
  })

  if (verdict.decision !== 'pass') {
    // ── AN UNREACHABLE CHECK IS NOT A VERDICT ABOUT THE POST ─────────────────
    // It still does not publish. But it is recorded as TRANSIENT and rethrown so
    // the claim comes back and the next tick tries again, because the
    // alternative is that a five-minute provider outage permanently fails every
    // post scheduled inside it. The post is not stranded either way: the
    // dispatcher's grace window expires it if the outage outlasts it.
    if (gateHoldIsTransient(verdict)) {
      const error: PublishLogError = {
        code: GATE_HELD_CODE,
        classification: 'transient',
        message: gateMessage(verdict),
        gate: gateDetail(verdict),
      }
      await deps.writeLog(logRow(payload, ctx, deps.mode, 'failed', { error, connectionId: null }))
      // The variant is deliberately NOT marked — the attempt is not over, and
      // this is the same shape as the adapter's own transient path below.
      throw new GateUnavailableError(verdict.holdReason ?? 'the check could not run')
    }

    // BOTH remaining refusals land as `failed`, and the distinction lives in the CODE.
    //
    // `failed` rather than `skipped` on purpose, and it is not a cosmetic choice:
    // `skipped` is absent from `claimVariant`'s status predicate, so a held
    // variant could never be claimed again — the writer would fix the wording,
    // press Publish, and get a 409 reading "This post is already going out"
    // about a post that never could. `failed` IS claimable, so rewrite-and-retry
    // works, and `classifyCandidate` never re-dispatches it (PENDING_STATES is
    // `pending|scheduled`), so the cron cannot loop on it either.
    const code = verdict.decision === 'block' ? GATE_BLOCKED_CODE : GATE_HELD_CODE
    return fail(code, gateMessage(verdict), null, gateDetail(verdict))
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
      content: formatForPlatform(spec, draft, hosted),
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

    const result = await deps
      .adapterFor(payload.channel, connection.viaZernio === true)
      .publish(request)

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
    const providerPostId = providerPostIdFrom(adapterError)

    await deps.writeLog(
      logRow(payload, ctx, deps.mode, 'failed', {
        error,
        connectionId: connection.connectionId,
        // Zernio's id, into the LOG column only — that is what makes an unresolved
        // publish findable later. It never reaches post_variants.
        ...(providerPostId ? { platformPostId: providerPostId } : {}),
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
      /**
       * Whatever id we have for the LOG row. On success that is the platform's id (or
       * null); on the STILL_PROCESSING path it is Zernio's `_id`, deliberately, so the
       * reconcile sweep can address the post. This column tolerates both — the one that
       * does not is post_variants.platform_post_id.
       */
      platformPostId?: string | null
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

/**
 * One line for the log row, and it is deliberately thin.
 *
 * The refusal a person reads is built in apps/web from `error.gate`, which
 * carries the rule, the tier and the rewrite as structure. This string exists so
 * that a log tail is not blank; putting the full refusal here instead would give
 * two places for the same words to live and one of them would go stale.
 */
function gateMessage(verdict: GateVerdict): string {
  if (verdict.decision === 'hold') {
    return verdict.holdReason ?? 'Held for review before publishing.'
  }
  const first = verdict.findings[0]
  const tier = first?.tier === 'mandated' ? 'a required rule' : 'one of your own rules'
  return first
    ? `Stopped before publishing: this breaks ${tier}.`
    : 'Stopped before publishing: a rule was broken.'
}

/** ZERNIO's own post ids are 24-char lowercase hex. Anything else is dropped. */
const ZERNIO_POST_ID_RE = /^[0-9a-f]{24}$/

/**
 * ZERNIO's id for a post that was accepted but has not finished — the reconcile handle.
 *
 * ── READ THE NAME CAREFULLY ──────────────────────────────────────────────────
 * This is NOT a platform post id, and it was called `platformPostIdFrom` until the
 * distinction cost us an afternoon. It is the id the reconcile sweep passes to Zernio's
 * `GET /posts/{id}` to ask how the post ended, and it is written only to
 * `post_publish_logs.platform_post_id` — a log column, deliberately kept addressable.
 *
 * It must never reach `post_variants.platform_post_id`, which is the analytics key.
 * `assertPlatformPostId` enforces that at the write site.
 *
 * Read off `AdapterError.raw` by SHAPE — a string field named postId matching Zernio's
 * id format — never by trusting the object. `raw` is adapter-controlled, so everything
 * else in it stays dropped.
 */
function providerPostIdFrom(error: AdapterError | null): string | null {
  if (!error || typeof error.raw !== 'object' || error.raw === null) return null
  const value = (error.raw as Record<string, unknown>).postId
  return typeof value === 'string' && ZERNIO_POST_ID_RE.test(value) ? value : null
}
