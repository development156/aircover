import { describe, expect, test } from 'vitest'
import { toChannelSet } from '@sahoda/shared'

import { clampBriefText, clampChannels } from './briefs'

/**
 * The model is PROMPTED to spread briefs across the requested channels, but the
 * output schema does not enforce it — a brief naming a channel the user never
 * picked must not create a draft targeting it.
 */
describe('clampChannels', () => {
  test('keeps only requested channels', () => {
    expect(clampChannels(['x', 'linkedin'], toChannelSet(['x', 'gbp']))).toEqual(['x'])
  })

  test('de-dupes what the model repeated', () => {
    expect(clampChannels(['x', 'x', 'gbp'], toChannelSet(['x', 'gbp']))).toEqual(['x', 'gbp'])
  })

  test('falls back to the full requested set when the brief names none of them', () => {
    expect(clampChannels(['linkedin'], toChannelSet(['x', 'gbp']))).toEqual(['x', 'gbp'])
  })

  test('falls back when the brief has no channels at all', () => {
    expect(clampChannels([], toChannelSet(['gbp']))).toEqual(['gbp'])
  })

  test('falls back to the requested set itself, which the caller cannot mutate', () => {
    // This used to assert a fresh array, because the return was a mutable
    // `Channel[]` and handing back the caller's own reference let a downstream
    // edit rewrite what the user asked for. `ChannelSet` is readonly, so sharing
    // the reference is now safe and the copy would only hide the guarantee.
    const requested = toChannelSet(['x'])
    expect(clampChannels([], requested)).toEqual(['x'])
  })
})

describe('clampBriefText', () => {
  test('keeps short text untouched', () => {
    expect(clampBriefText('Monsoon menu', 160)).toBe('Monsoon menu')
  })

  test('caps long text at the limit', () => {
    const result = clampBriefText('a'.repeat(500), 160)
    expect(result.length).toBe(160)
  })

  test('counts code points, not UTF-16 units — an emoji at the boundary survives whole', () => {
    const text = `${'a'.repeat(4)}🎉🎉` // 6 code points, 8 UTF-16 units
    const result = clampBriefText(text, 5)
    expect(result).toBe('aaaa🎉')
    expect(result).not.toContain('�')
  })

  test('empty string stays empty', () => {
    expect(clampBriefText('', 160)).toBe('')
  })
})
