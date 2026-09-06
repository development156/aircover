import { describe, expect, it } from 'vitest'

import type { BrandSignal } from '@sahoda/shared'

import { combineStudioStarters } from './starter-ladder'
import { PROMPT_STARTERS } from './prompt'

const STORED = [
  { label: 'Stored one', prompt: 'A stored idea.' },
  { label: 'Stored two', prompt: 'Another stored idea.' },
  { label: 'Stored three', prompt: 'A third stored idea.' },
]

const signal = (field: string, value: string): BrandSignal => ({
  field,
  certainty: 'confirmed',
  value,
})

describe('combineStudioStarters', () => {
  it('serves the stored ideas, unchanged, when step 1 has an answer', () => {
    const result = combineStudioStarters(STORED, [signal('what the business is', 'a bakery')])
    expect(result).toEqual({ starters: STORED, source: 'stored' })
  })

  it('falls to step 2, folding brand words into the generic frames, when step 1 has nothing', () => {
    const result = combineStudioStarters(null, [
      signal('what the business is', 'software training for clinics'),
    ])
    expect(result.source).toBe('brand')
    expect(result.starters.map((s) => s.prompt).join(' ')).toContain(
      'software training for clinics',
    )
  })

  it('falls all the way to step 3, the generic five, when there is nothing to build from either', () => {
    const result = combineStudioStarters(null, [])
    expect(result.source).toBe('generic')
    expect(result.starters).toEqual(PROMPT_STARTERS)
  })

  it('falls to step 3 when signals is null (an unreadable brain), not step 2', () => {
    const result = combineStudioStarters(null, null)
    expect(result.source).toBe('generic')
  })
})
