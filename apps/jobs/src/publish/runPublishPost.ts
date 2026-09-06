import {
  AdapterError,
  CONSTRAINTS,
  GATE_BLOCKED_CODE,
  GATE_HELD_CODE,
  PER_DAY_CAP_EXHAUSTED_CODE,
  PER_DAY_CAP_UNREADABLE_CODE,
  checkPerDayCap,
  formatForPlatform,
  gateHoldIsTransient,
  perDayCapRefusalMessage,
  perDayCapWindowStart,
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
  CHANNEL_FORMATS,
  X_RATION_EXHAUSTED_CODE,
  X_RATION_UNREADABLE_CODE,
  checkXRation,
  planThread,
  refuseFormat,
  xRationRefusalMessage,
  xRationWindowStart,
  type PostFormat,
  type ThreadPlan,
  type VariantOptions,
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

/**
 * Whose sentence a failure `message` is. REQUIRED at every `fail` call, never
 * defaulted: an optional flag that silently reads as "safe to show" is the
 * exact shape that put a provider's HTML error body on a shop owner's screen.
 *
 *  · `customer`: Sahoda composed it for the reader, and it says something a
 *    code-mapped sentence could not (a figure, a date, a count).
 *  · `operator`: it was thrown, or it names a lowercase channel key or a row id.
 *    It belongs in `post_publish_logs.error.message` and nowhere else.
 */
type MessageAudience = 'customer' | 'operator'

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
  /**
   * Whether the keyword tail publishes bracketed, from `post_variants.extras`.
   *
   * ── WHY THIS HAD TO TRAVEL, AND WHAT IT COST WHILE IT DID NOT ───────────────
   * `VariantDraft` — in the frozen contract — HAS declared `keywordBrackets`
   * since the box shipped, and `formatForPlatform` reads it as
   * `keywordBrackets ?? true`. So the field existed at both ends and nothing
   * carried it across: `loadVariant` did not read the column and this type had
   * nowhere to put it, which made an absent flag indistinguishable from a
   * deliberate `true` on every real send.
   *
   * `undefined` means the variant states no choice and the default stands. That
   * is not the same as `false`, and the two must not be collapsed here.
   */
  keywordBrackets?: boolean
  /**
   * The Google Business call-to-action button, from `post_variants.extras`.
   *
   * ── WHY THIS TRAVELS SEPARATELY FROM THE BODY ───────────────────────────────
   * `FormattedContent`'s gbp arm has declared `ctaType` and `ctaUrl` since the
   * Constraint Engine was written, and `formatForPlatform` — which is in the
   * frozen contract — takes a `VariantDraft` that has no room for either. So the
   * fields exist, the formatter cannot fill them, and the composer's CTA picker
   * has been writing to `extras` and reaching nothing at all.
   *
   * Both halves are required together because Zernio's own schema marks
   * `callToAction` as `required: ['type', 'url']`. A button with no destination
   * is a payload that is rejected, not a partial one.
   */
  cta?: { type: string; url: string }
  /**
   * The per-channel controls — poll, Google topic, first comment, collaborators,
   * AI label — from `post_variants.extras`.
   *
   * Travels here for the same reason `cta` does: the frozen `FormattedContent`
   * has no arm that could carry them, and `formatForPlatform` takes a
   * `VariantDraft` with no room for any of it. The VALUES are checked inside
   * `buildPlatformData` by `refusePoll` / `refuseGbpTopic` — the same functions
   * the composer runs — so the card and the publisher cannot reach two answers.
   */
  options?: VariantOptions
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
  /**
   * The adapter's de-duplication key for this send, `publishIdempotencyKey(postId,
   * channel, scheduledAt)`, on EVERY row. A partial unique index on
   * `post_publish_logs (idempotency_key) where status = 'succeeded'` is what turns
   * the platform's ~5-minute courtesy into a permanent database fact: the same send
   * cannot be recorded as succeeded twice.
   */
  idempotencyKey: string
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
  /**
   * The adapter for this attempt.
   *
   * `format` is REQUIRED, and that is the point. It was tempting to make it
   * optional so existing callers kept compiling — and an optional argument that
   * silently defaults is the exact shape of two defects this repo shipped in two
   * days. A required third parameter means a caller that has a format and forgets
   * to pass it does not typecheck, rather than publishing a feed post where a
   * Story was asked for.
   */
  /**
   * `thread` is the FOURTH parameter and it is OPTIONAL, deliberately.
   *
   * Every existing caller — the fixture harnesses, `runClaimedPublish`'s stub,
   * the gbp-cta test — passes three arguments and keeps compiling. This repo has
   * broken peer lanes twice by making a new adapter-factory parameter REQUIRED
   * (`adapterFor` gained a third, `decideAttach` a fourth), and an optional one
   * costs nothing here because the thing that would go wrong if it were forgotten
   * is caught elsewhere and loudly: `buildPlatformData` REFUSES a `'thread'` that
   * arrives with no segments rather than publishing the body as a single post.
   */
  adapterFor(
    channel: Channel,
    viaZernio: boolean,
    format: PostFormat | null,
    thread?: ThreadPlan | null,
    options?: VariantOptions | null,
  ): PublishAdapter
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
  /**
   * The succeeded log row and the `published` mark, as ONE transaction (F-33).
   *
   * REQUIRED, for the reason `gate` and `countLiveSends` are: an optional
   * `recordPublished?` that fell back to `writeLog` + `markVariant` would be the
   * exact two-statement window this exists to close, reopened silently in
   * whichever call site forgot it. Every deps-constructing site fails to compile
   * until it supplies one.
   */
  recordPublished(entry: PublishLogEntry, update: VariantUpdate): Promise<void>
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
      /**
       * Whether `message` was written by Sahoda for the person who pressed Publish.
       *
       * True for a sentence this file or the Constraint Engine composed, figures
       * and all: "allows 280 characters; this has 312", "held until tomorrow".
       * False for anything that was THROWN, by an adapter or the database driver,
       * because that text can carry a provider's response body verbatim. A false
       * message still goes to the log row, where an operator reads it; the route
       * maps its CODE to copy and never forwards the words.
       *
       * Decided here, at the source, because the route cannot tell the two apart
       * by code alone: MEDIA_REQUIRED comes from the engine and from the adapter.
       */
      customerReadable: boolean
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
    audience: MessageAudience,
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
    return {
      status: 'failed',
      classification: 'permanent',
      code,
      message,
      reconnectRequired,
      customerReadable: audience === 'customer',
    }
  }

  if (!spec.publishable) {
    // Names the channel by its lowercase key, so it is a log line and not copy.
    return fail(
      'CHANNEL_NOT_PUBLISHABLE',
      `${payload.channel} cannot be published in this release.`,
      'operator',
      null,
    )
  }

  const variant = await deps.loadVariant(payload)
  if (!variant) {
    // A key and a row id: written for whoever reads the log, not for the writer.
    return fail(
      'VARIANT_NOT_FOUND',
      `No ${payload.channel} variant for post ${payload.postId}.`,
      'operator',
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
    // The composer's meter has always counted the tail the writer chose; this
    // literal did not carry the choice, so the publisher formatted and MEASURED
    // a different caption from the one on screen. Exactly the drift this
    // hoisting comment warns about, one field further along.
    keywordBrackets: variant.keywordBrackets,
  }

  // ── A THREAD IS MEASURED PER POST, AND EVERYTHING ELSE IS MEASURED AS BEFORE ─
  // docs/31 §6.2's second blocker: `validateVariant` measures the WHOLE body
  // against 280, so a perfectly legal three-post thread is refused with MAX_CHARS
  // before `refuseFormat` is even reached.
  //
  // The answer is not to weaken the engine. For a thread, MAX_CHARS is asking the
  // wrong question — the body is not what gets published, the segments are — so
  // exactly ONE violation code is swapped for the per-segment plan below.
  // MAX_HASHTAGS, MAX_MEDIA_COUNT and MEDIA_REQUIRED all still stand, which is
  // why this filters by code rather than skipping `validateVariant` for threads.
  //
  // `variant.format === 'thread'` alone is not enough to earn the swap: a variant
  // could claim a format its channel does not offer, and dropping the length check
  // on that basis would let an over-long post through on a channel with no threads
  // at all. `refuseFormat` below is what refuses that, and it runs AFTER this — so
  // the swap is conditioned on the channel really offering the format.
  const isThread =
    variant.format === 'thread' && (CHANNEL_FORMATS[payload.channel] ?? []).includes('thread')

  // The channel's own limits. Must run before the adapter, which validates nothing.
  const { violations } = validateVariant(spec, draft)
  const standing = isThread ? violations.filter((v) => v.code !== 'MAX_CHARS') : violations
  if (standing.length > 0) {
    const first = standing[0]!
    // The engine's own sentence carries the figures ("allows 280 characters;
    // this has 312"), and a sentence mapped from the code would be vaguer than
    // the truth it replaced. It leads with the channel KEY, which the render
    // edge rewrites into the label (`presentViolation`); the figures stay.
    return fail(first.code, first.message, 'customer', null)
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
    // Sahoda's own words about the writer's choice, some carrying the measured
    // aspect ratio. Same leading-key shape as the engine's, repaired the same way.
    return fail(formatRefusal.code, formatRefusal.message, 'customer', null)
  }

  // ── WHAT ACTUALLY GOES OUT, COMPUTED ONCE ───────────────────────────────────
  // The refusal gate and the thread plan must be looking at the SAME string. Two
  // calls to `formatForPlatform` would be two chances to disagree about whether
  // the hashtag tail is in — and the tail is precisely what pushes a last segment
  // over the limit, so a plan built without it would promise a thread that X
  // refuses. Media is deliberately omitted from both: it changes `content.media`
  // and never the text, and the real request re-formats with the hosted URLs.
  const publishedText = publishedTextOf(formatForPlatform(spec, draft))

  // ── THE THREAD, PLANNED BEFORE ANYTHING IS SPENT ────────────────────────────
  // Placed here for the same reason the gate sits where it does: after the checks
  // that are free, before the one that costs a model call, and well before a token
  // is decrypted. A thread with a 400-character unbreakable URL in it is refused
  // without Sahoda paying to think about it.
  //
  // ONE plan, made here and carried to the adapter. `buildPlatformData` could have
  // re-derived it from the content, and then the number of posts the gate approved
  // and the number of posts that went out would be two independent answers.
  let thread: ThreadPlan | null = null
  if (isThread) {
    // No `hasLink` argument, and that absence is load-bearing: `store.ts`
    // deliberately never populates `PublishVariant.hasLink` (it would need
    // apps/web's 300-line TLD list), so passing it would have split at 280 here
    // while the editor split at 257 — a preview showing five posts and a publish
    // producing four. `planThread` derives it from the text both sides hold.
    const planned = planThread(spec, publishedText)
    if (!planned.ok) {
      // Counts characters and posts; nothing thrown, nothing keyed.
      return fail(planned.refusal.code, planned.refusal.message, 'customer', null)
    }
    thread = planned.plan
  }

  // ── AND THEN THE TWO COUNTS, IN THIS ORDER FOR A STATED REASON ─────────────
  // The thread plan above is pure computation on a string this function already
  // holds; the two caps below each cost a database read. So an unplannable thread
  // is refused without spending either read, and the caps keep their own relative
  // order (the platform's limit before Sahoda's money) exactly as argued below.

  // ── THE PER-DAY CAP — THE CONSTRAINT ENGINE'S OTHER LIMIT, NOW READ ─────────
  // `PlatformSpec.perDayCap` has been declared on all four channels since the engine
  // was written and, until this line existed, was referenced by nothing. Four numbers
  // that looked like a limit and refused nothing.
  //
  // ── WHY IT RUNS BEFORE THE X RATION AND NOT AFTER ───────────────────────────
  // Both are counts and both are cheap, so the order is decided by what each one
  // protects. This cap is the PLATFORM's and applies to every channel; the X ration
  // is Sahoda's money and applies to one. Refusing on the universal rule first means
  // a post that could not be accepted today never consumes a paid allowance on its
  // way to being rejected — the same reasoning that puts both of them after
  // `validateVariant` and before the gate.
  {
    let usedToday: number
    try {
      usedToday = await deps.countLiveSends({
        workspaceId: payload.workspaceId,
        channel: payload.channel,
        since: perDayCapWindowStart(now()),
      })
    } catch {
      // Same discipline as the ration below, and for the same two wrong answers.
      // "0 used" publishes past a platform limit off a failed read; "exhausted" tells
      // a customer the channel refused them when the truth is we could not count, and
      // that verdict is PERMANENT so the post dies on a fabricated reason.
      const error: PublishLogError = {
        code: PER_DAY_CAP_UNREADABLE_CODE,
        classification: 'transient',
        message: "This channel's daily post count could not be read, so nothing was sent.",
      }
      await deps.writeLog(logRow(payload, ctx, deps.mode, 'failed', { error, connectionId: null }))
      throw new Error('per-day cap unreadable')
    }

    const perDay = checkPerDayCap({ channel: payload.channel, used: usedToday })
    if (!perDay.allowed) {
      // PERMANENT for THIS attempt, which is the honest classification even though
      // tomorrow would succeed: `transient` tells the runner to retry, and every
      // retry inside today burns an attempt on a verdict that cannot change. The
      // message says when it can be sent instead.
      return fail(PER_DAY_CAP_EXHAUSTED_CODE, perDayCapRefusalMessage(perDay), 'customer', null)
    }
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
      return fail(X_RATION_EXHAUSTED_CODE, xRationRefusalMessage(ration), 'customer', null)
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
    // ── AND THIS IS WHY A THREAD IS SAFE TO OFFER ────────────────────────────
    // The gate reads the whole formatted body, and every segment of the thread is
    // a SLICE of that same body (`thread-split.ts` asserts the covering property).
    // So a red line written into the last post of a seven-post thread is in front
    // of the classifier here, exactly as it would be in a single post. docs/31
    // §6.2 refused to ship threads because a gate reading one body would miss it —
    // true of separately-authored segments, and not true of a split.
    text: publishedText,
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
    // `operator`, and deliberately: `gateMessage` is the thin log line, and the
    // refusal a person reads is built in apps/web from `gate` (the rule, the
    // tier, the rewrite). A hold's `holdReason` can also be the checker's own
    // words, which is one more reason not to forward it.
    return fail(code, gateMessage(verdict), 'operator', null, gateDetail(verdict))
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
    //
    // Thrown text, so `operator`: the driver prefixes the raised code with its
    // own "error:" and the vault's failures name internals. The CODE is what
    // the route turns into a sentence.
    return fail(preflightCodeOf(e) ?? 'CONNECTION_UNAVAILABLE', messageOf(e), 'operator', null)
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

    // ── THE CTA, PUT BACK INTO CONTENT THE FORMATTER CANNOT CARRY IT IN ──────
    // `formatForPlatform` is frozen and takes a draft with no CTA on it, so the
    // two fields its own gbp arm declares are filled here instead. A spread, not
    // a mutation: the formatter's result is the base, and this adds the one thing
    // it structurally could not produce.
    const formatted = formatForPlatform(spec, draft, hosted)
    const content =
      formatted.channel === 'gbp' && variant.cta
        ? { ...formatted, ctaType: variant.cta.type, ctaUrl: variant.cta.url }
        : formatted

    const request = {
      workspaceId: payload.workspaceId,
      postId: payload.postId,
      variantId: variant.variantId,
      content,
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
      .adapterFor(
        payload.channel,
        connection.viaZernio === true,
        variant.format ?? null,
        thread,
        variant.options ?? null,
      )
      .publish(request)

    // The adapter's own mode is authoritative: a fixture result is recorded as a fixture
    // even when this run believed it was live (CLAUDE.md honesty rule).
    //
    // ONE call, ONE transaction. The log row and the variant mark used to be two
    // statements, and a process killed between them left a live post behind a
    // variant that was still claimable once its lease ran out (F-33).
    await deps.recordPublished(
      logRow(payload, ctx, result.mode, 'succeeded', {
        connectionId: connection.connectionId,
        platformPostId: result.platformPostId,
        permalink: result.permalink,
        publishedAt: result.publishedAt,
      }),
      {
        workspaceId: payload.workspaceId,
        variantId: payload.variantId,
        publishStatus: 'published',
        platformPostId: result.platformPostId,
        permalink: result.permalink,
        lastError: null,
      },
    )
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
      // The adapter's thrown text, which for Zernio is built from the provider's
      // response body ("createPost: HTTP 500 <html>…"). It is in the log row
      // above for an operator; it is marked here so no screen ever prints it.
      message: error.message,
      reconnectRequired,
      customerReadable: false,
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
      // The same key the adapter was handed, from the same three facts. Built here
      // and not read back off the request so a failed row that never reached the
      // adapter still carries it.
      idempotencyKey: publishIdempotencyKey(p.postId, p.channel, p.scheduledAt),
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
