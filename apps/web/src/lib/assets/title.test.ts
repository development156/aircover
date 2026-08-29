import { describe, it, expect } from 'vitest'

import { assetTitle, MAX_ASSET_TITLE } from './title'

/**
 * The rule that decides what an uploaded file is called.
 *
 * The first case is the one that was broken in production: a caller that names
 * the upload must win, because `readBrandLogo` finds the workspace logo by the
 * title `Logo` and there was never a row carrying it.
 */
describe('assetTitle', () => {
  it('takes the title the caller gave over the file name', () => {
    expect(assetTitle('Logo', 'trainx-logo-final-v3.png')).toBe('Logo')
  })

  it('falls back to the file name when the caller said nothing', () => {
    expect(assetTitle(null, 'shopfront.png')).toBe('shopfront.png')
    expect(assetTitle(undefined, 'shopfront.png')).toBe('shopfront.png')
  })

  /** A field set to spaces is the same statement as a field never set. */
  it('treats a blank title as nothing said', () => {
    expect(assetTitle('   ', 'shopfront.png')).toBe('shopfront.png')
  })

  it('answers null when neither says anything', () => {
    expect(assetTitle('  ', '   ')).toBeNull()
    expect(assetTitle(null, null)).toBeNull()
  })

  /** `FormData.get` returns a File for a file field. Neither is a title. */
  it('ignores a value that is not a string', () => {
    expect(assetTitle({ name: 'Logo' }, 'shopfront.png')).toBe('shopfront.png')
    expect(assetTitle(42, 'shopfront.png')).toBe('shopfront.png')
  })

  it('trims and bounds what it stores', () => {
    expect(assetTitle('  Logo  ', null)).toBe('Logo')
    expect(assetTitle('x'.repeat(MAX_ASSET_TITLE + 40), null)).toHaveLength(MAX_ASSET_TITLE)
  })
})
