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

describe('the intent travels in the URL, because the cookie did not survive', () => {
  it('carries nothing at all when no intent is given', () => {
    // The old shape. A caller that says nothing gets the URL it always got, so
    // the redirect path stays the default in the absence of every signal.
    expect(returnUrl({ appUrl: APP })).toBe(`${APP}/api/oauth/zernio/return`)
    expect(returnUrl({ appUrl: APP }, {})).toBe(`${APP}/api/oauth/zernio/return`)
  })

  it('writes mode=popup, and writes it ONLY for popup', () => {
    expect(returnUrl({ appUrl: APP }, { mode: 'popup' })).toBe(
      `${APP}/api/oauth/zernio/return?mode=popup`,
    )
    // `redirect` is the absence, not a value. Anything that strips the query
    // string therefore lands on the behaviour that has always worked.
    expect(returnUrl({ appUrl: APP }, { mode: 'redirect' })).toBe(`${APP}/api/oauth/zernio/return`)
  })

  it('writes the platform, which is what makes a create possible at all', () => {
    // Losing this is not cosmetic: without it the return route's create-scoping
    // falls to its fail-closed branch and a real connect writes NO row.
    expect(returnUrl({ appUrl: APP }, { platform: 'linkedin' })).toBe(
      `${APP}/api/oauth/zernio/return?platform=linkedin`,
    )
  })

  it('carries both at once', () => {
    const url = new URL(returnUrl({ appUrl: APP }, { mode: 'popup', platform: 'gbp' }) as string)
    expect(url.searchParams.get('mode')).toBe('popup')
    expect(url.searchParams.get('platform')).toBe('gbp')
  })

  it('still returns null when the environment cannot name an origin', () => {
    // The intent must never conjure a URL out of an environment that has none —
    // a return trip to nowhere costs the customer a real grant at the platform.
    expect(returnUrl({}, { mode: 'popup', platform: 'instagram' })).toBeNull()
  })

  it('keeps the preview origin, which is the bug this file was made for', () => {
    expect(
      returnUrl({ vercelEnv: 'preview', vercelBranchUrl: BRANCH, appUrl: APP }, { mode: 'popup' }),
    ).toBe(`https://${BRANCH}/api/oauth/zernio/return?mode=popup`)
  })
})
