import { describe, expect, it } from 'vitest'
import { DowngradeImpactSchema, getEntitlements } from '@sahoda/shared'
import { downgradeImpact, overLimitSentence, type WorkspaceUsage } from './downgradeImpact'

const EFFECTIVE = new Date('2026-09-01T00:00:00.000Z')

const usage = (over: Partial<WorkspaceUsage> = {}): WorkspaceUsage => ({
  channels: 0,
  sites: 0,
  seats: 1,
  ...over,
})

describe('downgradeImpact', () => {
  it('names every dimension that is over, with the counted value and the new limit', () => {
    // Growth allows 8 channels / 3 sites / 3 seats; Starter allows 4 / 1 / 1.
    const impact = downgradeImpact({
      toPlanId: 'starter',
      effectiveAt: EFFECTIVE,
      usage: usage({ channels: 6, sites: 2, seats: 3 }),
    })
    expect(impact.over).toEqual([
      { dimension: 'channels', have: 6, allowed: 4 },
      { dimension: 'sites', have: 2, allowed: 1 },
      { dimension: 'seats', have: 3, allowed: 1 },
    ])
    expect(DowngradeImpactSchema.parse(impact)).toEqual(impact)
  })

  it('reports nothing when the workspace already fits', () => {
    const impact = downgradeImpact({
      toPlanId: 'starter',
      effectiveAt: EFFECTIVE,
      usage: usage({ channels: 2, sites: 1, seats: 1 }),
    })
    expect(impact.over).toEqual([])
    expect(impact.blocksNewCreates).toBe(false)
    // No banner at all, rather than a reassuring one.
    expect(overLimitSentence(impact)).toBeNull()
  })

  it('being exactly AT the limit is not over it', () => {
    const limits = getEntitlements('starter')
    const impact = downgradeImpact({
      toPlanId: 'starter',
      effectiveAt: EFFECTIVE,
      usage: { channels: limits.channels, sites: limits.sites, seats: limits.seats },
    })
    expect(impact.over).toEqual([])
  })

  it('never deletes anything — the guarantee is in the contract, not in the copy', () => {
    const impact = downgradeImpact({
      toPlanId: 'free',
      effectiveAt: EFFECTIVE,
      usage: usage({ channels: 8, sites: 10, seats: 10 }),
    })
    expect(impact.nothingIsDeleted).toBe(true)
    // Free allows no sites at all, which is the harshest case in the catalog.
    expect(impact.over).toContainEqual({ dimension: 'sites', have: 10, allowed: 0 })
    expect(overLimitSentence(impact)).toMatch(/Nothing is removed/)
  })

  it('blocks new creates exactly when something is over, and not otherwise', () => {
    const over = downgradeImpact({
      toPlanId: 'free',
      effectiveAt: EFFECTIVE,
      usage: usage({ channels: 3 }),
    })
    expect(over.blocksNewCreates).toBe(true)
    const under = downgradeImpact({
      toPlanId: 'free',
      effectiveAt: EFFECTIVE,
      usage: usage({ channels: 1 }),
    })
    expect(under.blocksNewCreates).toBe(false)
  })
})

describe('overLimitSentence', () => {
  it('reads as a sentence for one, two and three dimensions', () => {
    const one = downgradeImpact({
      toPlanId: 'starter',
      effectiveAt: EFFECTIVE,
      usage: usage({ channels: 5 }),
    })
    expect(overLimitSentence(one)).toMatch(/^You have 5 of 4 channels\./)

    const two = downgradeImpact({
      toPlanId: 'starter',
      effectiveAt: EFFECTIVE,
      usage: usage({ channels: 5, sites: 2 }),
    })
    expect(overLimitSentence(two)).toMatch(/^You have 5 of 4 channels and 2 of 1 sites\./)

    const three = downgradeImpact({
      toPlanId: 'starter',
      effectiveAt: EFFECTIVE,
      usage: usage({ channels: 5, sites: 2, seats: 4 }),
    })
    expect(overLimitSentence(three)).toMatch(
      /^You have 5 of 4 channels, 2 of 1 sites and 4 of 1 seats\./,
    )
  })

  /**
   * READ THE TEXT, NOT THE SHAPE. A sentence built by joining an array can produce
   * "You have . Nothing is removed" or a dangling "and" without any assertion on
   * `over.length` noticing. These check the rendered string end to end.
   */
  it('never renders a dangling connective or an empty subject', () => {
    for (const channels of [0, 1, 5, 99]) {
      for (const sites of [0, 1, 4]) {
        const impact = downgradeImpact({
          toPlanId: 'starter',
          effectiveAt: EFFECTIVE,
          usage: usage({ channels, sites }),
        })
        const sentence = overLimitSentence(impact)
        if (sentence === null) continue
        expect(sentence).not.toMatch(/You have \./)
        expect(sentence).not.toMatch(/ and \./)
        expect(sentence).not.toMatch(/, \./)
        expect(sentence).not.toMatch(/undefined/)
      }
    }
  })
})
