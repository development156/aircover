import { describe, expect, it } from 'vitest'

import {
  assumptionNote,
  classify,
  readBack,
  refineWithDoorText,
  withOverrides,
  MAX_CLASSIFY_CHARS,
} from './classify'
import { DEFAULT_INTAKE } from './intake'

describe('classify', () => {
  it('reads all three picks out of one ordinary sentence', () => {
    const result = classify('I run a bakery in Pune')

    expect(result.intake).toEqual({ model: 'local_presence', regime: 'food', locale: 'IN' })
    expect(result.model.basis).toBe('matched')
    expect(result.regime.basis).toBe('matched')
    expect(result.locale.basis).toBe('matched')
    expect(result.regime.evidence).toContain('bakery')
  })

  it('marks every verdict assumed on blank input rather than inventing one', () => {
    const result = classify('')

    expect(result.intake).toEqual(DEFAULT_INTAKE)
    expect(result.model.basis).toBe('assumed')
    expect(result.regime.basis).toBe('assumed')
    expect(result.locale.basis).toBe('assumed')
    expect(result.model.evidence).toEqual([])
  })

  it('does not throw on null-ish input', () => {
    expect(() => classify(undefined as unknown as string)).not.toThrow()
  })

  // The boundary matcher used to be `new RegExp('\\b' + term + '\\b')`, which
  // cannot fire for a term ending in a non-ASCII letter. "café" was in the
  // table and could never match anything.
  it('matches a term ending in a non-ASCII letter', () => {
    const result = classify('a small café in Bengaluru')

    expect(result.regime.value).toBe('food')
    expect(result.regime.basis).toBe('matched')
  })

  it('matches a symbol term as a substring', () => {
    const result = classify('our tasting menu is ₹1200 per head')

    expect(result.locale.value).toBe('IN')
    expect(result.locale.basis).toBe('matched')
  })

  it('does not fire a short term inside a longer word', () => {
    // "barber" must not match inside "barbershop" — the lexicon lists both
    // precisely because the boundary check makes the shorter one silent.
    const result = classify('barbershop')

    expect(result.model.value).toBe('local_presence')
    expect(result.regime.value).toBe('beauty')
  })

  it('does not let one word repeated outweigh several different words', () => {
    // "clinic" alone: healthcare 3. "food kitchen menu": food 3+3+3.
    const repeated = classify('clinic clinic clinic clinic clinic')
    const varied = classify('our food kitchen writes a new menu weekly')

    expect(repeated.regime.value).toBe('healthcare')
    expect(varied.regime.value).toBe('food')
    expect(varied.regime.evidence.length).toBeGreaterThan(1)
  })

  it('falls back rather than pick a winner from a dead heat', () => {
    // "salon" scores beauty 3; "bakery" scores food 3. Neither should be
    // presented as read out of the sentence.
    const result = classify('a salon next door to a bakery')

    expect(result.regime.value).toBe(DEFAULT_INTAKE.regime)
    expect(result.regime.basis).toBe('assumed')
  })

  it('classifies the three shapes the flow is specified around', () => {
    expect(classify('a family restaurant in Jaipur').intake).toMatchObject({
      model: 'local_presence',
      regime: 'food',
    })
    expect(classify('a freelance consultant helping D2C shoppers').model.value).toBe('service')
    expect(classify('a 200-bed hospital trust in Hyderabad').intake).toMatchObject({
      model: 'institution',
      regime: 'healthcare',
      locale: 'IN',
    })
  })

  it('reads locale from currency and regulator words, not just place names', () => {
    expect(classify('we file GST every quarter').locale.value).toBe('IN')
    expect(classify('priced in dollars, FDA registered').locale.value).toBe('US')
  })

  it('slices very long input instead of scanning all of it', () => {
    const padding = 'x'.repeat(MAX_CLASSIFY_CHARS)
    const result = classify(`${padding} bakery`)

    // "bakery" sits past the cap, so it is genuinely not read — the point is
    // that the classifier stays bounded, and says it assumed.
    expect(result.regime.basis).toBe('assumed')
  })
})

describe('readBack', () => {
  it('states the three picks as one plain sentence', () => {
    expect(readBack(classify('I run a bakery in Pune'))).toBe(
      "You're a local presence in food, in India.",
    )
  })
})

describe('withOverrides', () => {
  it('keeps a hand-picked value when the text says otherwise', () => {
    // The bug this exists to stop: the user corrects "food" to "beauty", types
    // one more word, and the lexicon silently puts it back to "food".
    const result = withOverrides(classify('I run a bakery in Pune'), { regime: 'beauty' })

    expect(result.intake.regime).toBe('beauty')
    expect(result.regime.basis).toBe('chosen')
    // Fields they did not touch still track the text.
    expect(result.intake.model).toBe('local_presence')
    expect(result.model.basis).toBe('matched')
  })

  it('takes a chosen field out of the assumption note', () => {
    const blank = classify('')
    expect(assumptionNote(blank)).toMatch(/could not read/)

    const chosen = withOverrides(blank, { model: 'platform', regime: 'finance', locale: 'SG' })
    expect(assumptionNote(chosen)).toBeNull()
  })

  it('is a no-op with no overrides', () => {
    const original = classify('I run a bakery in Pune')

    expect(withOverrides(original, {})).toEqual(original)
  })
})

describe('assumptionNote', () => {
  it('is silent when all three were read from the words', () => {
    expect(assumptionNote(classify('I run a bakery in Pune'))).toBeNull()
  })

  it('says so when nothing could be read', () => {
    expect(assumptionNote(classify(''))).toMatch(/could not read/)
  })

  it('names only the fields it guessed', () => {
    // A place people come to, no sector or country named.
    const note = assumptionNote(classify('we have a showroom with good footfall'))

    expect(note).toMatch(/your sector/)
    expect(note).toMatch(/where you are/)
    expect(note).not.toMatch(/what you are/)
  })
})

/**
 * THE WRONG QUESTION, from a real walk: a bakery got the agency question.
 * `questionFor` reads the intake picks and never the door, and a thin sentence
 * classifies to service(assumed) x consumer(assumed) — whose key is
 * `servicexconsumer`, the retainer question.
 */
describe('refineWithDoorText', () => {
  const bakeryDoor = 'We are a neighbourhood sourdough bakery selling bread and cakes.'

  it('lets the door correct a pick we only ASSUMED', () => {
    const out = refineWithDoorText('Rolling Pin', bakeryDoor, {})
    expect(out.intake.model).toBe('local_presence')
    expect(out.intake.regime).toBe('food')
  })

  it('never overrides a pick the user CHOSE', () => {
    const out = refineWithDoorText('Rolling Pin', bakeryDoor, { model: 'platform' })
    expect(out.intake.model).toBe('platform')
    expect(out.model.basis).toBe('chosen')
  })

  it('never overrides a pick the intake sentence MATCHED', () => {
    // They described themselves in their own words; a crawl that mentions a
    // supplier's sector must not talk us out of it.
    const out = refineWithDoorText('We are a marketing agency on retainer', bakeryDoor, {})
    expect(out.intake.model).toBe('service')
  })

  it('is a no-op when the door produced nothing', () => {
    const out = refineWithDoorText('Rolling Pin', '', {})
    expect(out.intake).toEqual(classify('Rolling Pin').intake)
  })
})
