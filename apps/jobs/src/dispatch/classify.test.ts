import { describe, it, expect } from 'vitest'
import type { Channel, PostStatus, VariantPublishStatus } from '@sahoda/shared'
import type { PublishMode } from '../publish/runPublishPost'
import { classifyCandidate, type DispatchCandidate, type CandidateVariant } from './classify'

const GRACE = 3600
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
): CandidateVariant {
  return { variantId: `v-${channel}`, channel, publishStatus, publishedMode }
}

const decide = (c: DispatchCandidate) => classifyCandidate(c, { now: NOW, graceSeconds: GRACE })

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
    const d = classifyCandidate(c, { now: NOW, graceSeconds: GRACE })

    expect(d.kind).toBe('dispatch')
    if (d.kind !== 'dispatch') return
    expect(d.variants[0]!.scheduledAt).toBe(c.scheduledAt)
  })

  it('never dispatches while a sibling attempt is in flight', () => {
    // `publishing` means a run holds this variant right now. Adding work on top of it is
    // how the same post goes out twice.
    const d = decide(candidate(10, [variant('x', 'publishing'), variant('gbp', 'pending')]))

    expect(d.kind).toBe('hold')
    if (d.kind !== 'hold') return
    expect(d.reason).toBe('in-flight')
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
            { now: NOW, graceSeconds: GRACE },
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
    expect(d.reason).toBe('all-skipped')
  })

  /** Ruling 2's conditional: apps/web has no per-channel surface, so partials wait. */
  it('holds a partial publish instead of settling it to failed', () => {
    const d = decide(candidate(10, [variant('x', 'published', 'live'), variant('gbp', 'failed')]))

    expect(d.kind).toBe('hold')
    if (d.kind !== 'hold') return
    expect(d.reason).toBe('partial-needs-per-channel-ui')
  })

  it('holds a past-grace partial too — the unsent channel never will be sent', () => {
    const d = decide(candidate(120, [variant('x', 'published', 'live'), variant('gbp', 'pending')]))

    expect(d.kind).toBe('hold')
    if (d.kind !== 'hold') return
    expect(d.reason).toBe('partial-needs-per-channel-ui')
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

  it('reports which channels went out and which did not on a held partial', () => {
    // The owner reviews this in report mode; a bare "partial" would not be reviewable.
    const d = decide(
      candidate(10, [
        variant('x', 'published', 'live'),
        variant('gbp', 'failed'),
        variant('linkedin', 'skipped'),
      ]),
    )

    expect(d.kind).toBe('hold')
    if (d.kind !== 'hold') return
    expect(d.publishedChannels).toEqual(['x'])
    expect(d.unpublishedChannels).toEqual(['gbp', 'linkedin'])
  })
})
