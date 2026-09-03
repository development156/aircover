import { describe, it, expect } from 'vitest'
import type { Channel, PostStatus, VariantPublishStatus } from '@sahoda/shared'
import type { PublishMode } from '../publish/mode'
import { classifyCandidate, type DispatchCandidate, type CandidateVariant } from './classify'

const GRACE = 3600
const LEASE = 600
const NOW = new Date('2026-07-25T12:00:00Z')

/** `minutesLate` is how far in the past the schedule sits; negative means still ahead. */
function candidate(
  minutesLate: number,
  variants: CandidateVariant[],
  status: PostStatus = 'approved',
): DispatchCandidate {
  return {
    postId: 'post-1',
    workspaceId: 'ws-1',
    status,
    scheduledAt: new Date(NOW.getTime() - minutesLate * 60_000).toISOString(),
    variants,
  }
}

function variant(
  channel: Channel,
  publishStatus: VariantPublishStatus,
  publishedMode: PublishMode | null = null,
  over: Partial<CandidateVariant> = {},
): CandidateVariant {
  return {
    variantId: `v-${channel}`,
    channel,
    publishStatus,
    publishedMode,
    claimedAt: null,
    awaitingPlatform: false,
    ...over,
  }
}

const decide = (c: DispatchCandidate) =>
  classifyCandidate(c, { now: NOW, graceSeconds: GRACE, leaseSeconds: LEASE })

/** A `publishing` variant whose claim was taken `ageSeconds` before NOW. */
const claimedAgo = (ageSeconds: number): string =>
  new Date(NOW.getTime() - ageSeconds * 1000).toISOString()

describe('classifyCandidate — dispatching', () => {
  it('dispatches every publishable variant of a post due inside the grace window', () => {
    const d = decide(candidate(10, [variant('x', 'pending'), variant('gbp', 'pending')]))

    expect(d.kind).toBe('dispatch')
    if (d.kind !== 'dispatch') return
    expect(d.variants.map((v) => v.channel)).toEqual(['x', 'gbp'])
  })

  it('dispatches a post due this very second', () => {
    expect(decide(candidate(0, [variant('x', 'pending')])).kind).toBe('dispatch')
  })

  it('leaves a post whose time has not arrived alone', () => {
    const d = decide(candidate(-5, [variant('x', 'pending')]))

    expect(d.kind).toBe('hold')
    if (d.kind !== 'hold') return
    expect(d.reason).toBe('not-yet-due')
  })

  it('dispatches only the variants still waiting, not ones already settled', () => {
    // The published channel must not be sent again just because a sibling is pending.
    const d = decide(
      candidate(10, [
        variant('x', 'published', 'live'),
        variant('gbp', 'pending'),
        variant('linkedin', 'failed'),
      ]),
    )

    expect(d.kind).toBe('dispatch')
    if (d.kind !== 'dispatch') return
    expect(d.variants.map((v) => v.channel)).toEqual(['gbp'])
  })

  it('treats a `scheduled` variant as publishable', () => {
    const d = decide(candidate(10, [variant('x', 'scheduled')]))

    expect(d.kind).toBe('dispatch')
  })

  it('carries the post scheduled_at into the intent so the idempotency key is stable', () => {
    // The key is `${postId}:${channel}:${scheduledAt}`. If the dispatcher passed its own
    // clock instead, every tick would mint a new key and re-post the same content.
    const c = candidate(10, [variant('x', 'pending')])
    const d = classifyCandidate(c, { now: NOW, graceSeconds: GRACE, leaseSeconds: LEASE })

    expect(d.kind).toBe('dispatch')
    if (d.kind !== 'dispatch') return
    expect(d.variants[0]!.scheduledAt).toBe(c.scheduledAt)
  })

  it('never dispatches while a sibling attempt is in flight', () => {
    // `publishing` means a run holds this variant right now. Adding work on top of it is
    // how the same post goes out twice.
    const d = decide(
      candidate(10, [
        variant('x', 'publishing', null, { claimedAt: claimedAgo(30) }),
        variant('gbp', 'pending'),
      ]),
    )

    expect(d.kind).toBe('hold')
    if (d.kind !== 'hold') return
    expect(d.reason).toBe('in-flight')
  })
})

