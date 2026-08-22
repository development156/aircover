import { describe, it, expect } from 'vitest'
import { creditCost } from '@sahoda/shared'

import { itemCost, previewRunCost, runCost, shortfallMessage } from './cost'

const DRAFT = creditCost('post_variants')
const RUN = creditCost('playbook_run')

const priced = (id: string, credits: number, included = true) => ({
  id,
  position: 1,
  estimated_credits: credits,
  included,
})

describe('what a run costs', () => {
  it('reads every price from pricing.config.json and never a literal', () => {
    expect(runCost()).toBe(creditCost('playbook_run'))
    expect(itemCost('post_variants', 1)).toBe(creditCost('post_variants'))
  })

  it('charges NOTHING for an item at L0, because no model is called', () => {
    // At L0 the item IS the suggestion. A preview quoting a price there would be
    // quoting for work nobody does.
    expect(itemCost('post_variants', 0)).toBe(0)
    expect(itemCost('post_variants', 1)).toBeGreaterThan(0)
    expect(itemCost('post_variants', 2)).toBe(itemCost('post_variants', 1))
  })

  it('counts the run charge in the total and keeps it out of the line total', () => {
    const p = previewRunCost([priced('a', DRAFT), priced('b', DRAFT)], 100)
    expect(p.outputCredits).toBe(2 * DRAFT)
    expect(p.runCredits).toBe(RUN)
    expect(p.totalCredits).toBe(2 * DRAFT + RUN)
    expect(p.includedCount).toBe(2)
  })

  it('drops a trimmed line out of the total and counts it as excluded', () => {
    const p = previewRunCost([priced('a', DRAFT), priced('b', DRAFT, false)], 100)
    expect(p.outputCredits).toBe(DRAFT)
    expect(p.excludedCount).toBe(1)
  })

  it('is short when the total exceeds the balance, and says by how much', () => {
    const p = previewRunCost([priced('a', DRAFT)], 1)
    expect(p.short).toBe(true)
    expect(p.shortBy).toBe(DRAFT + RUN - 1)
  })

  it('is never short when the balance could not be read', () => {
    // A balance that cannot be read is NOT zero. Refusing on an unreadable
    // balance would tell a funded customer they have no credits.
    const p = previewRunCost([priced('a', DRAFT)], null)
    expect(p.short).toBe(false)
    expect(p.shortBy).toBe(0)
  })

  it('never reports a negative shortfall', () => {
    expect(previewRunCost([priced('a', DRAFT)], 1000).shortBy).toBe(0)
  })
})

describe('the refusal, in words', () => {
  it('says "1 credit" on BOTH halves when both numbers are one', () => {
    // The branch a funded workspace never reaches, and where a peer lane shipped
    // "needs 1 credits". Neither half is reachable at one from the component, so
    // the string is pinned here, where it is built.
    expect(shortfallMessage(1, 1)).toBe(
      'This run needs 1 credit and your workspace has 1 credit. Nothing was charged.',
    )
  })

  it('says "credits" when the number is not one, including zero', () => {
    expect(shortfallMessage(8, 0)).toBe(
      'This run needs 8 credits and your workspace has 0 credits. Nothing was charged.',
    )
  })

  it('always states that nothing was charged', () => {
    for (const [needed, available] of [
      [1, 0],
      [8, 3],
      [100, 99],
    ] as const) {
      expect(shortfallMessage(needed, available)).toMatch(/Nothing was charged\./)
    }
  })
})
