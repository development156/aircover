import { describe, expect, it } from 'vitest'
import type { Connection } from '@sahoda/shared'

import { connectionHealth, healthMessage, needsAttention } from './health'

/**
 * THE SENTENCE THAT CALLED A WORKING ACCOUNT DEAD.
 *
 * ── WHAT HAPPENED ────────────────────────────────────────────────────────────
 * A customer connected X, it worked, and roughly two hours later /connections
 * told them "Reconnect X. Its access has run out and scheduled posts will not go
 * out." Nothing was wrong with the account. Reported twice, the second time as
 * "still the same problem with X".
 *
 * ── THE FIXTURES ARE REAL ────────────────────────────────────────────────────
 * Every timestamp and flag below is MEASURED 2026-08-27 from the live Zernio API
 * and from our own `connections` table, not invented. A fixture made up to suit
 * the fix would pass against a rule that is wrong in the same direction as the
 * code — which is exactly how the two-hour token went unnoticed while a comment
 * three lines above the bug asserted sixty days.
 */

function connection(over: Partial<Connection>): Connection {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    workspace_id: '8846b067-0000-4000-8000-000000000001',
    platform: 'x',
    status: 'active',
    external_account: {},
    scopes: null,
    expires_at: null,
    last_checked_at: null,
    created_by: null,
    created_at: '2026-08-27T05:35:18.782332+00:00',
    updated_at: '2026-08-27T05:35:18.782332+00:00',
    ...over,
  } as Connection
}

/** The real X row, exactly as `upsert_zernio_connection` wrote it. */
const X_ROW = connection({
  platform: 'x',
  external_account: {
    id: '6a8fcc9477555aae01e7cb9c',
    profileId: '6a7efffaf7c78d193906be18',
    handle: 'MahapatraDivas',
    platformStatus: 'active',
    needsReconnection: false,
  },
  // MEASURED: `tokenExpiresAt`, two hours after the account was created at Zernio.
  expires_at: '2026-08-27T07:35:16.167+00:00',
})

/** Two hours and change after the token above died. Zernio has since rotated it. */
const AFTER_THE_TWO_HOURS = new Date('2026-08-27T08:00:00.000Z')

describe('a token Zernio holds is not the customer’s deadline', () => {
  it('does not call a freshly connected X account expired', () => {
    // THE REGRESSION. Before the fix this was { kind: 'expired' }.
    // `daysLeft` is null, and that is the second half of the same fix. The first
    // version of it carried the real number through — `-1` here — on the argument
    // that a true number is worth showing. `channel-accounts.tsx` renders
    // `{daysLeft}d left` for this exact verdict, so the founder's next screenshot
    // showed **"0d left"** beside "Connected" on a working X account: the same
    // false claim, in fewer words. We do not know when a connection Zernio holds
    // ends. `null` says that.
    expect(connectionHealth(X_ROW, AFTER_THE_TWO_HOURS)).toEqual({ kind: 'ok', daysLeft: null })
  })

  it('says nothing to the customer about it', () => {
    // The verdict is only half the defect. This is the sentence they actually read.
    const message = healthMessage('X', connectionHealth(X_ROW, AFTER_THE_TWO_HOURS))
    expect(message).toBeNull()
  })

  it('keeps it out of the attention list, so no banner claims an outage', () => {
    expect(needsAttention([X_ROW], AFTER_THE_TWO_HOURS)).toEqual([])
  })

  it('offers no countdown at all, because there is no deadline to count to', () => {
    // THE SECOND REGRESSION, and the one the founder saw AFTER the first fix.
    // `channel-accounts.tsx` renders this number and nothing else gates it.
    const health = connectionHealth(X_ROW, AFTER_THE_TWO_HOURS)
    expect(health.kind === 'ok' ? health.daysLeft : 'not-ok').toBeNull()
  })

  it('is still quiet a week later, because the rotation never lands in our row', () => {
    // `expires_at` is refreshed only on a return trip, so a working provider-held
    // connection sits at a long-past timestamp indefinitely. A rule that merely
    // widened the grace period would pass the three tests above and fail here.
    const aWeekOn = new Date('2026-09-03T08:00:00.000Z')
    expect(connectionHealth(X_ROW, aWeekOn).kind).toBe('ok')
  })

  it('does not soften the T-7 warning either, for a provider-held row', () => {
    // The other half of the same claim. Six days out is still not our deadline.
    const sixDaysBefore = new Date('2026-08-21T07:35:16.167Z')
    expect(connectionHealth(X_ROW, sixDaysBefore).kind).toBe('ok')
  })
})

