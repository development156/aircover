import { describe, expect, test } from 'vitest'

import { accountLabel } from './account-label'

describe('accountLabel', () => {
  test('prefers name, then username, then handle, then id', () => {
    expect(accountLabel({ name: 'Sharma Dental', username: 'sharma' })).toBe('Sharma Dental')
    expect(accountLabel({ username: 'sharma', id: '123' })).toBe('sharma')
    expect(accountLabel({ handle: '@sharma', id: '123' })).toBe('@sharma')
    expect(accountLabel({ id: '123' })).toBe('123')
  })

  test('blank strings do not win — falls through to the next field', () => {
    expect(accountLabel({ name: '  ', id: '123' })).toBe('123')
  })

  test('never throws on a shape surprise', () => {
    expect(accountLabel(null)).toBe('Connected account')
    expect(accountLabel('a string')).toBe('Connected account')
    expect(accountLabel({ name: 42 })).toBe('Connected account')
  })
})
