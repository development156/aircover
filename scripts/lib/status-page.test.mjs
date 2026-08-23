import { describe, expect, it } from 'vitest'

import { STALE_AFTER_MINUTES, renderStatusPage, stalenessNote } from './status-page.mjs'

/**
 * The status page's content.
 *
 * WHAT THIS CANNOT SEE: whether the page ever gets BUILT or PUBLISHED. That is
 * `.github/workflows/status-page.yml`, and it is inert until it sits on the
 * default branch — measured, and stated in that file's header.
 */
const at = '2026-08-22T10:00:00.000Z'
const page = (checks) => renderStatusPage({ builtAt: at, checks, host: 'https://x.example' })

describe('the headline states the worst thing that is true', () => {
  it('counts failures when there are any', () => {
    expect(
      page([
        { name: 'a', ok: true, detail: '' },
        { name: 'b', ok: false, detail: '' },
      ]),
    ).toContain('1 of 2 checks failing')
  })

  it('reports UNMEASURED separately from failing, never as passing', () => {
    // The distinction the post-deploy probe went red on for six runs.
    const html = page([
      { name: 'a', ok: true, detail: '' },
      { name: 'b', ok: null, detail: '' },
    ])
    expect(html).toContain('1 of 2 checks could not be measured')
    expect(html).not.toContain('all 2 checks passing')
  })

  it('says all passing only when every check passed', () => {
    expect(page([{ name: 'a', ok: true, detail: '' }])).toContain('all 1 checks passing')
  })
})

describe('the page cannot lie by omission', () => {
  it('always states when it was built, so a frozen page is visibly frozen', () => {
    expect(page([{ name: 'a', ok: true, detail: '' }])).toContain(at)
  })

  it('says out loud that the probes are unauthenticated', () => {
    expect(page([{ name: 'a', ok: true, detail: '' }])).toMatch(/unauthenticated/)
  })

  it('escapes probe output — a detail string is provider text, not markup', () => {
    const html = page([{ name: 'x', ok: false, detail: '<script>alert(1)</script>' }])
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('staleness', () => {
  it('calls a page stale past the window', () => {
    const now = Date.parse(at) + (STALE_AFTER_MINUTES + 1) * 60_000
    expect(stalenessNote(Date.parse(at), now)).toMatch(/STALE/)
  })

  it('does not call a fresh page stale', () => {
    expect(stalenessNote(Date.parse(at), Date.parse(at) + 60_000)).not.toMatch(/STALE/)
  })

  it('refuses to reason about a build time in the future', () => {
    expect(stalenessNote(Date.parse(at), Date.parse(at) - 60_000)).toMatch(/cannot be read/)
  })
})
