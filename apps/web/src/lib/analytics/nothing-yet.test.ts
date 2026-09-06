import { describe, expect, test } from 'vitest'

import { nothingYetCard } from './nothing-yet'

describe('nothingYetCard', () => {
  test('a connected account is never told to connect one', () => {
    const card = nothingYetCard('ready', 'Instagram')
    expect(card.action?.label).toBe('Write a post')
    expect(card.detail).toContain('Instagram is connected')
    expect(JSON.stringify(card)).not.toMatch(/Connect a channel/)
  })

  test('no account at all is the one case that offers connecting', () => {
    expect(nothingYetCard('not-connected').action?.label).toBe('Connect a channel')
  })

  test('a missing key and a failed read offer no remedy, and say different things', () => {
    const missing = nothingYetCard('not-configured')
    const failed = nothingYetCard('unreadable')
    expect(missing.action).toBeNull()
    expect(failed.action).toBeNull()
    expect(missing.detail).not.toBe(failed.detail)
    expect(missing.detail).not.toMatch(/refresh/i)
  })
})
