import { describe, expect, it } from 'vitest'

import { cspFor, isFrameable } from './csp'

/**
 * ── ASSERT THE CLAIM, NOT THE WHOLE HEADER ──────────────────────────────────
 * Every case below used `toBe` on the entire policy string, so adding
 * `object-src 'none'; base-uri 'self'` — directives that cannot weaken framing
 * by construction — turned ten green tests red at once. That is a test pinning a
 * SHAPE rather than a guarantee: it would have refused every future directive
 * with the same red, and the cheapest way through a wall like that is to delete
 * it. So the framing claim is extracted and asserted on its own, and the extra
 * directives get their own test rather than being folded into ten strings.
 */
function frameAncestors(policy: string): string {
  const found = policy
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith('frame-ancestors'))
  return found ?? '(no frame-ancestors directive at all)'
}

describe('cspFor', () => {
  it('lets any origin frame the embeddable beta form', () => {
    // Arrange / Act
    const policy = cspFor('/embed/beta')

    // Assert — doc 13 §5 hands this exact path to third-party landing pages.
    expect(frameAncestors(policy)).toBe('frame-ancestors *')
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
    expect(frameAncestors(cspFor(pathname))).toBe("frame-ancestors 'none'")
  })

  it('does not let a lookalike prefix escape the deny', () => {
    // `/embedded-thing` shares five characters with `/embed/` and must not be
    // frameable. A `startsWith('/embed')` check would have said yes.
    expect(isFrameable('/embedded-report')).toBe(false)
    expect(frameAncestors(cspFor('/embedded-report'))).toBe("frame-ancestors 'none'")
  })

  it('never emits a policy that silently allows framing', () => {
    // Whatever the input, the answer is one of exactly two policies. A typo that
    // produced an empty string would disable framing protection everywhere.
    for (const path of ['', '/', '/embed/beta', '/x', '//embed/beta', '/EMBED/beta']) {
      expect(['frame-ancestors *', "frame-ancestors 'none'"]).toContain(
        frameAncestors(cspFor(path)),
      )
    }
    // Case matters: Next serves lowercase paths, and an uppercase variant is not
    // the embed route, so it must fall to deny rather than accidentally matching.
    expect(frameAncestors(cspFor('/EMBED/beta'))).toBe("frame-ancestors 'none'")
  })

  it('carries the two directives that apply everywhere, on every path', () => {
    // MEASURED absent 2026-08-23 on `next start` AND on the deployed origin: the
    // whole header was `frame-ancestors` and nothing else, so the CSP was a
    // clickjacking control and not a content policy.
    for (const path of ['/embed/beta', '/admin', '/', '/sign-in']) {
      const policy = cspFor(path)
      // <base href="//evil"> silently repoints every relative URL on the page.
      expect(policy).toContain("base-uri 'self'")
      expect(policy).toContain("object-src 'none'")
    }
  })

  it('does NOT set form-action, and that is deliberate', () => {
    // Sign-in posts cross-origin to Clerk. `'self'` here would break the login
    // flow in the week nobody was watching, which is why it is absent rather
    // than forgotten — asserted so a future tightening has to read this line.
    expect(cspFor('/sign-in')).not.toContain('form-action')
  })
})
