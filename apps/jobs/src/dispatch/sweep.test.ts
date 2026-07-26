import { describe, it, expect, vi } from 'vitest'
import type { Channel, VariantPublishStatus } from '@sahoda/shared'
import type { PublishMode } from '../publish/runPublishPost'
import type { CandidateVariant, DispatchCandidate } from './classify'
import { runDispatchSweep, type DispatchSweepDeps } from './sweep'
import { PublishQueueUnavailableError } from './queue'

const NOW = new Date('2026-07-25T12:00:00Z')

function variant(
  channel: Channel,
  publishStatus: VariantPublishStatus,
  publishedMode: PublishMode | null = null,
): CandidateVariant {
  return { variantId: `v-${channel}`, channel, publishStatus, publishedMode }
}

function candidate(
  postId: string,
  minutesLate: number,
  variants: CandidateVariant[],
): DispatchCandidate {
  return {
    postId,
    workspaceId: 'ws-1',
    status: 'approved',
    scheduledAt: new Date(NOW.getTime() - minutesLate * 60_000).toISOString(),
    variants,
  }
}

function deps(overrides: Partial<DispatchSweepDeps> = {}): DispatchSweepDeps {
  return {
    mode: 'on',
    graceSeconds: 3600,
    listCandidates: vi.fn(async () => []),
    enqueuePublish: vi.fn(async () => {}),
    expirePost: vi.fn(async () => true),
    settlePost: vi.fn(async () => true),
    now: () => NOW,
    ...overrides,
  }
}

describe('runDispatchSweep — the mode gate', () => {
  it('reads nothing at all when off', async () => {
    const listCandidates = vi.fn(async () => [candidate('p1', 10, [variant('x', 'pending')])])
    const d = deps({ mode: 'off', listCandidates })

    const report = await runDispatchSweep(d)

    expect(listCandidates).not.toHaveBeenCalled()
    expect(report.scanned).toBe(0)
    expect(report.mode).toBe('off')
  })

  it('classifies but writes nothing in report mode', async () => {
    const d = deps({
      mode: 'report',
      listCandidates: async () => [
        candidate('p1', 10, [variant('x', 'pending')]), // would dispatch
        candidate('p2', 120, [variant('x', 'pending')]), // would expire
        candidate('p3', 10, [variant('x', 'published', 'live')]), // would settle
      ],
    })

    const report = await runDispatchSweep(d)

    expect(d.enqueuePublish).not.toHaveBeenCalled()
    expect(d.expirePost).not.toHaveBeenCalled()
    expect(d.settlePost).not.toHaveBeenCalled()

    // It still says what it WOULD have done — that is the point of the mode.
    expect(report.scanned).toBe(3)
    expect(report.wouldDispatch).toBe(1)
    expect(report.wouldExpire).toBe(1)
    expect(report.wouldSettle).toBe(1)
  })

  it('lists every decision with its post id so the report can be reviewed', async () => {
    const d = deps({
      mode: 'report',
      listCandidates: async () => [
        candidate('p1', 10, [variant('x', 'published', 'fixture')]),
        candidate('p2', 120, [variant('x', 'pending')]),
      ],
    })

    const report = await runDispatchSweep(d)

    expect(report.decisions).toEqual([
      expect.objectContaining({ postId: 'p1', kind: 'hold', reason: 'fixture-publish' }),
      expect.objectContaining({ postId: 'p2', kind: 'expire' }),
    ])
  })

  it('executes when on', async () => {
    const d = deps({
      listCandidates: async () => [candidate('p1', 10, [variant('x', 'pending')])],
    })

    const report = await runDispatchSweep(d)

    expect(d.enqueuePublish).toHaveBeenCalledTimes(1)
    expect(report.enqueued).toBe(1)
  })
})

describe('runDispatchSweep — applying decisions', () => {
  it('enqueues one publish per publishable variant, carrying the post schedule', async () => {
    const c = candidate('p1', 10, [variant('x', 'pending'), variant('gbp', 'pending')])
    const d = deps({ listCandidates: async () => [c] })

    await runDispatchSweep(d)

    expect(d.enqueuePublish).toHaveBeenCalledTimes(2)
    expect(d.enqueuePublish).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      postId: 'p1',
      variantId: 'v-x',
      channel: 'x',
      scheduledAt: c.scheduledAt,
    })
  })

  it('settles before it expires, so a late publish cannot lose a race to expiry', async () => {
    // Ruling 1's ordering half. The guarded write is the other half.
    const order: string[] = []
    const d = deps({
      listCandidates: async () => [
        candidate('p-expire', 120, [variant('x', 'pending')]),
        candidate('p-settle', 10, [variant('x', 'published', 'live')]),
      ],
      expirePost: vi.fn(async () => {
        order.push('expire')
        return true
      }),
      settlePost: vi.fn(async () => {
        order.push('settle')
        return true
      }),
    })

    await runDispatchSweep(d)

    expect(order).toEqual(['settle', 'expire'])
  })

  it('counts an expiry the database refused rather than reporting it as done', async () => {
    // The NOT EXISTS guard rejects the write when a variant published between the read
    // and the write. Reporting that as "expired" would make the report lie.
    const d = deps({
      listCandidates: async () => [candidate('p1', 120, [variant('x', 'pending')])],
      expirePost: vi.fn(async () => false),
    })

    const report = await runDispatchSweep(d)

    expect(report.expired).toBe(0)
    expect(report.blockedByGuard).toBe(1)
  })

  it('does not count a settle that changed no row', async () => {
    const d = deps({
      listCandidates: async () => [candidate('p1', 10, [variant('x', 'published', 'live')])],
      settlePost: vi.fn(async () => false),
    })

    const report = await runDispatchSweep(d)

    expect(report.settled).toBe(0)
    expect(report.blockedByGuard).toBe(1)
  })

  it('tallies holds by reason', async () => {
    const d = deps({
      listCandidates: async () => [
        candidate('p1', 10, [variant('x', 'published', 'fixture')]),
        candidate('p2', 10, [variant('x', 'published', 'live'), variant('gbp', 'failed')]),
        candidate('p3', 10, [variant('x', 'published', 'fixture')]),
      ],
    })

    const report = await runDispatchSweep(d)

    expect(report.held).toBe(3)
    expect(report.holdsByReason['fixture-publish']).toBe(2)
    expect(report.holdsByReason['partial-needs-per-channel-ui']).toBe(1)
  })
})

