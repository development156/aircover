import { describe, expect, test } from 'vitest'

import { clerkKeyWarning } from './clerk-key-guard'

const LIVE = 'pk_live_Y2xlcmsuc2Fob2RhbGFicy5jb20k'
const TEST = 'pk_test_Y2xlcmsuZXhhbXBsZS5kZXYk'

describe('clerkKeyWarning', () => {
  test('warns when a live key runs outside production', () => {
    // Arrange + Act
    const warning = clerkKeyWarning({ publishableKey: LIVE, nodeEnv: 'development' })

    // Assert — names the mismatch and the localhost/origin failure it causes
    expect(warning).toBeTypeOf('string')
    expect(warning).toMatch(/pk_live/)
    expect(warning).toMatch(/localhost|origin/i)
    // and points at the fix
    expect(warning).toMatch(/pk_test|development instance/i)
  })

  test('is silent for a test key in development (the correct pairing)', () => {
    expect(clerkKeyWarning({ publishableKey: TEST, nodeEnv: 'development' })).toBeNull()
  })

  test('is silent for a live key in production (the correct pairing)', () => {
    expect(clerkKeyWarning({ publishableKey: LIVE, nodeEnv: 'production' })).toBeNull()
  })

  test('warns when a test key runs in production', () => {
    const warning = clerkKeyWarning({ publishableKey: TEST, nodeEnv: 'production' })
    expect(warning).toMatch(/pk_test/)
    expect(warning).toMatch(/production/i)
  })

  test('treats an undefined nodeEnv as non-production (dev)', () => {
    expect(clerkKeyWarning({ publishableKey: LIVE, nodeEnv: undefined })).toMatch(/pk_live/)
  })

  test('stays silent for an unrecognized key prefix (parseEnv already gates presence)', () => {
    expect(clerkKeyWarning({ publishableKey: 'weird_key', nodeEnv: 'development' })).toBeNull()
  })

  test('never echoes the full key value — only its type prefix', () => {
    const warning = clerkKeyWarning({ publishableKey: LIVE, nodeEnv: 'development' })
    expect(warning).not.toContain('Y2xlcmsuc2Fob2RhbGFicy5jb20k')
  })
})
