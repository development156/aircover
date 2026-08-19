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
import {
  X_RATION_EXHAUSTED_CODE,
  X_RATION_UNREADABLE_CODE,
  checkXRation,
  refuseFormat,
  xRationRefusalMessage,
  xRationWindowStart,
  type PostFormat,
} from '@sahoda/publishing'
import type { PublishMode } from './mode'

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

export type { PublishMode } from './mode'

/** The post_variants row being published, plus its attachments. */
export interface PublishVariant {
  variantId: string
  body: string
  hashtags?: string[]
  hasLink?: boolean
  media: PublishRequestMedia[]
  /**
   * What kind of post this was written as, from `post_variants.format`.
   *
   * Null for every variant written before migration 20260819000200, which is most
   * of them, and null states no intent — so nothing is held to anything and no
   * existing post changes behaviour.
   *
   * Carried on THIS type rather than on `PublishRequest`, and that is not a
   * preference: `PublishRequest` and `FormattedContent` are in @sahoda/shared,
   * which is a frozen contract with no format field. The refusal therefore sits
   * one layer above the adapter — see the guard in `runPublishPost`.
   */
  format?: PostFormat | null
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
  /**
   * Live, succeeded sends for one workspace on one channel since an instant.
   *
   * REQUIRED, for exactly the reason stated above about `gate`. An optional
   * counter is a spending cap that silently does not run in whichever call site
   * forgets it — and a publish path with no cap does not look broken, it looks
   * generous. Required means every deps-constructing site fails to COMPILE until
   * it supplies one.
   */
  countLiveSends(args: { workspaceId: string; channel: Channel; since: Date }): Promise<number>
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

  // ── THE POST IS NOT WHAT IT SAYS IT IS ──────────────────────────────────────
  // A format is a DECLARATION OF INTENT, and this is the only place in the pipeline
  // that can check the post against it. `validateVariant` above checks the media
  // against the CHANNEL and finds an image perfectly legal on X; only the declared
  // format knows the writer did not mean to send one. The mirror case matters more:
  // a photo post with no photo publishes today as bare text on x, gbp and linkedin
  // and reports success.
  //
  // ── WHY HERE AND NOT INSIDE THE ADAPTER ─────────────────────────────────────
  // The adapter's own guards would be the natural home, beside MEDIA_REQUIRED. It
  // cannot go there: an adapter is handed a `PublishRequest` carrying a
  // `FormattedContent`, both of which live in @sahoda/shared — a frozen contract
  // with no format field and no arm that could carry one. Reaching the adapter
  // would mean changing that contract. So the refusal sits one layer up, on the
  // one function every entry into publishing passes through, which is the same
  // property that makes the gate below trustworthy.
  //
  // Placed AFTER `validateVariant` for its stated reason — the words and the media
  // checked here are ones that could actually be published — and BEFORE the gate,
  // so a post that is already refused never spends a model call.
  //
  // PERMANENT, not transient: no retry makes an absent image appear. It is the
  // writer's to fix, and the message says what they wrote versus what is attached.
  const formatRefusal = refuseFormat(spec, variant.format, variant.media.length)
  if (formatRefusal) {
    return fail(formatRefusal.code, formatRefusal.message, null)
  }

