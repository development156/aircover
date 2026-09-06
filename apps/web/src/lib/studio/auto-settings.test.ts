import { describe, expect, test } from 'vitest'

import { formatsForChannel } from './formats'
import { defaultModelId } from './models'
import { chooseFormat, chooseSettings, promptFor } from './auto-settings'

describe('chooseFormat · the first size every channel accepts', () => {
  test('one channel gets the first size its picker lists', () => {
    expect(chooseFormat(['instagram'])?.id).toBe(formatsForChannel('instagram')[0]!.id)
  })

  test('two channels get a size both accept, and it is one each picker offers', () => {
    const chosen = chooseFormat(['instagram', 'x'])
    expect(chosen).not.toBeNull()
    expect(formatsForChannel('instagram').some((f) => f.id === chosen!.id)).toBe(true)
    expect(formatsForChannel('x').some((f) => f.id === chosen!.id)).toBe(true)
  })

  test('no channels means no size, never a guess', () => {
    expect(chooseFormat([])).toBeNull()
  })
})

describe('promptFor · the post says what the picture is of', () => {
  test('title leads, body follows', () => {
    expect(promptFor({ title: 'Monsoon menu', body: 'Hot chai and pakoras' })).toBe(
      'Monsoon menu. Hot chai and pakoras',
    )
  })

  test('a post with no words gets no prompt, so nothing is spent on it', () => {
    expect(promptFor({ title: '  ', body: null })).toBeNull()
    expect(promptFor({ title: 'ab', body: '' })).toBeNull()
  })

  test('a long body is cut on a word under the Studio ceiling', () => {
    const prompt = promptFor({ title: null, body: 'word '.repeat(400) })
    expect(prompt!.length).toBeLessThanOrEqual(1000)
    expect(prompt!.endsWith('word')).toBe(true)
  })
})

describe('chooseSettings', () => {
  test('on brand, the everyday model, the channels’ shared shape, the post’s words', () => {
    const result = chooseSettings({
      title: 'Weekend offer',
      body: 'Two for one',
      channels: ['x', 'gbp'],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.settings.mode).toBe('on_brand')
    expect(result.settings.modelId).toBe(defaultModelId())
    expect(result.settings.wanted).toBe('Weekend offer. Two for one')
    expect(result.settings.formatLabel).toMatch(/^\d+ × \d+ · /)
  })

  test('refuses by name when the post has no words or no channel', () => {
    expect(chooseSettings({ title: null, body: null, channels: ['x'] })).toEqual({
      ok: false,
      reason: 'no_words',
    })
    expect(chooseSettings({ title: 'Hello there', body: null, channels: [] })).toEqual({
      ok: false,
      reason: 'no_format',
    })
  })
})