/**
 * The lease, seen from the scheduled path.
 *
 * `claimVariant` (publish/store.ts) already takes over a `publishing` row whose claim is
 * older than PUBLISH_LEASE_SECONDS. That branch was unreachable from the cron: this
 * classifier held EVERY `publishing` variant as in-flight with no notion of age, so a
 * publisher killed mid-flight stranded its variant on every later tick, and the only
 * thing that could unstick it was a person pressing "Send now". The threshold here has
 * to agree with the store's: a claim the store would refuse is held, a claim the store
 * would take over is dispatched.
 */
describe('classifyCandidate — a stale lease', () => {
  it('holds a `publishing` variant whose claim is still inside the lease', () => {
    const d = decide(
      candidate(10, [variant('instagram', 'publishing', null, { claimedAt: claimedAgo(599) })]),
    )

    expect(d.kind).toBe('hold')
    if (d.kind !== 'hold') return
    expect(d.reason).toBe('in-flight')
  })

  it('dispatches a `publishing` variant whose claim is older than the lease', () => {
    const d = decide(
      candidate(10, [variant('instagram', 'publishing', null, { claimedAt: claimedAgo(601) })]),
    )

    expect(d.kind).toBe('dispatch')
    if (d.kind !== 'dispatch') return
    expect(d.variants.map((v) => v.variantId)).toEqual(['v-instagram'])
  })

  it('treats a `publishing` variant with no claim at all as stale, not as untouchable', () => {
    // No path writes `publishing` without a claim, so such a row predates the claim
    // existing. The store reclaims it; so must the classifier, or it is held for ever.
    const d = decide(candidate(10, [variant('instagram', 'publishing', null, { claimedAt: null })]))

    expect(d.kind).toBe('dispatch')
  })

  it('still holds a live claim when a stale sibling would otherwise dispatch', () => {
    const d = decide(
      candidate(10, [
        variant('x', 'publishing', null, { claimedAt: claimedAgo(30) }),
        variant('instagram', 'publishing', null, { claimedAt: claimedAgo(601) }),
      ]),
    )

    expect(d.kind).toBe('hold')
    if (d.kind !== 'hold') return
    expect(d.reason).toBe('in-flight')
  })
})

/**
 * A variant the platform ACCEPTED but has not finished with.
 *
 * The adapter gives up on Instagram's container flow as STILL_PROCESSING, records
 * Zernio's id on the failed log row, and the claim is handed back as `scheduled`. The
 * next tick used to classify that as publishable and POST the same content again,
 * ~5m40s after the first — on or past the ~5-minute idempotency window doc 13 §5 puts
 * on Zernio's request id. Two Instagram posts. The reconcile pass is what settles an
 * accepted post, and until it has, re-sending is the one thing this must not do.
 */
describe('classifyCandidate — a publish the platform is still processing', () => {
  it('holds a variant whose latest log is an unresolved STILL_PROCESSING', () => {
    const d = decide(
      candidate(10, [variant('instagram', 'scheduled', null, { awaitingPlatform: true })]),
    )

    expect(d.kind).toBe('hold')
    if (d.kind !== 'hold') return
    expect(d.reason).toBe('awaiting-platform')
    expect(d.unpublishedChannels).toEqual(['instagram'])
  })

  it('never re-sends the awaiting channel, even when a sibling is publishable', () => {
    const d = decide(
      candidate(10, [
        variant('instagram', 'scheduled', null, { awaitingPlatform: true }),
        variant('x', 'pending'),
      ]),
    )

    expect(d.kind).toBe('hold')
    if (d.kind !== 'hold') return
    expect(d.reason).toBe('awaiting-platform')
  })

  it('keeps holding past grace: expiring would call a post that may be live "never sent"', () => {
    const d = decide(
      candidate(120, [variant('instagram', 'scheduled', null, { awaitingPlatform: true })]),
    )

    expect(d.kind).toBe('hold')
    if (d.kind !== 'hold') return
    expect(d.reason).toBe('awaiting-platform')
  })

  it('dispatches once the log has been superseded by a terminal row', () => {
    // `awaitingPlatform` is false whenever a later log row exists — the reconcile pass
    // appended one, or a later attempt did. Then the variant is whatever its status says.
    const d = decide(
      candidate(10, [variant('instagram', 'scheduled', null, { awaitingPlatform: false })]),
    )

    expect(d.kind).toBe('dispatch')
  })
})

describe('classifyCandidate — the gate', () => {
  it('refuses any status outside the shared gate', () => {
    for (const status of ['draft', 'review', 'published', 'failed', 'expired'] as const) {
      const d = decide(candidate(10, [variant('x', 'pending')], status))
      expect(d.kind).toBe('hold')
      if (d.kind !== 'hold') return
      expect(d.reason).toBe('not-eligible')
    }
  })

  it('refuses `publishing` at post level too', () => {
    const d = decide(candidate(10, [variant('x', 'pending')], 'publishing'))

    expect(d.kind).toBe('hold')
  })
})

