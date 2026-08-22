import { describe, expect, test } from 'vitest'
import { creditCost } from '@sahoda/shared'

import { REMIX_KINDS } from './catalogue'
import {
  BATCH_ACTION,
  actionForKind,
  chargeTotal,
  plannedCharges,
  previewBatch,
  type PricedDerivative,
} from './cost'

/**
 * THE PREVIEW AND THE CHARGE ARE THE SAME NUMBER.
 *
 * That is the property this file exists for, and it is asserted over every
 * combination of kinds rather than over one example — a preview that agrees with
 * the runner on the case somebody happened to write down is not a guarantee.
 *
 * Every figure below is read from `creditCost()`. There is no literal price in
 * this file for the reason `lib/loop/cost.ts` gives: pinning one would make the
 * test the second place a price lives, and it would then pass while the config
 * and the screen disagreed.
 */

let counter = 0
function derivative(kind: PricedDerivative['kind'], included = true): PricedDerivative {
  counter += 1
  return { id: `d${counter}`, kind, included }
}

describe('previewBatch', () => {
  test('an empty batch still names the batch fee, and nothing else', () => {
    const cost = previewBatch([])
    expect(cost.lines).toEqual([])
    expect(cost.derivativeCredits).toBe(0)
    expect(cost.batchCredits).toBe(creditCost(BATCH_ACTION))
    expect(cost.totalCredits).toBe(creditCost(BATCH_ACTION))
  })

  test.each(REMIX_KINDS.map((k) => [k.kind, k.kind] as const))(
    'adding a channel to %s adds a draft and NOT a credit',
    (kind) => {
      // The trap `lib/loop/cost.ts` names, asserted for every kind rather than
      // for the one that happens to use content_variants: none of the frozen
      // mesh tasks takes a channel, so four channels is one call. Quoting four
      // times the real figure would push somebody to trim work they could
      // afford.
      const one = previewBatch([derivative(kind)])
      const four = previewBatch([
        derivative(kind),
        derivative(kind),
        derivative(kind),
        derivative(kind),
      ])
      expect(four.derivativeCredits).toBe(one.derivativeCredits)
      expect(four.derivativeCredits).toBe(creditCost(actionForKind(kind)))
      expect(four.lines[0]?.drafts).toBe(4)
      expect(one.lines[0]?.drafts).toBe(1)
    },
  )

  test('trimming a whole KIND is what moves the number', () => {
    const both = previewBatch([derivative('adaptation'), derivative('short')])
    const one = previewBatch([derivative('adaptation'), derivative('short', false)])
    expect(both.totalCredits - one.totalCredits).toBe(creditCost(actionForKind('short')))
  })

  test('an excluded derivative is counted, and its kind still costs its one price', () => {
    const cost = previewBatch([derivative('short'), derivative('short', false)])
    expect(cost.includedCount).toBe(1)
    expect(cost.excludedCount).toBe(1)
    expect(cost.derivativeCredits).toBe(creditCost(actionForKind('short')))
  })

  test('a kind with every draft trimmed leaves the batch entirely', () => {
    const cost = previewBatch([derivative('short', false), derivative('adaptation')])
    expect(cost.lines.map((l) => l.kind)).toEqual(['adaptation'])
  })
})

describe('the preview and the runner cannot disagree', () => {
  /** Every non-empty subset of the four kinds. 15 batches, not one example. */
  const subsets: PricedDerivative['kind'][][] = []
  const kinds = REMIX_KINDS.map((k) => k.kind)
  for (let mask = 1; mask < 1 << kinds.length; mask += 1) {
    subsets.push(kinds.filter((_, i) => (mask & (1 << i)) !== 0))
  }

  test.each(subsets.map((s) => [s.join('+'), s] as const))(
    'the charges for %s sum to exactly what the preview quoted',
    (_name, chosen) => {
      // Two channels' worth of every chosen kind, so the one-call collapse is
      // actually exercised rather than being trivially true at a count of one.
      const derivatives = chosen.flatMap((kind) => [derivative(kind), derivative(kind)])
      expect(chargeTotal(plannedCharges(derivatives))).toBe(previewBatch(derivatives).totalCredits)
    },
  )

  test('the batch fee is charged once, first, and covers no derivative', () => {
    const charges = plannedCharges([derivative('short'), derivative('adaptation')])
    expect(charges.filter((c) => c.action === BATCH_ACTION)).toHaveLength(1)
    expect(charges[0]?.action).toBe(BATCH_ACTION)
    expect(charges[0]?.derivativeIds).toEqual([])
  })

  test('a kind produces ONE charge naming every draft it covers', () => {
    const a = derivative('adaptation')
    const b = derivative('adaptation')
    const charges = plannedCharges([a, b]).filter((c) => c.kind === 'adaptation')
    expect(charges).toHaveLength(1)
    expect(charges[0]?.derivativeIds).toEqual([a.id, b.id])
  })

  test('an excluded derivative is never charged for', () => {
    const kept = derivative('short')
    const trimmed = derivative('short', false)
    const ids = plannedCharges([kept, trimmed]).flatMap((c) => c.derivativeIds)
    expect(ids).toEqual([kept.id])
  })
})

describe('there is no price in this module', () => {
  test('every figure moves when the price list moves', () => {
    // The mutation the assets lane's LOCKING_POST_STATUSES defect taught: a test
    // built from the same call it is checking passes under any value. This one
    // is built from `creditCost`, so it asserts the RELATIONSHIP — that the
    // total is the batch fee plus the lines — rather than a number.
    const derivatives = [derivative('adaptation'), derivative('short'), derivative('thread')]
    const cost = previewBatch(derivatives)
    expect(cost.totalCredits).toBe(cost.batchCredits + cost.derivativeCredits)
    expect(cost.derivativeCredits).toBe(cost.lines.reduce((s, l) => s + l.credits, 0))
    for (const line of cost.lines) expect(line.credits).toBe(creditCost(line.action))
  })
})
