import { describe, expect, it } from 'vitest'

import { isUsableRefusal, MAX_REFUSAL_CHARS, refusalToRule } from './refusal'

describe('refusalToRule', () => {
  it.each([
    ["we won't call it homemade if we didn't make the base", 'Never call it homemade'],
    ['We will not run another brand campaign line for line', 'Never run another brand'],
    ["I don't post patient photos without consent", 'Never post patient photos'],
    ['we never guarantee an outcome', 'Never guarantee an outcome'],
    ['Do not hide genuine reviews', 'Never hide genuine reviews'],
  ])('puts %s in the imperative', (input, expected) => {
    const { rule, transformed } = refusalToRule(input)

    expect(transformed).toBe(true)
    expect(rule.startsWith(expected)).toBe(true)
    expect(rule).toMatch(/[.!?]$/)
  })

  it('keeps their own words when it does not recognise an opener', () => {
    // Rewriting this into a template would read back something they did not
    // say, which is worse than a rule that reads slightly unevenly.
    const { rule, transformed } = refusalToRule('nothing goes out before consent is in hand')

    expect(transformed).toBe(false)
    expect(rule).toBe('Nothing goes out before consent is in hand.')
  })

  it('does not strip an opener that would leave no verb', () => {
    // "no discounts on wedding cakes" must not become "Never discounts on ...".
    const { rule, transformed } = refusalToRule('no discounts on wedding cakes, ever')

    expect(transformed).toBe(false)
    expect(rule).toBe('No discounts on wedding cakes, ever.')
  })

  it('does not fire an opener inside a word', () => {
    const { transformed } = refusalToRule('nobody sees a draft before the client does')

    expect(transformed).toBe(false)
  })

  it('keeps existing punctuation rather than doubling it', () => {
    expect(refusalToRule('we do not guarantee results.').rule).toMatch(/results\.$/)
    expect(refusalToRule('we do not guarantee results!').rule).toMatch(/results!$/)
  })

  it('collapses whitespace and caps length', () => {
    const long = `we will not ${'x'.repeat(MAX_REFUSAL_CHARS * 2)}`
    const { rule } = refusalToRule(long)

    expect(rule.length).toBeLessThanOrEqual(MAX_REFUSAL_CHARS + 2)
    expect(refusalToRule('we  will   not\n\nshout').rule).toBe('Never shout.')
  })

  it('is empty on empty input rather than producing a bare Never', () => {
    expect(refusalToRule('').rule).toBe('')
    expect(refusalToRule('   ').rule).toBe('')
    expect(refusalToRule(undefined as unknown as string).rule).toBe('')
  })
})

describe('isUsableRefusal', () => {
  it('rejects a shrug', () => {
    expect(isUsableRefusal('')).toBe(false)
    expect(isUsableRefusal('dunno')).toBe(false)
    expect(isUsableRefusal('   nope   ')).toBe(false)
  })

  it('accepts a real answer', () => {
    expect(isUsableRefusal('we will not say homemade')).toBe(true)
  })
})
