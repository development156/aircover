import { describe, expect, test } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD, type BrandMemoryPayload } from '@sahoda/shared'

import { pruneBlankListEntries } from './prune-blank-entries'

/** A brain whose two OPEN-ended lists carry blanks, as the Add button makes easy. */
function brainWithBlanks(): BrandMemoryPayload {
  return {
    ...DEMO_FALLBACK_PAYLOAD,
    voice: {
      ...DEMO_FALLBACK_PAYLOAD.voice,
      banned_phrases: ['revolutionary', '', '   ', 'game-changer', ''],
    },
    taboo: { red_lines: ['No false urgency', '', '\t', '  ', 'No competitor bashing'] },
  }
}

describe('pruneBlankListEntries', () => {
  test('drops empty and whitespace-only entries from the two open-ended lists', () => {
    const pruned = pruneBlankListEntries(brainWithBlanks())
    expect(pruned.voice.banned_phrases).toEqual(['revolutionary', 'game-changer'])
    expect(pruned.taboo.red_lines).toEqual(['No false urgency', 'No competitor bashing'])
  })

  test('leaves retained entries byte-identical — it prunes, it does not rewrite', () => {
    const brain = brainWithBlanks()
    brain.taboo.red_lines = ['  keeps  inner   spacing  ', '']
    expect(pruneBlankListEntries(brain).taboo.red_lines).toEqual(['  keeps  inner   spacing  '])
  })

  test('never touches the three fixed-length arrays — the contract pins them at exactly 3', () => {
    const brain = brainWithBlanks()
    brain.voice.signature_phrases = ['kept', '', '']
    brain.brand_persona.core_values = ['', 'kept', '']
    brain.hook.sample_hooks = ['', '', 'kept']

    const pruned = pruneBlankListEntries(brain)
    expect(pruned.voice.signature_phrases).toHaveLength(3)
    expect(pruned.brand_persona.core_values).toHaveLength(3)
    expect(pruned.hook.sample_hooks).toHaveLength(3)
    expect(pruned.voice.signature_phrases).toEqual(['kept', '', ''])
  })

  test('does not mutate the input (immutable update)', () => {
    const brain = brainWithBlanks()
    const before = JSON.stringify(brain)
    pruneBlankListEntries(brain)
    expect(JSON.stringify(brain)).toBe(before)
  })

  test('is a no-op for a brain with no blanks', () => {
    const clean = pruneBlankListEntries(DEMO_FALLBACK_PAYLOAD)
    expect(clean.voice.banned_phrases).toEqual(DEMO_FALLBACK_PAYLOAD.voice.banned_phrases)
    expect(clean.taboo.red_lines).toEqual(DEMO_FALLBACK_PAYLOAD.taboo.red_lines)
  })

  test('an all-blank open list prunes to empty, not to a blank entry', () => {
    const brain = brainWithBlanks()
    brain.taboo.red_lines = ['', '  ']
    expect(pruneBlankListEntries(brain).taboo.red_lines).toEqual([])
  })
})
