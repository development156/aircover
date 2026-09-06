import { describe, expect, test } from 'vitest'

import { DEFAULT_APP_ORIGIN, embedOrigin } from './embed-origin'

describe('embedOrigin', () => {
  test('strips a trailing slash so the snippet never reads "//embed"', () => {
    expect(`${embedOrigin('https://sahodalabs.vercel.app/')}/embed/lead`).toBe(
      'https://sahodalabs.vercel.app/embed/lead',
    )
    expect(embedOrigin('https://app.sahodalabs.com///')).toBe('https://app.sahodalabs.com')
  })

  test('keeps a clean origin as it is', () => {
    expect(embedOrigin('https://app.sahodalabs.com')).toBe('https://app.sahodalabs.com')
  })

  test('falls back to production when nothing is configured', () => {
    expect(embedOrigin(undefined)).toBe(DEFAULT_APP_ORIGIN)
    expect(embedOrigin('   ')).toBe(DEFAULT_APP_ORIGIN)
  })
})
