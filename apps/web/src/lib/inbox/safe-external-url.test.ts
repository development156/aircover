import { describe, expect, test } from 'vitest'

import { safeExternalUrl } from './safe-external-url'

describe('safeExternalUrl', () => {
  test('keeps an https address', () => {
    expect(safeExternalUrl('https://www.instagram.com/direct/t/abc')).toBe(
      'https://www.instagram.com/direct/t/abc',
    )
  })
  test.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'http://insecure.example',
    '',
    'not a url',
    42,
    null,
  ])('drops %p', (value) => {
    expect(safeExternalUrl(value)).toBeNull()
  })
})