describe('what actually detects a broken Zernio connection', () => {
  /**
   * MEASURED on the same trip: the Instagram rows in this workspace that really
   * were broken carried Zernio's flag AND an expiry two months in the FUTURE.
   * Expiry never caught them. This is what did, and it must keep doing so.
   */
  const BROKEN_INSTAGRAM = connection({
    platform: 'instagram',
    external_account: {
      id: '6a7f0102f7c78d193906be99',
      profileId: '6a7efffaf7c78d193906be18',
      platformStatus: 'not listed under this profile',
      needsReconnection: true,
    },
    expires_at: '2026-10-25T00:00:00.000+00:00',
  })

  it('still flags it, with Zernio’s own reason', () => {
    expect(connectionHealth(BROKEN_INSTAGRAM, AFTER_THE_TWO_HOURS)).toEqual({
      kind: 'needs-reconnect',
      reason: 'not listed under this profile',
    })
  })

  it('still flags a row we marked non-active ourselves', () => {
    const revoked = connection({
      status: 'revoked',
      external_account: { id: 'a'.repeat(24), profileId: 'b'.repeat(24) },
    })
    expect(connectionHealth(revoked, AFTER_THE_TWO_HOURS).kind).toBe('needs-reconnect')
  })
})

describe('a token WE hold still expires, and still says so', () => {
  /**
   * The native path — `upsert_connection`, which seals a token into
   * `connection_secrets`. It writes no `profileId`, and that absence is the whole
   * discriminator. Here `expires_at` is our own deadline and the old behaviour is
   * correct and unchanged.
   *
   * Without these four, the fix reads as "stop warning about expiry" rather than
   * "stop attributing somebody else's expiry to the customer", and nothing would
   * notice if the expiry branches were deleted outright.
   */
  const native = (expiresAt: string) =>
    connection({
      platform: 'linkedin',
      external_account: { id: 'urn:li:person:abc', handle: 'divas' },
      expires_at: expiresAt,
    })

  it('reports expired once the deadline has passed', () => {
    expect(connectionHealth(native('2026-08-27T00:00:00.000Z'), AFTER_THE_TWO_HOURS)).toEqual({
      kind: 'expired',
      daysLeft: 0,
    })
  })

  it('warns inside the T-7 window', () => {
    const health = connectionHealth(native('2026-08-30T08:00:00.000Z'), AFTER_THE_TWO_HOURS)
    expect(health).toEqual({ kind: 'expiring', daysLeft: 3 })
    expect(healthMessage('LinkedIn', health)).toBe(
      'Reconnect LinkedIn within 3 days. Access ends then.',
    )
  })

  it('stays quiet well outside the window', () => {
    expect(connectionHealth(native('2026-11-01T00:00:00.000Z'), AFTER_THE_TWO_HOURS).kind).toBe(
      'ok',
    )
  })

  it('still sorts a native expiry above a native warning', () => {
    const ranked = needsAttention(
      [native('2026-08-30T08:00:00.000Z'), native('2026-08-01T00:00:00.000Z')],
      AFTER_THE_TWO_HOURS,
    )
    expect(ranked.map((r) => r.health.kind)).toEqual(['expired', 'expiring'])
  })
})