describe('runDispatchSweep — resilience', () => {
  it('carries on after one post throws, so a poison row cannot strand the rest', async () => {
    const d = deps({
      listCandidates: async () => [
        candidate('p1', 120, [variant('x', 'pending')]),
        candidate('p2', 120, [variant('x', 'pending')]),
        candidate('p3', 120, [variant('x', 'pending')]),
      ],
      expirePost: vi.fn(async (postId: string) => {
        if (postId === 'p2') throw new Error('deadlock detected')
        return true
      }),
    })

    const report = await runDispatchSweep(d)

    expect(report.expired).toBe(2)
    expect(report.failed).toBe(1)
  })

  it('does not abort the sweep when one enqueue fails', async () => {
    const d = deps({
      listCandidates: async () => [
        candidate('p1', 10, [variant('x', 'pending')]),
        candidate('p2', 10, [variant('x', 'pending')]),
      ],
      enqueuePublish: vi.fn(async (intent: { postId: string }) => {
        if (intent.postId === 'p1') throw new Error('queue unavailable')
      }),
    })

    const report = await runDispatchSweep(d)

    expect(report.enqueued).toBe(1)
    expect(report.failed).toBe(1)
  })

  it('classifies every post against one instant, not a drifting clock', async () => {
    // A sweep that re-read the clock per post could put two posts scheduled for the same
    // second on opposite sides of the grace boundary.
    const now = vi.fn(() => NOW)
    const d = deps({
      now,
      listCandidates: async () => [
        candidate('p1', 10, [variant('x', 'pending')]),
        candidate('p2', 10, [variant('x', 'pending')]),
        candidate('p3', 10, [variant('x', 'pending')]),
      ],
    })

    await runDispatchSweep(d)

    expect(now).toHaveBeenCalledTimes(1)
  })
})

describe('runDispatchSweep — a deployment with no publish queue', () => {
  it('counts a refused enqueue separately from a failure', async () => {
    // v1 of the cron route cannot publish: there is no queue behind it, and no CAS claim
    // to make an inline publish safe under overlap. The enqueue refuses in the open, and
    // that refusal must not read as "the publish failed" - nothing was attempted.
    const d = deps({
      listCandidates: async () => [candidate('p1', 10, [variant('x', 'pending')])],
      enqueuePublish: async () => {
        throw new PublishQueueUnavailableError()
      },
    })

    const report = await runDispatchSweep(d)

    expect(report.wouldDispatch).toBe(1)
    expect(report.enqueued).toBe(0)
    expect(report.queueUnavailable).toBe(1)
    expect(report.failed).toBe(0)
  })

  it('still counts a real enqueue error as a failure', async () => {
    const d = deps({
      listCandidates: async () => [candidate('p1', 10, [variant('x', 'pending')])],
      enqueuePublish: async () => {
        throw new Error('connection terminated')
      },
    })

    const report = await runDispatchSweep(d)

    expect(report.failed).toBe(1)
    expect(report.queueUnavailable).toBe(0)
  })

  it('counts one refusal per variant, not per post', async () => {
    const d = deps({
      listCandidates: async () => [
        candidate('p1', 10, [variant('x', 'pending'), variant('gbp', 'pending')]),
      ],
      enqueuePublish: async () => {
        throw new PublishQueueUnavailableError()
      },
    })

    const report = await runDispatchSweep(d)

    expect(report.queueUnavailable).toBe(2)
  })

  it('a refused enqueue leaves the post untouched, so the next tick sees it again', async () => {
    // The dangerous shape would be marking the post somehow on refusal. It stays exactly
    // where it was: still approved, still in the gate, still due.
    const expirePost = vi.fn(async () => true)
    const settlePost = vi.fn(async () => true)
    const d = deps({
      listCandidates: async () => [candidate('p1', 10, [variant('x', 'pending')])],
      enqueuePublish: async () => {
        throw new PublishQueueUnavailableError()
      },
      expirePost,
      settlePost,
    })

    await runDispatchSweep(d)

    expect(expirePost).not.toHaveBeenCalled()
    expect(settlePost).not.toHaveBeenCalled()
  })

  it('never refuses in report mode, because report mode never enqueues', async () => {
    const enqueuePublish = vi.fn(async () => {
      throw new PublishQueueUnavailableError()
    })
    const d = deps({
      mode: 'report',
      listCandidates: async () => [candidate('p1', 10, [variant('x', 'pending')])],
      enqueuePublish,
    })

    const report = await runDispatchSweep(d)

    expect(enqueuePublish).not.toHaveBeenCalled()
    expect(report.queueUnavailable).toBe(0)
    expect(report.wouldDispatch).toBe(1)
  })
})
