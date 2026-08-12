import { describe, expect, it } from 'vitest'

import { checkRule, containsAny, findPhrase, runHardChecks } from './deterministic'
import type { Rule } from './rules'

const rule = (over: Partial<Rule> = {}): Rule => ({
  id: 'test.rule',
  tier: 'mandated',
  statement: 'A test rule.',
  source: 'packs/regime/test.md',
  ...over,
})

describe('findPhrase — boundaries', () => {
  it('matches the phrase as a word', () => {
    expect(findPhrase('We cure it', 'cure')).toBe('cure')
  })

  it.each([
    ['secure checkout', 'a longer word ending in it'],
    ['book a manicure', 'a longer word containing it'],
    ['the procedure went well', 'a longer word surrounding it'],
  ])('does not fire inside %s — %s', (text) => {
    expect(findPhrase(text, 'cure')).toBeNull()
  })

  it('matches across punctuation on either side', () => {
    expect(findPhrase('A real "cure", finally.', 'cure')).toBe('cure')
  })

  it('matches phrases that begin with punctuation, which \\b cannot', () => {
    // `\b` before `#` requires a word character to its left, so "we are #1"
    // would never match. This is why the boundary is a Unicode lookaround.
    expect(findPhrase('we are #1 in town', '#1')).toBe('#1')
    expect(findPhrase('no.1 bakery', 'no.1')).toBe('no.1')
  })

  it('does not treat a dot as a wildcard', () => {
    // `no.1` escaped correctly must not match `noX1`.
    expect(findPhrase('noX1 bakery', 'no.1')).toBeNull()
  })

  it('is case-insensitive and returns the text as written', () => {
    expect(findPhrase('A CURE for it', 'cure')).toBe('CURE')
  })

  it('relaxes internal whitespace, so a line break is not a way through', () => {
    expect(findPhrase('guaranteed\n  results', 'guaranteed results')).toBe('guaranteed\n  results')
  })

  it('holds the boundary against non-Latin script, where \\b is undefined', () => {
    // `\b` is ASCII-defined: in Devanagari every position reads as a boundary,
    // so a `\b`-based matcher fires on any substring. These must behave like
    // the Latin cases above.
    expect(findPhrase('इलाज करते हैं', 'इलाज')).toBe('इलाज')
    expect(findPhrase('इलाजगर', 'इलाज')).toBeNull()
  })

  it('ignores an empty phrase rather than matching everything', () => {
    expect(findPhrase('anything at all', '   ')).toBeNull()
  })
})

describe('checkRule — banned phrases', () => {
  it('raises a finding quoting the span that tripped it', () => {
    const finding = checkRule('100% guaranteed or your money back', {
      ...rule({ phrases: ['100% guaranteed'], rewrite: 'Say what you actually do.' }),
    })
    expect(finding).toMatchObject({
      ruleId: 'test.rule',
      layer: 'hard',
      quote: '100% guaranteed',
      rewrite: 'Say what you actually do.',
    })
  })

  it('returns null when no phrase appears', () => {
    expect(checkRule('open until eight', rule({ phrases: ['cure'] }))).toBeNull()
  })
})

describe('checkRule — required disclosures', () => {
  const disclosure = rule({
    id: 'finance.market-risk-disclosure',
    whenAnyOf: ['mutual fund', 'sip'],
    requiresOneOf: ['subject to market risk'],
  })

  it('requires the disclosure once the trigger appears', () => {
    expect(checkRule('Start a SIP with us today', disclosure)).toMatchObject({
      ruleId: 'finance.market-risk-disclosure',
      layer: 'hard',
    })
  })

  it('is satisfied when the disclosure is present', () => {
    expect(
      checkRule('Start a SIP today. Investments are subject to market risk.', disclosure),
    ).toBeNull()
  })

  it('stays out of the way of a post the rule is not about', () => {
    // The failure this pins: an unscoped disclosure rule refuses a post about
    // Sunday opening hours, and a gate that fires on everything gets switched
    // off within a week.
    expect(checkRule('The branch is shut this Sunday.', disclosure)).toBeNull()
  })

  it('requires the disclosure unconditionally when no trigger is declared', () => {
    const always = rule({ requiresOneOf: ['terms apply'] })
    expect(checkRule('Half price today', always)).not.toBeNull()
    expect(checkRule('Half price today. Terms apply.', always)).toBeNull()
  })
})

describe('runHardChecks', () => {
  const rules: Rule[] = [
    rule({ id: 'a', phrases: ['cure'] }),
    rule({ id: 'b', phrases: ['guaranteed results'] }),
    rule({ id: 'c' }),
  ]

  it('separates what it judged from what it could not', () => {
    const result = runHardChecks('a cure for everything', rules)
    expect(result.findings.map((f) => f.ruleId)).toEqual(['a'])
    // 'b' did not fire but a paraphrase could still breach it, and 'c' has
    // nothing deterministic to test at all — both are layer 3's to rule on.
    expect(result.unjudged.map((r) => r.id)).toEqual(['b', 'c'])
  })

  it('does not hand a rule it already refused to the classifier', () => {
    // Otherwise a judgement could soften a certainty.
    const result = runHardChecks('a cure for everything', rules)
    expect(result.unjudged.map((r) => r.id)).not.toContain('a')
  })

  it('leaves every rule unjudged on a clean post — a clean layer 2 is not a pass', () => {
    const result = runHardChecks('We open at eight.', rules)
    expect(result.findings).toEqual([])
    expect(result.unjudged).toHaveLength(3)
  })
})

describe('containsAny', () => {
  it('is true when one phrase appears', () => {
    expect(containsAny('read the offer document', ['offer document', 'scheme'])).toBe(true)
  })

  it('is false on an empty list', () => {
    expect(containsAny('anything', [])).toBe(false)
  })
})
