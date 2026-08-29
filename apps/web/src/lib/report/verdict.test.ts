import { describe, expect, it } from 'vitest'

import { verdictOf } from './verdict'

/**
 * THE VERDICT'S RULES, STATED AS WEEKS AND READ BACK AS SENTENCES.
 *
 * Each case here is one of the four rules the report is specified by, and the
 * two suppression rules are the ones that matter most: a verdict is the largest
 * text on the page, so a verdict issued without the evidence for it is the
 * loudest wrong thing this product can say.
 */
describe('verdictOf', () => {
  it('issues no verdict on fewer than two measured posts', () => {
    expect(
      verdictOf({
        postsMeasured: 1,
        reach: { value: 900, baseline: 100 },
        replies: { value: 40, previous: 1 },
      }),
    ).toEqual({ kind: 'none', reason: 'too-few-posts' })
  })

  it('issues no verdict without a baseline, and never calls it a flat week', () => {
    const verdict = verdictOf({
      postsMeasured: 4,
      reach: { value: 900, baseline: null },
      replies: { value: 12, previous: 10 },
    })
    expect(verdict).toEqual({ kind: 'none', reason: 'no-baseline' })
  })

  it('calls a week good when both reach and replies rose', () => {
    const verdict = verdictOf({
      postsMeasured: 4,
      reach: { value: 1340, baseline: 1000 },
      replies: { value: 18, previous: 12 },
    })
    expect(verdict.kind).toBe('good')
    if (verdict.kind === 'none') throw new Error('expected a verdict')
    expect(verdict.support).toContain('34%')
  })

  it('says a weak week directly, with no softening', () => {
    const verdict = verdictOf({
      postsMeasured: 4,
      reach: { value: 600, baseline: 1000 },
      replies: { value: 4, previous: 12 },
    })
    if (verdict.kind === 'none') throw new Error('expected a verdict')
    expect(verdict.kind).toBe('poor')
    expect(verdict.headline).toBe('A weak week.')
    // The claim: no invented cause. The product has tested none.
    expect(verdict.support).toContain('will not guess')
  })

  it('names the one thing that moved on a mixed week', () => {
    const verdict = verdictOf({
      postsMeasured: 4,
      reach: { value: 1400, baseline: 1000 },
      replies: { value: 12, previous: 12 },
    })
    if (verdict.kind === 'none') throw new Error('expected a verdict')
    expect(verdict.kind).toBe('mixed')
    expect(verdict.support).toContain('40%')
    expect(verdict.support).toContain('wrote back')
  })

  it('treats a change under a tenth as no change at all', () => {
    const verdict = verdictOf({
      postsMeasured: 4,
      reach: { value: 1050, baseline: 1000 },
      replies: { value: 12, previous: 12 },
    })
    if (verdict.kind === 'none') throw new Error('expected a verdict')
    expect(verdict.headline).toBe('A steady week.')
  })
})
