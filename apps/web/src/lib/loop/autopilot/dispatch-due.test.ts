import { describe, expect, it } from 'vitest'

import { AUTOPILOT_REFUSALS } from '@/lib/loop/autopilot-refusals'
import { AUTOPILOT_LEVEL } from './decide'
import { decideDue, decideDueBatch, type AnnouncedPost, type DueWorld } from './dispatch-due'

/**
 * ── WHAT THIS FILE CANNOT SEE ────────────────────────────────────────────────
 * It proves which announced posts MAY go out. It does not prove that one
 * actually does, that the adapter is reached, or that the publish succeeded —
 * `decision = 'dispatched'` is not a claim about the platform and the log's own
 * header says so. A dispatcher that decided perfectly and called nothing would
 * pass every test here.
 */

const NOW = new Date('2026-08-29T10:00:00.000Z')

function announced(over: Partial<AnnouncedPost> = {}): AnnouncedPost {
  return {
    postId: 'post-1',
    variantId: 'variant-1',
    channel: 'x',
    accountId: 'acct-1',
    dispatchAfter: new Date('2026-08-29T09:30:00.000Z'),
    ...over,
  }
}

function world(over: Partial<DueWorld> = {}): DueWorld {
  return {
    now: NOW,
    levelFor: () => AUTOPILOT_LEVEL,
    isCancelled: () => false,
    alreadyDispatched: () => false,
    killed: false,
    ...over,
  }
}

describe('decideDue — the window', () => {
  it('dispatches a post whose window has closed', () => {
    expect(decideDue(announced(), world()).kind).toBe('dispatch')
  })

  it('WAITS while the window is still open', () => {
    const post = announced({ dispatchAfter: new Date('2026-08-29T10:30:00.000Z') })
    expect(decideDue(post, world())).toMatchObject({
      kind: 'wait',
      reason: AUTOPILOT_REFUSALS.INSIDE_CANCEL_WINDOW,
    })
  })

  it('dispatches at the exact instant the window closes, not a tick later', () => {
    const post = announced({ dispatchAfter: NOW })
    expect(decideDue(post, world()).kind).toBe('dispatch')
  })

  it('waits one millisecond before that instant', () => {
    const post = announced({ dispatchAfter: new Date(NOW.getTime() + 1) })
    expect(decideDue(post, world())).toMatchObject({
      kind: 'wait',
      reason: AUTOPILOT_REFUSALS.INSIDE_CANCEL_WINDOW,
    })
  })
})

describe('decideDue — nothing goes out twice', () => {
  it('NEVER dispatches a post already dispatched, however overdue it is', () => {
    const post = announced({ dispatchAfter: new Date('2020-01-01T00:00:00.000Z') })
    expect(decideDue(post, world({ alreadyDispatched: () => true }))).toMatchObject({
      kind: 'wait',
      reason: 'already-dispatched',
    })
  })

  it('checks the post AND the variant, so a sibling variant is not mistaken for it', () => {
    const seen = new Set(['post-1:variant-1'])
    const w = world({ alreadyDispatched: (p, v) => seen.has(`${p}:${v}`) })
    expect(decideDue(announced({ variantId: 'variant-1' }), w).kind).toBe('wait')
    expect(decideDue(announced({ variantId: 'variant-2' }), w).kind).toBe('dispatch')
  })
})

describe('decideDue — a person stopped it', () => {
  it('does not dispatch a cancelled post', () => {
    expect(decideDue(announced(), world({ isCancelled: () => true }))).toMatchObject({
      kind: 'wait',
      reason: AUTOPILOT_REFUSALS.CANCELLED,
    })
  })

  it('the cancellation outranks the window having closed', () => {
    const post = announced({ dispatchAfter: new Date('2020-01-01T00:00:00.000Z') })
    expect(decideDue(post, world({ isCancelled: () => true })).kind).not.toBe('dispatch')
  })
})

describe('decideDue — the world can change inside the window', () => {
  it('REFUSES when the customer turned the dial down after the announcement', () => {
    expect(decideDue(announced(), world({ levelFor: () => 2 }))).toMatchObject({
      kind: 'refuse',
      reason: AUTOPILOT_REFUSALS.NOT_AUTOPILOT_CHANNEL,
    })
  })

  it('REFUSES when the dial row was removed entirely', () => {
    expect(decideDue(announced(), world({ levelFor: () => undefined }))).toMatchObject({
      kind: 'refuse',
      reason: AUTOPILOT_REFUSALS.NOT_AUTOPILOT_CHANNEL,
    })
  })

  it('CANCELS everything while the kill switch is on — it does not refuse it', () => {
    // Retargeted, not weakened. The guarantee is unchanged: nothing goes out.
    // What changed is how it is recorded. A refusal row carries a guardrail's
    // name, and rendering `CANCELLED` as a refusal made the screen say "You
    // stopped this post" to a customer who had not touched it. The kill switch
    // withdraws permission, which is a cancellation, and a cancellation's
    // explanation is the ACTOR column.
    const post = announced({ dispatchAfter: new Date('2020-01-01T00:00:00.000Z') })
    expect(decideDue(post, world({ killed: true }))).toMatchObject({ kind: 'cancel' })
  })

  it('the kill switch outranks an armed channel and a closed window together', () => {
    const decision = decideDue(
      announced({ dispatchAfter: new Date('2020-01-01T00:00:00.000Z') }),
      world({ killed: true, levelFor: () => AUTOPILOT_LEVEL }),
    )
    expect(decision.kind).toBe('cancel')
    expect(decision.kind).not.toBe('dispatch')
  })

  it('does not re-refuse a post already dispatched, even under the kill switch', () => {
    const decision = decideDue(announced(), world({ killed: true, alreadyDispatched: () => true }))
    expect(decision).toMatchObject({ kind: 'wait', reason: 'already-dispatched' })
  })
})

describe('decideDueBatch', () => {
  it('decides every row, in order', () => {
    const rows = [
      announced({ postId: 'a' }),
      announced({ postId: 'b', dispatchAfter: new Date('2026-08-29T23:00:00.000Z') }),
      announced({ postId: 'c' }),
    ]
    const decisions = decideDueBatch(rows, world())
    expect(decisions.map((d) => d.kind)).toEqual(['dispatch', 'wait', 'dispatch'])
    expect(decisions.map((d) => d.post.postId)).toEqual(['a', 'b', 'c'])
  })

  it('an empty scan dispatches nothing and throws nothing', () => {
    expect(decideDueBatch([], world())).toEqual([])
  })
})
