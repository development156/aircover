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

  test('does NOT smuggle website/instagram into the frozen ResolveInput (kept for theming/deep-research)', () => {
    const spark: SparkInput = {
      name: 'Acme',
      category: 'Coffee',
      website: 'https://acme.example',
      instagram: '@acme',
    }
    const input = sparkToResolveInput(spark)
    const serialized = JSON.stringify(input)
    expect(serialized).not.toContain('acme.example')
    expect(serialized).not.toContain('@acme')
  })

  test('throws on a blank name (the form guarantees it; defense in depth)', () => {
    expect(() => sparkToResolveInput({ name: '   ' })).toThrow()
  })
})
