import { describe, expect, it } from 'vitest'
import type { Connection } from '@sahoda/shared'

import { groupByPlatform, hasHeadroom, slotSentence, slotsLeft } from './slots'

/** Only the fields these functions read. The rest of the row is irrelevant here. */
function row(platform: string, id: string): Connection {
  return {
    id,
    workspace_id: 'ws-1',
    platform,
    status: 'active',
    external_account: { id },
    scopes: null,
    expires_at: null,
    last_checked_at: null,
    created_by: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  } as unknown as Connection
}

describe('a slot holds one account, not one platform', () => {
  it('four Instagram accounts are four slots, not one', () => {
    const usage = { used: 4, limit: 4 }
    expect(slotsLeft(usage)).toBe(0)
    expect(hasHeadroom(usage)).toBe(false)
    // The claim that matters: the count is of ACCOUNTS. If this ever reads 1 for
    // four accounts on one platform, the plan is being given away three times.
    expect(slotSentence(usage)).toBe('Every slot on your plan is in use.')
  })

  it('groups every account under its platform and keeps them all', () => {
    const grouped = groupByPlatform([
      row('instagram', 'a'),
      row('instagram', 'b'),
      row('linkedin', 'c'),
    ])

    // THE DEFECT THIS PINS: a Map keyed by platform holding ONE row silently
    // dropped account `a`. Length, not truthiness — `.get()` returning something
    // is what the broken version also did.
    expect(grouped.get('instagram')).toHaveLength(2)
    expect(grouped.get('instagram')?.map((c) => c.id)).toEqual(['a', 'b'])
    expect(grouped.get('linkedin')).toHaveLength(1)
  })

  it('keeps accounts oldest first, matching how a platform-shaped read resolves', () => {
    // `accountForWorkspace` orders by created_at ascending and takes the first, so
    // the account at the top of the card is the account /analytics is about. If
    // this order flips, the screen and the analytics page disagree in silence.
    const grouped = groupByPlatform([row('instagram', 'older'), row('instagram', 'newer')])
    expect(grouped.get('instagram')?.[0].id).toBe('older')
  })
})

describe('an unknown limit is never rendered as a number', () => {
  it('has no headroom and no remainder', () => {
    // Fail closed. `limit: null` means the plan read did not answer, and admitting
    // an account on a question nobody answered is the unbounded-channels hole.
    expect(hasHeadroom({ used: 0, limit: null })).toBe(false)
    expect(slotsLeft({ used: 0, limit: null })).toBeNull()
  })

  it('says we could not check, and never prints a fraction', () => {
    const sentence = slotSentence({ used: 2, limit: null })
    expect(sentence).toMatch(/could not check/i)
    // The forbidden claim, not the wording: no denominator may be invented here.
    expect(sentence).not.toMatch(/\d+\s+slots? left/i)
  })
})

describe('holding more than the plan allows is a downgrade, not an error', () => {
  it('never renders a negative remainder', () => {
    expect(slotsLeft({ used: 6, limit: 4 })).toBe(0)
  })

  it('says nothing was disconnected, because nothing was', () => {
    const sentence = slotSentence({ used: 6, limit: 4 })
    expect(sentence).toMatch(/nothing was disconnected/i)
    // Must NOT claim slots are left when the customer is over.
    expect(sentence).not.toMatch(/slots? left/i)
  })
})

describe('the ordinary cases', () => {
  it('counts down to one slot in the singular', () => {
    expect(slotSentence({ used: 3, limit: 4 })).toBe('1 slot left.')
    expect(slotSentence({ used: 2, limit: 4 })).toBe('2 slots left.')
  })

  it('has headroom only while used is below the limit', () => {
    expect(hasHeadroom({ used: 3, limit: 4 })).toBe(true)
    expect(hasHeadroom({ used: 4, limit: 4 })).toBe(false)
    expect(hasHeadroom({ used: 5, limit: 4 })).toBe(false)
  })
})
