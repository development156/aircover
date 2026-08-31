import { describe, expect, it, vi } from 'vitest'

import { AUTOPILOT_REFUSALS } from '@/lib/loop/autopilot-refusals'
import { AUTOPILOT_LEVEL, type AutopilotCandidate, type AutopilotWorld } from './decide'
import type { AnnouncedPost } from './dispatch-due'
import { runAutopilotTick, type AutopilotTickDeps } from './run'
import type { DecisionRow } from './store'

/**
 * ── WHAT THIS FILE CANNOT SEE ────────────────────────────────────────────────
 * The write and the publish are both injected, so this proves WHICH rows the
 * tick decides to write and in WHAT ORDER it does the two things that must not
 * be swapped. It does not prove the rows reach Postgres — the pglite suite owns
 * that — and it does not prove a post reaches a platform. Nothing here, and
 * nothing in the product, reads `dispatched` as a claim about a platform.
 */

const NOW = new Date('2026-08-29T10:00:00.000Z')

const CONFIRMED_BRAIN = {
  field_meta: {
    'hook.core_promise': { confirmed: true },
    'customer_persona.primary_pain_point': { confirmed: true },
    'voice.descriptor': { confirmed: true },
    'taboo.red_lines': { confirmed: true },
  },
}

function candidate(over: Partial<AutopilotCandidate> = {}): AutopilotCandidate {
  return {
    postId: 'post-1',
    variantId: 'variant-1',
    channel: 'x',
    accountId: 'acct-1',
    briefId: null,
    cycleId: null,
    gateFlagged: false,
    fitsChannel: true,
    costCredits: 10,
    ...over,
  }
}

function announced(over: Partial<AnnouncedPost> = {}): AnnouncedPost {
  return {
    postId: 'due-1',
    variantId: 'variant-9',
    channel: 'x',
    accountId: 'acct-1',
    dispatchAfter: new Date('2026-08-29T09:30:00.000Z'),
    ...over,
  }
}

function world(over: Partial<AutopilotWorld> = {}): AutopilotWorld {
  return {
    now: NOW,
    levelFor: () => AUTOPILOT_LEVEL,
    brainPayload: CONFIRMED_BRAIN,
    dailyCap: 3,
    publishedToday: 0,
    cancelMinutes: 30,
    weeklyBudgetRemaining: 1000,
    ...over,
  }
}

function harness(over: Partial<AutopilotTickDeps> = {}) {
  const written: DecisionRow[] = []
  const published: AnnouncedPost[] = []
  const order: string[] = []
  const deps: AutopilotTickDeps = {
    workspaceId: 'ws-1',
    world: world(),
    candidates: [],
    pending: [],
    due: { now: NOW, levelFor: () => AUTOPILOT_LEVEL, killed: false },
    write: async (row) => {
      written.push(row)
      order.push(`write:${row.decision}:${row.postId}`)
      return 'row-id'
    },
    publish: async (post) => {
      published.push(post)
      order.push(`publish:${post.postId}`)
    },
    ...over,
  }
  return { deps, written, published, order }
}

describe('phase one — every candidate produces exactly one row', () => {
  it('writes an announcement with the window on it', async () => {
    const h = harness({ candidates: [candidate()] })
    const report = await runAutopilotTick(h.deps)
    expect(report.announced).toBe(1)
    expect(h.written).toHaveLength(1)
    expect(h.written[0]).toMatchObject({ decision: 'announced', postId: 'post-1' })
    expect(h.written[0]?.dispatchAfter?.toISOString()).toBe('2026-08-29T10:30:00.000Z')
  })

  it('writes a refusal that names the guardrail, never a bare refusal', async () => {
    const h = harness({ candidates: [candidate({ gateFlagged: true })] })
    const report = await runAutopilotTick(h.deps)
    expect(report.refused).toBe(1)
    expect(h.written[0]).toMatchObject({
      decision: 'refused',
      refusalReason: AUTOPILOT_REFUSALS.REFUSAL_GATE,
    })
    expect(h.written[0]?.dispatchAfter ?? null).toBeNull()
  })

  it('carries the brief and the cycle onto the row, so it can say what it acted on', async () => {
    const h = harness({
      candidates: [candidate({ briefId: 'brief-1', cycleId: 'cycle-1' })],
    })
    await runAutopilotTick(h.deps)
    expect(h.written[0]).toMatchObject({ briefId: 'brief-1', cycleId: 'cycle-1' })
  })

  it('counts refusals by reason, so a tick can be read without the rows', async () => {
    const h = harness({
      candidates: [
        candidate({ postId: 'a', gateFlagged: true }),
        candidate({ postId: 'b', gateFlagged: true }),
        candidate({ postId: 'c', fitsChannel: false }),
      ],
    })
    const report = await runAutopilotTick(h.deps)
    expect(report.refusalsByReason).toEqual({ REFUSAL_GATE: 2, CONSTRAINT_ENGINE: 1 })
  })

  it('announces nothing and writes nothing on an empty tick', async () => {
    const h = harness()
    const report = await runAutopilotTick(h.deps)
    expect(h.written).toHaveLength(0)
    expect(report).toMatchObject({ announced: 0, refused: 0, dispatched: 0 })
  })
})

