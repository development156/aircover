import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { creditCost } from '@sahoda/shared'

import { previewCost, trimToBudget, briefCost, cycleCost, type PricedBrief } from './cost'

const brief = (id: string, priority: number, included = true): PricedBrief => ({
  id,
  priority,
  estimated_credits: briefCost(),
  included,
})

describe('the cost preview', () => {
  it('takes every price from pricing.config.json and never from a literal', () => {
    // Read as source: a numeric literal in this module would be a second source
    // of truth for money, and the ledger and the preview would disagree the
    // first time a price moved.
    const src = readFileSync(resolve(import.meta.dirname, 'cost.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    // The only digits left in code should be the `10`s of no rounding here at
    // all — assert there are none rather than allow-listing.
    expect(code).not.toMatch(/=\s*\d+\s*$/m)
    expect(cycleCost()).toBe(creditCost('loop_cycle'))
    expect(briefCost()).toBe(creditCost('post_variants'))
  })

  it('prices a brief ONCE, not once per channel', () => {
    // generateVariants takes one flat charge and produces every channel's
    // variant in one call. Pricing per channel would quote four times the real
    // figure and push people to trim work they could afford.
    expect(briefCost()).toBe(creditCost('post_variants'))
  })

  it('separates what is about to be spent from what the week has cost', () => {
    const p = previewCost([brief('a', 1), brief('b', 2)], null)
    expect(p.creationCredits).toBe(briefCost() * 2)
    expect(p.orchestrationCredits).toBe(cycleCost())
    expect(p.totalCredits).toBe(briefCost() * 2 + cycleCost())
    // Folding these together would make the approve button appear to charge for
    // something already charged.
    expect(p.creationCredits).not.toBe(p.totalCredits)
  })

  it('counts only the included briefs', () => {
    const p = previewCost([brief('a', 1), brief('b', 2, false), brief('c', 3)], null)
    expect(p.includedCount).toBe(2)
    expect(p.excludedCount).toBe(1)
    expect(p.creationCredits).toBe(briefCost() * 2)
  })

  it('measures the budget against what is LEFT after the orchestration charge', () => {
    // A 150-credit week that has already spent 20 has 130 left, not 150.
    const budget = cycleCost() + briefCost() * 2
    const two = previewCost([brief('a', 1), brief('b', 2)], budget)
    expect(two.overBudget).toBe(false)
    const three = previewCost([brief('a', 1), brief('b', 2), brief('c', 3)], budget)
    expect(three.overBudget).toBe(true)
    expect(three.overBy).toBe(briefCost())
  })

  it('never reports a negative overrun', () => {
    const p = previewCost([brief('a', 1)], 10_000)
    expect(p.overBy).toBe(0)
    expect(p.overBudget).toBe(false)
  })

  it('treats no budget as no ceiling rather than a zero one', () => {
    const p = previewCost([brief('a', 1), brief('b', 2)], null)
    expect(p.overBudget).toBe(false)
    expect(p.budgetCredits).toBeNull()
  })
})

describe('trimToBudget', () => {
  it('drops the LOWEST priority first (FSD M2)', () => {
    const budget = cycleCost() + briefCost() * 2
    const dropped = trimToBudget([brief('a', 1), brief('b', 2), brief('c', 3)], budget)
    // Priority 1 is the most important, so 3 goes first.
    expect(dropped).toEqual(['c'])
  })

  it('keeps dropping until it fits', () => {
    const budget = cycleCost() + briefCost()
    const dropped = trimToBudget(
      [brief('a', 1), brief('b', 2), brief('c', 3), brief('d', 4)],
      budget,
    )
    expect(dropped).toEqual(['d', 'c', 'b'])
  })

  it('drops nothing when the plan already fits', () => {
    expect(trimToBudget([brief('a', 1)], 10_000)).toEqual([])
  })

  it('drops nothing when there is no budget', () => {
    expect(trimToBudget([brief('a', 1), brief('b', 2)], null)).toEqual([])
  })

  it('is stable — the same plan and budget give the same suggestion twice', () => {
    const briefs = [brief('a', 2), brief('b', 2), brief('c', 2)]
    const budget = cycleCost() + briefCost()
    expect(trimToBudget(briefs, budget)).toEqual(trimToBudget(briefs, budget))
  })

  it('SUGGESTS ONLY — it returns ids and mutates nothing', () => {
    const briefs = [brief('a', 1), brief('b', 2)]
    const snapshot = JSON.parse(JSON.stringify(briefs))
    trimToBudget(briefs, cycleCost())
    // At L0-L2 the trim is a person's decision made in the preview. There is no
    // caller that trims without someone looking, because L3 does not ship.
    expect(briefs).toEqual(snapshot)
  })

  it('ignores briefs already excluded', () => {
    const dropped = trimToBudget([brief('a', 1), brief('b', 9, false)], cycleCost() + briefCost())
    expect(dropped).toEqual([])
  })
})
