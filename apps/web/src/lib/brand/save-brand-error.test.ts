import { describe, expect, test } from 'vitest'

import { mapSaveBrandError } from './save-brand-error'

describe('mapSaveBrandError', () => {
  test('INVALID_PAYLOAD points at the fixable cause (size / list caps)', () => {
    const message = mapSaveBrandError({ message: 'INVALID_PAYLOAD' })
    expect(message).toMatch(/too long|trim|shorten|list/i)
  })

  test('NOT_A_MEMBER and INVALID_WORKSPACE read the same — no existence oracle', () => {
    expect(mapSaveBrandError({ message: 'NOT_A_MEMBER' })).toBe(
      mapSaveBrandError({ message: 'INVALID_WORKSPACE' }),
    )
  })

  test('FORBIDDEN_ROLE explains the permission without blaming the user', () => {
    const message = mapSaveBrandError({ message: 'FORBIDDEN_ROLE' })
    expect(message).toMatch(/role|permission/i)
  })

  test('VERSION_CONFLICT tells the user to reload — both causes share the sentinel', () => {
    expect(mapSaveBrandError({ message: 'VERSION_CONFLICT' })).toMatch(/reload|again/i)
  })

  test('unknown sentinels and nulls collapse to a generic message', () => {
    expect(mapSaveBrandError({ message: 'AUTH_REQUIRED' })).toMatch(/could not save/i)
    expect(mapSaveBrandError(null)).toMatch(/could not save/i)
  })

  test('never leaks a raw database message into user-facing copy', () => {
    const raw = 'ERROR: null value in column "payload" violates not-null constraint'
    const message = mapSaveBrandError({ message: raw })
    expect(message).not.toMatch(/null value|constraint|column|ERROR:/i)
  })
})