  // ── THE X RATION — REFUSED BEFORE ANYTHING IS SPENT ─────────────────────────
  // X is the only channel that bills per POST: $0.015, and $0.200 when the post
  // carries a link — 13.3x — quoted from https://docs.x.com/x-api/getting-started/pricing
  // on 2026-08-19. Every other channel costs a flat per-account fee, so one more
  // post is free at the margin; on X it is not.
  //
  // ── WHY EXACTLY HERE ────────────────────────────────────────────────────────
  // Three spends sit between this line and the platform, and this refusal is
  // upstream of all of them:
  //   · the GATE below, which runs a model call,
  //   · `resolveConnection`, which decrypts a token,
  //   · the ADAPTER, which is the $0.20 itself.
  // "Refuse before spending, never after" is only true if it is refused before the
  // FIRST of those, not merely before the last. It sits after `validateVariant`
  // and `refuseFormat` for the reason those two give: a post that could never be
  // published should not consume an allowance on its way to being rejected.
  //
  // The allowance is counted in POSTS, so it needs no price and quotes none —
  // see `checkXRation`. What a given post would have cost depends on whether it
  // carries a link, and `PublishVariant.hasLink` is optional, so that is a figure
  // this path frequently could not state truthfully.
  if (payload.channel === 'x') {
    let used: number
    try {
      used = await deps.countLiveSends({
        workspaceId: payload.workspaceId,
        channel: 'x',
        since: xRationWindowStart(now()),
      })
    } catch {
      // ── AN UNREADABLE CAP IS NOT AN EXHAUSTED ONE, AND NOT A PASS ───────────
      // Two wrong answers are available here and both ship silently. Treating the
      // failure as "0 used" spends real money off a failed read. Treating it as
      // "exhausted" tells a customer they are out of posts when the truth is we
      // could not count — a fabricated reason, and PERMANENT, so the post dies.
      //
      // So: refuse, TRANSIENTLY, in its own code. Nothing is sent, nothing is
      // claimed about the allowance, and the next tick counts again.
      const error: PublishLogError = {
        code: X_RATION_UNREADABLE_CODE,
        classification: 'transient',
        message: 'The X post allowance could not be read, so nothing was sent.',
      }
      await deps.writeLog(logRow(payload, ctx, deps.mode, 'failed', { error, connectionId: null }))
      throw new Error('x ration unreadable')
    }

    const ration = checkXRation({ used })
    if (!ration.allowed) {
      // PERMANENT: no retry inside this month makes the allowance reappear, and a
      // transient classification would have the runner burn its attempts on it.
      return fail(X_RATION_EXHAUSTED_CODE, xRationRefusalMessage(ration), null)
    }
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
    //
    // ── A TENANT REFUSAL IS NOT AN OUTAGE, AND USED TO BE FILED AS ONE ────────
    // The pre-flight assertion lives in the DATABASE — `assert_account_for_scheduled_post`,
    // which re-derives the workspace FROM THE POST and refuses unless an active
    // connection on the same channel, in that workspace, under that workspace's
    // Zernio profile, owns the account id. It refuses by RAISING, so it arrives
    // here as a thrown error, and everything thrown here was recorded as
    // `CONNECTION_UNAVAILABLE`.
    //
    // That flattening is the audit defect. A deliberate attempt to publish one
    // customer's post through another customer's account looked, in
    // `post_publish_logs`, exactly like the token vault being briefly unreachable —
    // so the one event anybody would want to find after the fact was the one event
    // no filter could distinguish. MEASURED 2026-08-19 against production: zero rows
    // in that table carry a cross-tenant code, and the refusal has always been
    // logged under the outage code.
    //
    // The codes below are RAISED BY NAME in the applied migrations
    // (20260801000004, 20260801000005), so they are matched exactly rather than
    // sniffed for. Anything else keeps the old code, because an error this file
    // does not recognise is not one it may re-label.
    return fail(preflightCodeOf(e) ?? 'CONNECTION_UNAVAILABLE', messageOf(e), null)
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

/**
 * The pre-flight refusals the database raises BY NAME, or null for anything else.
 *
 * Every one of these is a `raise exception '<CODE>'` in an applied migration, so the
 * set is closed and the match is exact. A substring sniff would re-label a message
 * that merely mentioned one — and a wrongly-labelled audit row is worse than a
 * coarse one, because it invites a search that finds the wrong thing.
 *
 * `CROSS_TENANT_ACCOUNT` is the one that matters: it means a publish was attempted
 * with an account id that does not belong to the post's workspace.
 */
const PREFLIGHT_CODES = new Set([
  'CROSS_TENANT_ACCOUNT',
  'NO_PROFILE_MAPPING',
  'POST_NOT_PUBLISHABLE',
  'INVALID_ACCOUNT',
  'INVALID_VARIANT',
  'INVALID_POST',
])

function preflightCodeOf(e: unknown): string | null {
  const message = messageOf(e)
  for (const code of PREFLIGHT_CODES) {
    // The driver prefixes the raised text, so the code is a WORD in the message
    // rather than the whole of it. Anchored on word boundaries so `INVALID_POST`
    // cannot match inside a longer token.
    if (new RegExp(`\\b${code}\\b`).test(message)) return code
  }
  return null
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
