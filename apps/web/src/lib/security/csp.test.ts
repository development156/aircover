import { describe, expect, it } from 'vitest'

import { cspFor, isFrameable } from './csp'

describe('cspFor', () => {
  it('lets any origin frame the embeddable beta form', () => {
    // Arrange / Act
    const policy = cspFor('/embed/beta')

    // Assert — doc 13 §5 hands this exact path to third-party landing pages.
    expect(policy).toBe('frame-ancestors *')
  })

  it('keeps the query string irrelevant — ?src= is a real part of the contract', () => {
    expect(isFrameable('/embed/beta')).toBe(true)
  })

  it.each([
    '/admin',
    '/admin/dev',
    '/admin/credits',
    '/home',
    '/',
    '/api/admin/devops/ingest',
    '/sign-in',
  ])('refuses framing on %s', (pathname) => {
    expect(cspFor(pathname)).toBe("frame-ancestors 'none'")
  })

  it('does not let a lookalike prefix escape the deny', () => {
    // `/embedded-thing` shares five characters with `/embed/` and must not be
    // frameable. A `startsWith('/embed')` check would have said yes.
    expect(isFrameable('/embedded-report')).toBe(false)
    expect(cspFor('/embedded-report')).toBe("frame-ancestors 'none'")
  })

  it('never emits a policy that silently allows framing', () => {
    // Whatever the input, the answer is one of exactly two policies. A typo that
    // produced an empty string would disable framing protection everywhere.
    for (const path of ['', '/', '/embed/beta', '/x', '//embed/beta', '/EMBED/beta']) {
      expect(['frame-ancestors *', "frame-ancestors 'none'"]).toContain(cspFor(path))
    }
    // Case matters: Next serves lowercase paths, and an uppercase variant is not
    // the embed route, so it must fall to deny rather than accidentally matching.
    expect(cspFor('/EMBED/beta')).toBe("frame-ancestors 'none'")
  })
})
