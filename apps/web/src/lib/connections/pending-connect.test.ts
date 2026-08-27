import { describe, expect, it } from 'vitest'

import {
  CLEAR_PENDING_CONNECT,
  PENDING_CONNECT_COOKIE,
  parsePendingConnect,
} from './pending-connect'

/**
 * The cookie is `httpOnly`, so nothing in a page can write it — but it arrives on
 * a request, and a value that arrives is a value that can be malformed. Every test
 * here is about refusing whole rather than reading half.
 */
describe('a pending connect is read whole or not at all', () => {
  it('reads a well-formed value', () => {
    expect(parsePendingConnect('instagram.redirect')).toEqual({
      platform: 'instagram',
      mode: 'redirect',
    })
    expect(parsePendingConnect('linkedin.popup')).toEqual({
      platform: 'linkedin',
      mode: 'popup',
    })
  })

  it('refuses a platform that is not one we connect', () => {
    // The return route uses this to decide what may be CREATED. A platform outside
    // the allowlist reaching that decision would name a channel with no adapter.
    //
    // RETARGETED from `facebook`, which joined ZERNIO_PLATFORMS on 2026-08-26.
    // `youtube` is a real Zernio platform we deliberately do NOT connect, which
    // makes it a sharper probe than an invented string: it proves the allowlist
    // is OURS rather than a passthrough of whatever the provider supports.
    // RETARGETED FROM `youtube`, which stopped being an example of this on
    // 2026-08-26 — it is a connection platform now and `youtube.redirect` is a
    // legitimate cookie. `snapchat` is the sharper replacement for exactly the
    // reason the comment above gives: Zernio really names it, and we really
    // cannot connect it (403 PLATFORM_BETA_RESTRICTED), so it proves the
    // allowlist is OURS rather than a passthrough of Zernio's.
    expect(parsePendingConnect('snapchat.redirect')).toBeNull()
    expect(parsePendingConnect('../../etc.redirect')).toBeNull()
  })

  it('refuses an unknown mode rather than keeping the platform', () => {
    // Half a value is worse than none: "the platform survived but the mode did
    // not" is a state nothing downstream should have to reason about.
    expect(parsePendingConnect('instagram.iframe')).toBeNull()
  })

  it('refuses anything that is not exactly two parts', () => {
    expect(parsePendingConnect('instagram')).toBeNull()
    expect(parsePendingConnect('instagram.redirect.extra')).toBeNull()
    expect(parsePendingConnect('')).toBeNull()
    expect(parsePendingConnect(undefined)).toBeNull()
  })
})

describe('the clearing header actually clears', () => {
  it('names the same cookie and the same path it was set on', () => {
    // A clear that omits the path silently fails to match — everything looks
    // right and the cookie is still there on the next trip.
    expect(CLEAR_PENDING_CONNECT).toContain(`${PENDING_CONNECT_COOKIE}=`)
    expect(CLEAR_PENDING_CONNECT).toContain('Path=/')
    expect(CLEAR_PENDING_CONNECT).toContain('Max-Age=0')
  })

  it('stays HttpOnly and Lax while deleting', () => {
    expect(CLEAR_PENDING_CONNECT).toContain('HttpOnly')
    expect(CLEAR_PENDING_CONNECT).toContain('SameSite=Lax')
  })

  it('carries no Secure attribute, so a plain-HTTP dev server can act on it', () => {
    // This header only ever deletes. Refusing to send it over HTTP would leave a
    // stale cookie authorising a create on every local run.
    expect(CLEAR_PENDING_CONNECT).not.toContain('Secure')
  })
})
