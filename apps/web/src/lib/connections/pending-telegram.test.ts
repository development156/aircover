import { describe, expect, it } from 'vitest'

import {
  CLEAR_PENDING_TELEGRAM,
  isTelegramCode,
  PENDING_TELEGRAM_COOKIE,
  setPendingTelegramHeader,
} from './pending-telegram'

/**
 * THE COOKIE THAT DECIDES WHOSE PAIRING ATTEMPT A POLL MAY ASK ABOUT.
 *
 * `PATCH /v1/connect/telegram?code=…` answers for ANY code, not only ours: its
 * status while pending, and the channel's title and type once it lands. Taking
 * the code from the request would make this app the thing that tries somebody
 * else's. It comes from an httpOnly cookie instead, so a browser can only poll
 * a code it was issued.
 */
describe('the pairing-code cookie', () => {
  it('is httpOnly, path-scoped, and dies with the code', () => {
    const header = setPendingTelegramHeader('ZRN-DLPTJW')

    expect(header.startsWith(`${PENDING_TELEGRAM_COOKIE}=`)).toBe(true)
    expect(header).toContain('HttpOnly')
    expect(header).toContain('Path=/')
    // Fifteen minutes — Zernio's own `expiresIn`, MEASURED at 900 seconds, not a
    // round number chosen here. A cookie outliving the code would only ever
    // authorise a poll that must answer `expired`.
    expect(header).toContain('Max-Age=900')
    expect(header).toContain('SameSite=Lax')
  })

  it('clears on the SAME path it was set on', () => {
    // A clear that omits the path silently fails to match, which is the failure
    // mode where everything looks right and the value is still in the jar.
    expect(CLEAR_PENDING_TELEGRAM).toContain('Path=/')
    expect(CLEAR_PENDING_TELEGRAM).toContain('Max-Age=0')
  })
})

describe('what counts as a code', () => {
  it('accepts the shape Zernio actually issues', () => {
    // MEASURED from a live issue on 2026-08-27.
    expect(isTelegramCode('ZRN-DLPTJW')).toBe(true)
  })

  it('refuses anything else, because this value is interpolated into a URL we call', () => {
    // httpOnly is not the same as unwritable — a subdomain, an earlier XSS or a
    // shared machine can all put a value in the jar. Validated on the way OUT as
    // well as in.
    for (const bad of [
      '',
      'ZRNDLPTJW',
      'zrn-dlptjw',
      'ZRN-DLPTJW&code=SOMEONEELSE',
      'ZRN-DLPTJW/../../accounts',
      '../../etc/passwd',
      'ZRN-' + 'A'.repeat(64),
    ]) {
      expect(isTelegramCode(bad), bad).toBe(false)
    }
  })

  it('refuses a non-string without throwing', () => {
    for (const bad of [undefined, null, 42, {}, []]) {
      expect(isTelegramCode(bad)).toBe(false)
    }
  })
})
