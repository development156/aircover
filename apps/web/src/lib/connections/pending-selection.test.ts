import { describe, expect, it } from 'vitest'

import {
  CLEAR_PENDING_SELECTION,
  parsePendingSelection,
  PENDING_SELECTION_COOKIE,
  setPendingSelectionHeader,
} from './pending-selection'

/**
 * THE COOKIE THAT CARRIES A LIVE FACEBOOK TOKEN ACROSS ONE CLICK.
 *
 * The obvious build puts `tempToken` in the picker's HTML as a hidden input. It is
 * a live Facebook user access token — Zernio's own error text says it "starts with
 * EAA" — and CLAUDE.md's rule is that OAuth tokens are never logged or returned.
 * Writing one into a page body is returning it.
 *
 * So it rides here instead: httpOnly, path-scoped, and dead in ten minutes. These
 * tests pin the three properties that make that true, and the whole-or-nothing
 * parse that stops a half-read state reaching Zernio as a malformed request the
 * customer would read as "connecting is broken".
 */

const VALID = {
  platform: 'facebook' as const,
  state: { profileId: '6a75cae32853ee463c6419d6', tempToken: 'EAAxxLIVETOKENxx' },
}

const encode = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')

describe('the cookie the picker sets', () => {
  it('is httpOnly, path-scoped and short-lived', () => {
    const header = setPendingSelectionHeader(VALID)

    expect(header).toContain('HttpOnly')
    expect(header).toContain('Path=/')
    // Ten minutes, and not a round number picked for looks: Zernio's spec says a
    // pending-data token is one-time-use and expires after ten. A cookie outliving
    // it would only ever authorise a call that must fail.
    expect(header).toContain('Max-Age=600')
    // Lax and not Strict. The trip that SETS this is a cross-site top-level GET
    // (Facebook to Zernio to us), which Strict would drop — leaving every real
    // pick looking like an expired one.
    expect(header).toContain('SameSite=Lax')
  })

  it('round-trips the state it was given', () => {
    const raw = setPendingSelectionHeader(VALID).slice(`${PENDING_SELECTION_COOKIE}=`.length)
    expect(parsePendingSelection(raw.split(';')[0])).toEqual(VALID)
  })

  it('clears on the SAME path it was set on', () => {
    // A clear that omits the path silently fails to match, which is the failure
    // mode where everything looks right and the token is still in the jar.
    expect(CLEAR_PENDING_SELECTION).toContain('Path=/')
    expect(CLEAR_PENDING_SELECTION).toContain('Max-Age=0')
  })
})

describe('what the parse refuses, whole rather than in part', () => {
  it('refuses a platform we have not built a picker for', () => {
    // A headless connect for a platform whose second half does not exist returns
    // the customer to a route that cannot finish. Refusing here is the fail-closed
    // direction: they press Connect again and get the flow that works.
    expect(parsePendingSelection(encode({ ...VALID, platform: 'linkedin' }))).toBeNull()
    expect(parsePendingSelection(encode({ ...VALID, platform: 'pinterest' }))).toBeNull()
  })

  it('refuses a profile id that is not Zernio’s shape', () => {
    // 24 lowercase hex, the same check `upsert_zernio_connection` makes in SQL.
    for (const profileId of ['', 'not-an-id', '6A75CAE32853EE463C6419D6', '6a75cae3']) {
      expect(
        parsePendingSelection(encode({ ...VALID, state: { ...VALID.state, profileId } })),
      ).toBeNull()
    }
  })

  it('refuses a state carrying no token at all', () => {
    // "The platform survived but the token did not" is a state nothing downstream
    // should have to reason about: it reaches Zernio as a 400 the customer reads
    // as "connecting is broken".
    expect(
      parsePendingSelection(encode({ ...VALID, state: { profileId: VALID.state.profileId } })),
    ).toBeNull()
  })

  it('accepts a Google Business pick, which carries the other token', () => {
    const gbp = {
      platform: 'googlebusiness' as const,
      state: { profileId: '6a75cae32853ee463c6419d6', pendingDataToken: 'pdt_abc' },
    }
    expect(parsePendingSelection(encode(gbp))?.platform).toBe('googlebusiness')
  })

  it('refuses junk without throwing', () => {
    // A malformed cookie must produce "there is no pick in flight", never a 500.
    for (const raw of [
      undefined,
      '',
      'not-base64!!!',
      encode('a string'),
      encode(null),
      encode([]),
    ]) {
      expect(parsePendingSelection(raw as string | undefined)).toBeNull()
    }
  })
})
