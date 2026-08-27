import { describe, expect, it } from 'vitest'

import {
  ourPlatformFor,
  readSelectionRedirect,
  selectionPlatformFor,
  unresolvedSelection,
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
    for (const ours of ['facebook', 'gbp'] as const) {
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
})
