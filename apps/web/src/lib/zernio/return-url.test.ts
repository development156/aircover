import { describe, expect, it } from 'vitest'

import { returnOrigin, returnUrl } from './return-url'

const APP = 'https://sahodalabs.vercel.app'
const BRANCH = 'sahodalabs-git-claude-advisor-qvz5wn-development-4417s-projects.vercel.app'
const DEPLOY = 'sahodalabs-9k2h4jf8.vercel.app'

/**
 * THE DEFECT THIS PINS, in the words it was reported in: "it automatically
 * redirects from the preview URL to sahodalabs.vercel.app/connections".
 *
 * A customer testing a branch pressed Connect, approved at the platform, and was
 * returned to production — a different deployment, usually a different session,
 * never the branch they were on. The connect looked like it had silently failed.
 */
describe('a preview deployment returns to ITSELF, not to production', () => {
  it('uses the branch alias, not NEXT_PUBLIC_APP_URL', () => {
    const url = returnUrl({
      vercelEnv: 'preview',
      vercelBranchUrl: BRANCH,
      vercelUrl: DEPLOY,
      appUrl: APP,
    })

    expect(url).toBe(`https://${BRANCH}/api/oauth/zernio/return`)
    // The whole bug in one assertion.
    expect(url).not.toContain('sahodalabs.vercel.app/api')
  })

  it('prefers the BRANCH alias over the per-deployment one', () => {
    // `VERCEL_URL` changes on every push. A customer sitting on a consent screen
    // while their branch redeploys comes back to a host that still exists only
    // if we handed Zernio the stable branch alias.
    expect(returnOrigin({ vercelEnv: 'preview', vercelBranchUrl: BRANCH, vercelUrl: DEPLOY })).toBe(
      `https://${BRANCH}`,
    )
  })

  it('falls back to the deployment url when there is no branch', () => {
    expect(returnOrigin({ vercelEnv: 'preview', vercelUrl: DEPLOY, appUrl: APP })).toBe(
      `https://${DEPLOY}`,
    )
  })
})

describe('production is unchanged', () => {
  it('uses the configured public origin', () => {
    // The real domain, and nothing about this change may move it. A preview-shaped
    // origin reaching production would send live customers to a branch build.
    expect(
      returnUrl({
        vercelEnv: 'production',
        vercelBranchUrl: BRANCH,
        vercelUrl: DEPLOY,
        appUrl: APP,
      }),
    ).toBe(`${APP}/api/oauth/zernio/return`)
  })

  it('ignores the Vercel aliases entirely outside preview', () => {
    expect(returnOrigin({ vercelEnv: undefined, vercelUrl: DEPLOY, appUrl: APP })).toBe(APP)
    expect(returnOrigin({ vercelEnv: 'development', vercelBranchUrl: BRANCH, appUrl: APP })).toBe(
      APP,
    )
  })
})

describe('the host arrives without a scheme, and that has to be handled', () => {
  it('adds https to a bare Vercel host', () => {
    // VERCEL_URL is `example.vercel.app`, never `https://example.vercel.app`.
    // Handed to Zernio bare it is a relative reference that resolves against
    // zernio.com — one wrong destination swapped for another.
    expect(returnOrigin({ vercelEnv: 'preview', vercelBranchUrl: BRANCH })).toBe(
      `https://${BRANCH}`,
    )
  })

  it('never returns a plaintext origin', () => {
    // A redirect carrying a signed-in customer must not be downgraded.
    expect(returnOrigin({ appUrl: 'http://sahodalabs.vercel.app' })).toBe(
      'https://sahodalabs.vercel.app',
    )
  })

  it('strips a trailing slash so the path is not doubled', () => {
    expect(returnUrl({ appUrl: `${APP}/` })).toBe(`${APP}/api/oauth/zernio/return`)
  })
})

describe('an environment that cannot answer says so', () => {
  it('returns null rather than a relative path', () => {
    // This used to be `?? ''`, producing `/api/oauth/zernio/return` — a relative
    // reference Zernio would resolve against its OWN origin. The caller must
    // refuse to start the flow instead: the grant at the platform is real and
    // cannot be undone, so a return trip that goes nowhere is the worst outcome.
    expect(returnUrl({})).toBeNull()
    expect(returnOrigin({ vercelEnv: 'preview' })).toBeNull()
  })

  it('treats an empty or whitespace value as absent', () => {
    expect(returnOrigin({ appUrl: '' })).toBeNull()
    expect(returnOrigin({ vercelEnv: 'preview', vercelBranchUrl: '   ', appUrl: '' })).toBeNull()
  })
})
