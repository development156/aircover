import { describe, expect, it } from 'vitest'

import {
  CLEAR_CONNECT_NONCE,
  CONNECT_NONCE_COOKIE,
  mintConnectNonce,
  ourPlatformFor,
  readNonceCookie,
  readSelectionRedirect,
  RETURN_NONCE_PARAM,
  selectionPlatformFor,
  setConnectNonceHeader,
  unresolvedSelection,
  verifyConnectNonce,
} from './selection'

/**
 * READING A REDIRECT WHOSE EXACT SHAPE HAS NEVER BEEN OBSERVED.
 *
 * ── THE HONEST POSITION THIS FILE ENCODES ────────────────────────────────────
 * The endpoints, the required fields and the `step` values are all read from
 * `zernio.com/openapi.json`. The redirect itself can only be seen by completing a
 * real Facebook login, which cannot be done from this environment. So one part of
 * this flow is INFERRED, and Zernio's own documentation has been measurably wrong
 * about this integration three times — `llms-full.txt` names four platforms as
 * connectable that answer 400, and omits three that answer 200.
 *
 * The design answer is to key on the part the spec states in PROSE and twice —
 * "Extract tempToken and userProfile from the OAuth redirect params" — rather
 * than on the two enum strings nobody has seen. A token on this URL means one
 * thing: Zernio holds an authorised session that has not resolved to an account.
 */

const params = (o: Record<string, string>) => new URLSearchParams(o)
const FB = { profileId: '6a7efffaf7c78d193906be18', tempToken: 'EAAxxLIVETOKENxx' }

describe('the token is the evidence, the step is only the label', () => {
  it('reads the documented shape', () => {
    const got = readSelectionRedirect(params({ step: 'select_page', ...FB }))
    expect(got?.platform).toBe('facebook')
    expect(got?.ours).toBe('facebook')
  })

  it('reads it when the step is spelled differently than the spec said', () => {
    // The regression this shape exists to survive. A wrong guess used to return
    // null, and null falls through to a reconcile that finds no account — because
    // Zernio never created one — and answers "nothing found". The customer sees
    // the original failure and nothing anywhere records why.
    const got = readSelectionRedirect(params({ step: 'selectPage', ...FB }), 'facebook')
    expect(got?.platform).toBe('facebook')
  })

  it('reads it with no step at all', () => {
    expect(readSelectionRedirect(params(FB), 'facebook')?.platform).toBe('facebook')
  })

  it('names Google Business from OUR id, never from Zernio’s', () => {
    // `gbp` to us, `googlebusiness` to them, and the redirect carries a `platform`
    // parameter that may hold either — ours from the return URL, theirs appended.
    // Deriving it instead is what stops the two disagreeing.
    const got = readSelectionRedirect(
      params({ step: 'select_location', profileId: FB.profileId, pendingDataToken: 'pdt_abc' }),
    )
    expect(got?.platform).toBe('googlebusiness')
    expect(got?.ours).toBe('gbp')
  })
})

describe('what it still refuses, so a token stays the trigger', () => {
  it('refuses a redirect carrying no token, whatever the step says', () => {
    // Without a token there is nothing to pick WITH, and a picker rendered here
    // would list nothing and blame the customer for it.
    expect(
      readSelectionRedirect(params({ step: 'select_page', profileId: FB.profileId })),
    ).toBeNull()
  })

  it('refuses a redirect carrying no profile id', () => {
    expect(readSelectionRedirect(params({ step: 'select_page', tempToken: 'EAAx' }))).toBeNull()
  })

  it('refuses to invent a platform from a token alone', () => {
    // A token with no step and no known press could belong to any flow. Guessing
    // would send the customer a picker for a channel they did not touch.
    expect(readSelectionRedirect(params(FB), null)).toBeNull()
  })

  it('refuses a pressed platform that needs no pick', () => {
    // Instagram resolves to an account on approval. A token here would not mean a
    // pending selection, and treating it as one would break a working flow.
    expect(readSelectionRedirect(params(FB), 'instagram')).toBeNull()
    expect(readSelectionRedirect(params(FB), 'linkedin')).toBeNull()
  })
})

describe('the diagnostic reports names and never values', () => {
  it('names the parameters that arrived', () => {
    const owed = unresolvedSelection('facebook', params({ ...FB, connect_token: 'ct_secret' }))
    expect(owed?.sawParams).toEqual(['connect_token', 'profileId', 'tempToken'])
  })

  it('carries NO token value anywhere in what it returns', () => {
    // `tempToken` is a live Facebook user access token and `connect_token` is a
    // Zernio credential. The NAMES are the whole diagnostic; the values are
    // secrets, and this object goes into an error report.
    const owed = unresolvedSelection('facebook', params({ ...FB, connect_token: 'ct_secret' }))
    const serialised = JSON.stringify(owed)
    expect(serialised).not.toContain('EAAxxLIVETOKENxx')
    expect(serialised).not.toContain('ct_secret')
  })

  it('claims nothing for a platform with no pick step', () => {
    expect(unresolvedSelection('instagram', params({}))).toBeNull()
    expect(unresolvedSelection(null, params({}))).toBeNull()
  })
})

