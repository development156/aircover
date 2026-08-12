import { describe, expect, test } from 'vitest'
import { ResolveInputSchema } from '@sahoda/shared'

import { sparkToResolveInput, type SparkInput } from './spark-to-resolve-input'

describe('sparkToResolveInput', () => {
  test('maps the trimmed name into source.name (the one required field)', () => {
    const input = sparkToResolveInput({ name: '  Chai & Chapters  ' })
    expect(input.source.name).toBe('Chai & Chapters')
  })

  test('maps category into source.category, leaves other source fields blank', () => {
    const input = sparkToResolveInput({ name: 'Acme', category: 'Coffee shop' })
    expect(input.source.category).toBe('Coffee shop')
    expect(input.source.one_liner).toBe('')
    expect(input.source.mission).toBe('')
  })

  test('produces a full, schema-valid ResolveInput with defaults for every other channel', () => {
    const input = sparkToResolveInput({ name: 'Acme' })
    // the frozen schema is the source of truth — a blank spark still parses
    expect(() => ResolveInputSchema.parse(input)).not.toThrow()
    expect(input.voice.formality).toBe(3)
    expect(input.voice.energy).toBe(3)
    expect(input.customer.description).toBe('')
    expect(input.taboo.avoid_topics).toBe('')
  })

  // INVERTED on 2026-08-12. This test used to assert that website/instagram were
  // deliberately NOT forwarded ("kept for theming/deep-research"). The form asked
  // for both and the model never saw either — the intake, not the model, was the
  // reason the Brain read generic. The rule changed on purpose; the assertion is
  // kept inverted rather than deleted so the reversal stays on the record.
  test('forwards website and instagram into the ResolveInput the model receives', () => {
    const spark: SparkInput = {
      name: 'Acme',
      category: 'Coffee',
      website: 'https://acme.example',
      instagram: '@acme',
    }
    const input = sparkToResolveInput(spark)
    expect(input.source.website).toBe('https://acme.example')
    expect(input.source.instagram).toBe('@acme')
    // brand_guidelines JSON.stringify()s the whole input, so "in the input" is
    // literally "in the prompt" — assert against the serialised form the model sees.
    const serialized = JSON.stringify(input)
    expect(serialized).toContain('acme.example')
    expect(serialized).toContain('@acme')
  })

  test('maps description into source.one_liner (the words the founder wrote)', () => {
    const input = sparkToResolveInput({ name: 'Acme', description: '  We roast slow.  ' })
    expect(input.source.one_liner).toBe('We roast slow.')
  })

  test('trims every forwarded field and leaves omitted ones blank, never undefined', () => {
    const input = sparkToResolveInput({ name: 'Acme', website: '  https://acme.example  ' })
    expect(input.source.website).toBe('https://acme.example')
    expect(input.source.instagram).toBe('')
    expect(input.source.one_liner).toBe('')
  })

  test('throws on a blank name (the form guarantees it; defense in depth)', () => {
    expect(() => sparkToResolveInput({ name: '   ' })).toThrow()
  })
})