describe('classifyCandidate — expiry', () => {
  it('expires a post past the grace window with nothing published', () => {
    const d = decide(candidate(61, [variant('x', 'pending')]))

    expect(d.kind).toBe('expire')
  })

  it('holds the boundary minute rather than expiring it', () => {
    // Exactly at the grace edge the post is still publishable. Expiring here would make
    // the window 59 minutes while the flag says 60.
    expect(decide(candidate(60, [variant('x', 'pending')])).kind).toBe('dispatch')
  })

  it('expires a past-grace post that has no variants at all', () => {
    const d = decide(candidate(120, []))

    expect(d.kind).toBe('expire')
  })

  it('holds a variantless post that is still inside its window', () => {
    const d = decide(candidate(10, []))

    expect(d.kind).toBe('hold')
    if (d.kind !== 'hold') return
    expect(d.reason).toBe('no-variants')
  })

  /**
   * Ruling 1, the standing predicate. This is the one that must never regress: expiring a
   * post whose content is live on a platform tells the user it never went out.
   */
  it('NEVER expires a post carrying a published variant, in any configuration', () => {
    const others: VariantPublishStatus[] = [
      'pending',
      'scheduled',
      'publishing',
      'published',
      'failed',
      'skipped',
    ]
    const lateness = [0, 30, 61, 600, 100_000]

    for (const other of others) {
      for (const late of lateness) {
        for (const mode of ['live', 'fixture', null] as const) {
          const d = classifyCandidate(
            candidate(late, [variant('x', 'published', mode), variant('gbp', other)]),
            { now: NOW, graceSeconds: GRACE, leaseSeconds: LEASE },
          )
          expect(d.kind, `published + ${other} @ ${late}m late, mode ${mode}`).not.toBe('expire')
        }
      }
    }
  })
})

describe('classifyCandidate — fan-in', () => {
  it('settles a fully published post to published', () => {
    const d = decide(
      candidate(10, [variant('x', 'published', 'live'), variant('gbp', 'published', 'live')]),
    )

    expect(d.kind).toBe('settle')
    if (d.kind !== 'settle') return
    expect(d.status).toBe('published')
  })

  it('settles an all-failed post to failed', () => {
    // One badge reading "Failed" over a post where every channel failed is accurate, so
    // this needs no per-channel surface and is not held.
    const d = decide(candidate(10, [variant('x', 'failed'), variant('gbp', 'failed')]))

    expect(d.kind).toBe('settle')
    if (d.kind !== 'settle') return
    expect(d.status).toBe('failed')
  })

  it('ignores skipped channels when deciding a post fully published', () => {
    const d = decide(candidate(10, [variant('x', 'published', 'live'), variant('gbp', 'skipped')]))

    expect(d.kind).toBe('settle')
    if (d.kind !== 'settle') return
    expect(d.status).toBe('published')
  })

  it('holds a post whose every channel was skipped rather than calling it failed', () => {
    // Nothing was attempted. "Failed" would invent an error that never happened.
    const d = decide(candidate(10, [variant('x', 'skipped'), variant('gbp', 'skipped')]))

    expect(d.kind).toBe('hold')
    if (d.kind !== 'hold') return
    expect(d.reason).toBe('nothing-attemptable')
  })

  it('expires a past-grace post where nothing was ever attemptable', () => {
    // Holding this forever would strand the row. Its time passed and nothing went out,
    // which is exactly what `expired` means.
    expect(decide(candidate(120, [variant('x', 'skipped')])).kind).toBe('expire')
  })
})

/**
 * CONTRACT CHANGE 2026-08-04: instagram is `publishable: true` — it routes through the
 * Zernio rail, which holds the Meta credential. It was the only channel this release
 * could not publish, so these tests now pin the OPPOSITE behaviour for it.
 *
 * The exclusion MECHANISM is unchanged and still matters: a future channel can arrive
 * in CONSTRAINTS before its adapter ships, and enqueueing it would buy a guaranteed
 * CHANNEL_NOT_PUBLISHABLE and nothing else. There is simply no channel exercising it
 * today — worth knowing, because an untested branch is how the next one breaks.
 */