describe('the two vocabularies stay paired', () => {
  it('round-trips every platform that has a picker', () => {
    for (const ours of ['facebook', 'gbp', 'pinterest'] as const) {
      const theirs = selectionPlatformFor(ours)
      expect(theirs).not.toBeNull()
      expect(ourPlatformFor(theirs as string)).toBe(ours)
    }
  })

  it('leaves every other platform on the flow that already works', () => {
    for (const ours of ['instagram', 'linkedin', 'x', 'discord'] as const) {
      expect(selectionPlatformFor(ours)).toBeNull()
    }
  })

  it('hosts the Pinterest board picker too', () => {
    // MEASURED: the founder photographed Zernio's own "Pick a default board"
    // screen mid-connect — its wordmark, its domain, asking a Sahoda customer
    // which board to pin to. That screen is what this removes.
    expect(selectionPlatformFor('pinterest')).toBe('pinterest')
    expect(ourPlatformFor('pinterest')).toBe('pinterest')
    expect(
      readSelectionRedirect(
        new URLSearchParams({ step: 'select_board', profileId: FB.profileId, tempToken: 'pina_x' }),
      )?.platform,
    ).toBe('pinterest')
  })
})

/**
 * THE NONCE THAT BINDS A RETURN TRIP TO THE PRESS THAT STARTED IT.
 *
 * A profile id is on every return URL the browser ever visited, so it cannot be
 * the thing that proves a picker belongs to this customer. Sixteen random bytes
 * per press, in an httpOnly cookie and on the URL, can: a link somebody else
 * built cannot carry a value that lives in the customer's own cookie jar.
 */
describe('the per-attempt nonce', () => {
  it('mints a fresh, well-formed value every time', () => {
    const a = mintConnectNonce()
    const b = mintConnectNonce()
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(a).not.toBe(b)
  })

  it('writes a cookie the trip home can carry, and one that expires', () => {
    const header = setConnectNonceHeader('abcdefghijklmnopqrstuv')
    expect(header).toContain(`${CONNECT_NONCE_COOKIE}=abcdefghijklmnopqrstuv`)
    expect(header).toContain('HttpOnly')
    expect(header).toContain('SameSite=Lax')
    expect(header).toContain('Path=/')
    expect(header).toMatch(/Max-Age=\d+/)
    expect(CLEAR_CONNECT_NONCE).toContain('Max-Age=0')
    expect(CLEAR_CONNECT_NONCE).toContain('Path=/')
  })

  it('reads its own cookie out of a jar full of others', () => {
    const jar = `__session=abc; ${CONNECT_NONCE_COOKIE}=abcdefghijklmnopqrstuv; sahoda_connect=facebook.popup`
    expect(readNonceCookie(jar)).toBe('abcdefghijklmnopqrstuv')
  })

  it('refuses a malformed cookie value rather than comparing it', () => {
    expect(readNonceCookie(`${CONNECT_NONCE_COOKIE}=short`)).toBeNull()
    expect(readNonceCookie(`${CONNECT_NONCE_COOKIE}=`)).toBeNull()
    expect(readNonceCookie('sahoda_connect=facebook.popup')).toBeNull()
    expect(readNonceCookie(null)).toBeNull()
  })

  it('is matched only when the cookie and the URL agree', () => {
    const nonce = mintConnectNonce()
    const cookie = `${CONNECT_NONCE_COOKIE}=${nonce}`
    expect(verifyConnectNonce(cookie, params({ [RETURN_NONCE_PARAM]: nonce }))).toBe('matched')
  })

  it('names a missing half as absent, not as a mismatch', () => {
    const nonce = mintConnectNonce()
    // Cookie dropped by the browser: the URL alone proves nothing.
    expect(verifyConnectNonce(null, params({ [RETURN_NONCE_PARAM]: nonce }))).toBe('absent')
    // URL stripped: the cookie alone proves nothing either.
    expect(verifyConnectNonce(`${CONNECT_NONCE_COOKIE}=${nonce}`, params({}))).toBe('absent')
    // Neither.
    expect(verifyConnectNonce(null, params({}))).toBe('absent')
  })

  it('names two different well-formed values as a mismatch', () => {
    // A link built from an OLD return URL: its nonce is real, and it is not the
    // one the latest press wrote to the cookie.
    const cookie = `${CONNECT_NONCE_COOKIE}=${mintConnectNonce()}`
    expect(verifyConnectNonce(cookie, params({ [RETURN_NONCE_PARAM]: mintConnectNonce() }))).toBe(
      'mismatched',
    )
  })

  it('treats a malformed URL value as absent, whatever the cookie holds', () => {
    const nonce = mintConnectNonce()
    expect(
      verifyConnectNonce(`${CONNECT_NONCE_COOKIE}=${nonce}`, params({ [RETURN_NONCE_PARAM]: 'x' })),
    ).toBe('absent')
  })
})
