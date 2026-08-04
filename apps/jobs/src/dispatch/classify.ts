import {
  CONSTRAINTS,
  isDispatchable,
  type Channel,
  type PostStatus,
  type VariantPublishStatus,
} from '@sahoda/shared'
import type { PublishMode } from '../publish/runPublishPost'

/** One post_variants row, plus the mode proven by its publish log. */
export interface CandidateVariant {
  variantId: string
  channel: Channel
  publishStatus: VariantPublishStatus
  /**
   * The `mode` on this variant's most recent SUCCEEDED post_publish_logs row, or null when
   * there is none to read. Null is not "live" — it is "we cannot prove what happened", and
   * it is treated as such below.
   */
  publishedMode: PublishMode | null
}

export interface DispatchCandidate {
  postId: string
  workspaceId: string
  status: PostStatus
  scheduledAt: string
  variants: CandidateVariant[]
}

export interface ClassifyOptions {
  now: Date
  /** How late a post may be and still be worth publishing. Past this it expires. */
  graceSeconds: number
}

/** One variant the dispatcher intends to enqueue. */
export interface DispatchVariantIntent {
  variantId: string
  channel: Channel
  /** The POST's scheduled_at, carried verbatim — see the idempotency note below. */
  scheduledAt: string
}

/**
 * Why a candidate was left untouched. Every one of these is a deliberate refusal to write
 * something we cannot justify, and each is surfaced in report mode so it can be reviewed.
 */
export type HoldReason =
  | 'not-eligible'
  | 'not-yet-due'
  | 'in-flight'
  | 'no-variants'
  | 'nothing-attemptable'
  | 'fixture-publish'
  | 'unknown-publish-mode'

interface DecisionBase {
  postId: string
  workspaceId: string
}

export type DispatchDecision =
  | (DecisionBase & { kind: 'dispatch'; variants: DispatchVariantIntent[] })
  | (DecisionBase & { kind: 'expire'; reason: 'past-grace' | 'no-variants-past-grace' })
  | (DecisionBase & { kind: 'settle'; status: 'published' | 'partial' | 'failed' })
  | (DecisionBase & {
      kind: 'hold'
      reason: HoldReason
      publishedChannels: Channel[]
      unpublishedChannels: Channel[]
    })

/** Variant states that still have work left to do. */
const PENDING_STATES: readonly VariantPublishStatus[] = ['pending', 'scheduled']

/**
 * Whether this release can actually post to the variant's channel. Instagram is
 * `publishable: false` in CONSTRAINTS — it exists for caption rules, not posting — and
 * production carries instagram variants sitting `pending` right now.
 *
 * Such a variant is excluded from BOTH ends: it is never dispatched, because that buys a
 * guaranteed CHANNEL_NOT_PUBLISHABLE failure and nothing else, and it never counts against
 * a post reaching `published`, because otherwise every post carrying one becomes a
 * permanent partial and is held forever.
 */
const canAttempt = (v: CandidateVariant): boolean => CONSTRAINTS[v.channel]?.publishable === true

/**
 * Decide what should happen to one due post. Pure: no clock, no database, no side effects
 * — `now` is injected so the whole sweep classifies against a single instant and tests are
 * deterministic.
 *
 * The order of the checks below is load-bearing, and follows the owner's ruling that
 * fan-in comes before expiry. A post that already published somewhere must reach the
 * fan-in branch and can never fall through to `expire`; that property is asserted directly
 * in the tests across every variant configuration, because getting it wrong tells a user
 * their live post never went out.
 */
export function classifyCandidate(
  candidate: DispatchCandidate,
  opts: ClassifyOptions,
): DispatchDecision {
  const { postId, workspaceId, variants } = candidate
  const base = { postId, workspaceId }

  const published = variants.filter((v) => v.publishStatus === 'published')
  const failed = variants.filter((v) => v.publishStatus === 'failed')
  const inFlight = variants.filter((v) => v.publishStatus === 'publishing')
  const publishable = variants.filter(
    (v) => PENDING_STATES.includes(v.publishStatus) && canAttempt(v),
  )

  const hold = (reason: HoldReason): DispatchDecision => ({
    ...base,
    kind: 'hold',
    reason,
    publishedChannels: published.map((v) => v.channel),
    unpublishedChannels: variants
      .filter((v) => v.publishStatus !== 'published')
      .map((v) => v.channel),
  })

  // The gate, from @sahoda/shared so the job and the UI cannot disagree about which posts
  // are waiting to go out.
  if (!isDispatchable(candidate.status, candidate.scheduledAt)) return hold('not-eligible')

  const due = Date.parse(candidate.scheduledAt)
  const lateMs = opts.now.getTime() - due
  if (lateMs < 0) return hold('not-yet-due')
  // `<=` so the boundary minute still publishes: a 60-minute grace must mean 60, not 59.
  const withinGrace = lateMs <= opts.graceSeconds * 1000

  // An attempt holds this post right now. Enqueueing more work would double-post, and
  // settling or expiring would overwrite an outcome that is still being written.
  if (inFlight.length > 0) return hold('in-flight')

  if (publishable.length > 0) {
    if (withinGrace) {
      return {
        ...base,
        kind: 'dispatch',
        // The POST's scheduled_at, not the dispatcher's clock. The idempotency key is
        // `${postId}:${channel}:${scheduledAt}`, so using `now` would mint a fresh key on
        // every tick and publish the same content again five minutes later.
        variants: publishable.map((v) => ({
          variantId: v.variantId,
          channel: v.channel,
          scheduledAt: candidate.scheduledAt,
        })),
      }
    }

    // Past grace with work still outstanding. Those channels are never going out —
    // but something already did, so this post is partly live and must be settled
    // as such. It used to hold here, which meant every later sweep reached the
    // same branch and held again: a post nobody would ever get an answer about.
    if (published.length > 0) return { ...base, kind: 'settle', status: 'partial' }
    return { ...base, kind: 'expire', reason: 'past-grace' }
  }

  // Nothing left to publish and nothing in flight — every variant has settled.
  if (variants.length === 0) {
    return withinGrace
      ? hold('no-variants')
      : { ...base, kind: 'expire', reason: 'no-variants-past-grace' }
  }

  if (published.length === 0) {
    if (failed.length > 0) return { ...base, kind: 'settle', status: 'failed' }

    // Nothing was ever attempted — every channel was skipped, or none of them is one this
    // release can post to. "Failed" would invent an error that never happened. Inside the
    // window it waits; past it, its time came and nothing went out, which is what
    // `expired` means. Holding forever would strand the row.
    return withinGrace
      ? hold('nothing-attemptable')
      : { ...base, kind: 'expire', reason: 'past-grace' }
  }

  // Something published. Before promoting the post, the mode has to hold up: a fixture run
  // posted nothing anywhere, and a `published` variant with no succeeded log leaves us
  // unable to show what happened. Neither may become an unqualified "Published" badge.
  if (published.some((v) => v.publishedMode === null)) return hold('unknown-publish-mode')
  if (published.some((v) => v.publishedMode !== 'live')) return hold('fixture-publish')

  // Skipped channels are excluded from the denominator: the post went out everywhere it
  // was meant to. A failed sibling is a different story — that is a partial, and it now
  // has its own status rather than waiting for one. It is NOT flattened to `failed`
  // (which would deny a channel that is live) or to `published` (which would hide one
  // that never went); apps/web renders the per-channel breakdown underneath it.
  if (failed.length > 0) return { ...base, kind: 'settle', status: 'partial' }

  return { ...base, kind: 'settle', status: 'published' }
}