describe('classifyCandidate — channels this release cannot publish', () => {
  it('dispatches instagram alongside x, now that the Zernio rail exists', () => {
    const d = decide(candidate(10, [variant('x', 'pending'), variant('instagram', 'pending')]))

    expect(d.kind).toBe('dispatch')
    if (d.kind !== 'dispatch') return
    expect(d.variants.map((v) => v.channel).sort()).toEqual(['instagram', 'x'])
  })

  it('holds a post back while its instagram variant is still pending', () => {
    // Previously instagram was excluded and could not hold a post open. Now it is a
    // real leg: settling as `published` while it is still pending would report a
    // partial as complete.
    const d = decide(
      candidate(10, [variant('x', 'published', 'live'), variant('instagram', 'pending')]),
    )

    expect(d.kind).toBe('dispatch')
    if (d.kind !== 'dispatch') return
    expect(d.variants.map((v) => v.channel)).toEqual(['instagram'])
  })

  it('dispatches an instagram-only post instead of holding it', () => {
    // This used to hold with `nothing-attemptable` — instagram was the only channel
    // that could produce that state, so an instagram-only post never went anywhere.
    const d = decide(candidate(10, [variant('instagram', 'pending')]))

    expect(d.kind).toBe('dispatch')
    if (d.kind !== 'dispatch') return
    expect(d.variants.map((v) => v.channel)).toEqual(['instagram'])
  })

  it('still expires an instagram-only post once the window has passed', () => {
    // Expiry is about the SCHEDULE, not about publishability, so this is unchanged.
    expect(decide(candidate(120, [variant('instagram', 'pending')])).kind).toBe('expire')
  })

  /**
   * Ruling 2's conditional is now satisfied: apps/web HAS a per-channel surface,
   * and `partial` is a real post status. These used to hold — and a hold is not a
   * resting state, so the post was re-read and held again on every sweep, forever.
   */
  it('settles a partial publish as partial, not as failed', () => {
    const d = decide(candidate(10, [variant('x', 'published', 'live'), variant('gbp', 'failed')]))

    expect(d.kind).toBe('settle')
    if (d.kind !== 'settle') return
    // 'failed' would deny a channel that is live on the internet right now.
    expect(d.status).toBe('partial')
  })

  it('settles a past-grace partial too — the unsent channel never will be sent', () => {
    const d = decide(candidate(120, [variant('x', 'published', 'live'), variant('gbp', 'pending')]))

    expect(d.kind).toBe('settle')
    if (d.kind !== 'settle') return
    expect(d.status).toBe('partial')
  })

  /** Ruling 3: the post status may not outrun the mode recorded on the variant's log. */
  it('refuses to call a fixture publish `published`', () => {
    const d = decide(candidate(10, [variant('x', 'published', 'fixture')]))

    expect(d.kind).toBe('hold')
    if (d.kind !== 'hold') return
    expect(d.reason).toBe('fixture-publish')
  })

  it('refuses to promote when even one channel of a full set was a fixture', () => {
    const d = decide(
      candidate(10, [variant('x', 'published', 'live'), variant('gbp', 'published', 'fixture')]),
    )

    expect(d.kind).toBe('hold')
    if (d.kind !== 'hold') return
    expect(d.reason).toBe('fixture-publish')
  })

  it('refuses to promote a published variant with no proven mode', () => {
    // No succeeded log row to read a mode from. We cannot show it as published without
    // claiming something we cannot demonstrate.
    const d = decide(candidate(10, [variant('x', 'published', null)]))

    expect(d.kind).toBe('hold')
    if (d.kind !== 'hold') return
    expect(d.reason).toBe('unknown-publish-mode')
  })

  it('counts a skipped channel as neither published nor a reason to fail', () => {
    // A skipped channel is not a channel that failed — the post went out
    // everywhere it was meant to go. Only the genuinely failed gbp makes this a
    // partial; without it this would settle as a clean `published`.
    const d = decide(
      candidate(10, [
        variant('x', 'published', 'live'),
        variant('gbp', 'failed'),
        variant('linkedin', 'skipped'),
      ]),
    )

    expect(d.kind).toBe('settle')
    if (d.kind !== 'settle') return
    expect(d.status).toBe('partial')

    // Per channel, the truth lives on post_variants and is read by the editor's
    // channel-status list — the decision itself carries only the post-level answer.
    const clean = decide(
      candidate(10, [variant('x', 'published', 'live'), variant('linkedin', 'skipped')]),
    )
    expect(clean.kind).toBe('settle')
    if (clean.kind !== 'settle') return
    expect(clean.status).toBe('published')
  })
})
