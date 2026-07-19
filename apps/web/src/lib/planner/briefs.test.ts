import { describe, expect, test } from 'vitest'

import { clampBriefText, clampChannels } from './briefs'

/**
 * The model is PROMPTED to spread briefs across the requested channels, but the
 * output schema does not enforce it — a brief naming a channel the user never
 * picked must not create a draft targeting it.
 */
describe('clampChannels', () => {
  test('keeps only requested channels', () => {
    expect(clampChannels(['x', 'linkedin'], ['x', 'gbp'])).toEqual(['x'])
  })

  test('de-dupes what the model repeated', () => {
    expect(clampChannels(['x', 'x', 'gbp'], ['x', 'gbp'])).toEqual(['x', 'gbp'])
  })

  test('falls back to the full requested set when the brief names none of them', () => {
    expect(clampChannels(['linkedin'], ['x', 'gbp'])).toEqual(['x', 'gbp'])
  })

  test('falls back when the brief has no channels at all', () => {
    expect(clampChannels([], ['gbp'])).toEqual(['gbp'])
  })

  test('returns a fresh array — never the caller’s reference', () => {
    const requested = ['x'] as const
    const result = clampChannels([], [...requested])
    expect(result).toEqual(['x'])
    expect(result).not.toBe(requested)
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