describe('phase two — the row is written BEFORE the publish is attempted', () => {
  it('writes dispatched, then publishes, in that order', async () => {
    const h = harness({ pending: [announced()] })
    await runAutopilotTick(h.deps)
    expect(h.order).toEqual(['write:dispatched:due-1', 'publish:due-1'])
  })

  it('the row stands when the publish throws, and the tick carries on', async () => {
    const h = harness({
      pending: [announced({ postId: 'due-1' }), announced({ postId: 'due-2' })],
      publish: async (post) => {
        if (post.postId === 'due-1') throw new Error('adapter exploded')
      },
    })
    const report = await runAutopilotTick(h.deps)
    expect(report.publishFailed).toBe(1)
    expect(report.dispatched).toBe(2)
    expect(h.written.map((r) => r.postId)).toEqual(['due-1', 'due-2'])
  })

  it('one poison post never strands the ones behind it', async () => {
    const publish = vi.fn(async () => {
      throw new Error('every publish fails')
    })
    const h = harness({
      pending: [announced({ postId: 'a' }), announced({ postId: 'b' }), announced({ postId: 'c' })],
      publish,
    })
    const report = await runAutopilotTick(h.deps)
    expect(publish).toHaveBeenCalledTimes(3)
    expect(report.publishFailed).toBe(3)
  })

  it('waits inside the window and writes nothing at all', async () => {
    const h = harness({
      pending: [announced({ dispatchAfter: new Date('2026-08-29T23:00:00.000Z') })],
    })
    const report = await runAutopilotTick(h.deps)
    expect(report.waiting).toBe(1)
    expect(h.written).toHaveLength(0)
    expect(h.published).toHaveLength(0)
  })

  it('writes a refusal when the dial moved down inside the window, and publishes nothing', async () => {
    const h = harness({
      pending: [announced()],
      due: { now: NOW, levelFor: () => 1, killed: false },
    })
    await runAutopilotTick(h.deps)
    expect(h.published).toHaveLength(0)
    expect(h.written[0]).toMatchObject({
      decision: 'refused',
      refusalReason: AUTOPILOT_REFUSALS.NOT_AUTOPILOT_CHANNEL,
    })
  })

  it('publishes nothing at all while the kill switch is on', async () => {
    const h = harness({
      pending: [announced({ postId: 'a' }), announced({ postId: 'b' })],
      due: { now: NOW, levelFor: () => AUTOPILOT_LEVEL, killed: true },
    })
    const report = await runAutopilotTick(h.deps)
    expect(h.published).toHaveLength(0)
    // Counted as cancellations, not refusals. No guardrail judged these posts.
    expect(report.cancelled).toBe(2)
    expect(report.refused).toBe(0)
    expect(h.written.every((r) => r.decision === 'cancelled')).toBe(true)
    // And no refusal_reason: the log's CHECK demands one only for `refused`,
    // and a name here is what previously made the screen blame the customer.
    expect(h.written.every((r) => !r.refusalReason)).toBe(true)
  })
})

describe('nothing goes out twice inside one tick', () => {
  it('a duplicate announcement in the same scan publishes ONCE', async () => {
    const h = harness({
      pending: [announced(), announced()],
    })
    const report = await runAutopilotTick(h.deps)
    expect(h.published.map((p) => p.postId)).toEqual(['due-1'])
    expect(report.dispatched).toBe(1)
    expect(report.waiting).toBe(1)
  })

  it('two variants of the same post are two different posts, and both go', async () => {
    const h = harness({
      pending: [announced({ variantId: 'v1' }), announced({ variantId: 'v2' })],
    })
    const report = await runAutopilotTick(h.deps)
    expect(report.dispatched).toBe(2)
    expect(h.published).toHaveLength(2)
  })
})

describe('the two phases in one tick', () => {
  it('an announcement made now is NOT dispatched by the same tick that made it', async () => {
    const h = harness({ candidates: [candidate()], pending: [] })
    const report = await runAutopilotTick(h.deps)
    expect(report.announced).toBe(1)
    expect(report.dispatched).toBe(0)
    expect(h.published).toHaveLength(0)
  })

  it('phase one refusals and phase two dispatches are counted apart', async () => {
    const h = harness({
      candidates: [candidate({ postId: 'new-1', gateFlagged: true })],
      pending: [announced()],
    })
    const report = await runAutopilotTick(h.deps)
    expect(report).toMatchObject({ announced: 0, refused: 1, dispatched: 1 })
  })
})
