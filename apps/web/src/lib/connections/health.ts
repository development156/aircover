import type { Connection } from '@sahoda/shared'

/**
 * How a connection is actually doing, read off the row rather than assumed.
 *
 * ── WHY THIS IS DERIVED AND NOT STORED ───────────────────────────────────────
 * A warning computed from the row at read time is idempotent by construction — it
 * cannot fire twice, cannot fire for a connection that has since been reconnected,
 * and needs no "have we already warned about this?" table to stay honest.
 *
 * The alternative — a job that sends a warning and records that it sent one — has
 * to solve deduplication, clock skew and back-fill, and can still be wrong the
 * moment someone reconnects. This cannot be wrong: it is a pure function of the
 * row the user is looking at.
 *
 * ── AND WHOSE DEADLINE `expires_at` IS ───────────────────────────────────────
 * This file used to open by asserting, from doc 13 §2.5, that "Zernio issues
 * 60-day tokens with NO auto-refresh", and it read `expires_at` as the day the
 * connection dies. MEASURED 2026-08-27 against the live API, that premise is
 * false for at least one platform and the sentence it produced was false with it:
 *
 *   platform          twitter (our `x`)
 *   createdAt         2026-08-27T05:35:16.436Z
 *   tokenExpiresAt    2026-08-27T07:35:16.167Z     ← two hours, not sixty days
 *   needsReconnection false
 *   platformStatus    "active"
 *   isActive          true
 *
 * X grants `offline.access`, so Zernio holds a refresh token and rotates that
 * two-hour access token on its own. Our row was written correctly and two hours
 * later the screen told the customer **"Reconnect X. Its access has run out and
 * scheduled posts will not go out."** about an account that was working. Reported
 * twice, the second time as "still the same problem with X".
 *
 * The distinction that fixes it is WHOSE TOKEN THE COLUMN DESCRIBES, and the row
 * already carries it. A connection Zernio holds has a `profileId` in
 * `external_account` and no row in `connection_secrets`: we never publish with
 * that token, Zernio does, and it refreshes what it can. Its expiry is an internal
 * detail of somebody else's credential store and is not evidence about the link.
 * A NATIVE connection — one whose token we sealed into `connection_secrets`
 * ourselves — has no `profileId`, and there `expires_at` is our own deadline and
 * means exactly what it says.
 *
 * So the expiry branches still exist and still run, unchanged, for the connections
 * they are true of. What went away is applying them to a credential we do not hold.
 *
 * ── WHAT ACTUALLY DETECTS A BROKEN ZERNIO CONNECTION ─────────────────────────
 * Zernio's own flags, and they were already being read. MEASURED on the same trip,
 * the genuinely broken Instagram rows in this workspace carried
 * `needsReconnection: true` and `platformStatus: "not listed under this profile"`
 * — while their `expires_at` sat two months in the FUTURE. Expiry did not catch
 * them and never would have; the flag did. That is the signal, and dropping the
 * expiry claim for these rows loses no detection.
 */

/** Days before expiry at which the user is warned. Doc 13's T-7. */
export const EXPIRY_WARNING_DAYS = 7

const MS_PER_DAY = 86_400_000

export type ConnectionHealth =
  /** Working, and not close to expiry. */
  | { kind: 'ok'; daysLeft: number | null }
  /** Working, but the token dies within EXPIRY_WARNING_DAYS. */
  | { kind: 'expiring'; daysLeft: number }
  /** The token's own deadline has passed, whatever the stored status still says. */
  | { kind: 'expired'; daysLeft: 0 }
  /** Zernio says this account must be reconnected, or our status says so. */
  | { kind: 'needs-reconnect'; reason: string | null }

/** Read one string field off the provider-written jsonb, defensively. */
function field(externalAccount: unknown, key: string): string | null {
  if (typeof externalAccount !== 'object' || externalAccount === null) return null
  const value = (externalAccount as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** Zernio's own verdict on the account, when it gave one. */
export function platformStatusOf(connection: Connection): string | null {
  return field(connection.external_account, 'platformStatus')
}

/** The @handle, when Zernio returned one. */
export function handleOf(connection: Connection): string | null {
  return (
    field(connection.external_account, 'handle') ?? field(connection.external_account, 'username')
  )
}

function needsReconnection(connection: Connection): boolean {
  if (typeof connection.external_account !== 'object' || connection.external_account === null) {
    return false
  }
  return (connection.external_account as Record<string, unknown>).needsReconnection === true
}

/**
 * True when the access token behind this connection is held by Zernio rather than
 * by us — so `expires_at` describes THEIR credential and not the customer's link.
 *
 * The test is `profileId` on the provider-written jsonb, because that is what the
 * distinction actually is rather than a proxy for it: `upsert_zernio_connection`
 * writes `jsonb_build_object('id', …, 'profileId', v_mapped)` on every row it
 * creates and writes nothing to `connection_secrets`, while `upsert_connection`
 * — the native path that seals a token we hold — writes no profile.
 *
 * A platform NAME would have been the wrong test. `x` is provider-held today and
 * the day an adapter holds its own token the answer flips, with nothing here to
 * say so; this reads the property that decides the question.
 */
function isProviderHeld(connection: Connection): boolean {
  return field(connection.external_account, 'profileId') !== null
}

/**
 * Whole days from `now` until the token expires. Negative once it has passed.
 *
 * Rounded DOWN so "6.9 days left" reads as 6, not 7 — a warning threshold that
 * rounds up would let the last day slip past unmentioned.
 */
export function daysUntil(expiresAt: string | null, now: Date): number | null {
  if (!expiresAt) return null
  const at = new Date(expiresAt)
  if (Number.isNaN(at.getTime())) return null
  return Math.floor((at.getTime() - now.getTime()) / MS_PER_DAY)
}

/**
 * The single verdict the UI renders.
 *
 * Order is load-bearing. A connection Zernio has flagged, or one we already marked
 * non-active, is `needs-reconnect` whatever its expiry says — an account that was
 * revoked yesterday does not become "fine for 50 more days" because the token had
 * a long life. Only then does expiry get a say.
 */
export function connectionHealth(connection: Connection, now: Date): ConnectionHealth {
  if (needsReconnection(connection) || connection.status !== 'active') {
    return { kind: 'needs-reconnect', reason: platformStatusOf(connection) }
  }

  const daysLeft = daysUntil(connection.expires_at, now)
  if (daysLeft === null) return { kind: 'ok', daysLeft: null }

  /**
   * SOMEBODY ELSE'S TOKEN, SOMEBODY ELSE'S DEADLINE. See the header: for a
   * provider-held connection this column is the expiry of a credential Zernio
   * owns and rotates, and X's is two hours long. Reporting it as the customer's
   * deadline produced a "reconnect, your access has run out" sentence about a
   * healthy account within two hours of every X connect.
   *
   * `daysLeft` is still carried on the `ok` verdict rather than blanked. It is a
   * true number and a reader may want it; what is dropped is the CLAIM built on
   * top of it.
   */
  if (isProviderHeld(connection)) return { kind: 'ok', daysLeft }

  if (daysLeft <= 0) return { kind: 'expired', daysLeft: 0 }
  if (daysLeft <= EXPIRY_WARNING_DAYS) return { kind: 'expiring', daysLeft }
  return { kind: 'ok', daysLeft }
}

/** Sentence for the row, and for the workspace-wide banner. Verb-first, plain. */
export function healthMessage(platform: string, health: ConnectionHealth): string | null {
  switch (health.kind) {
    case 'needs-reconnect':
      return health.reason
        ? `Reconnect ${platform}: ${health.reason}.`
        : `Reconnect ${platform} to keep posting.`
    case 'expired':
      return `Reconnect ${platform}. Its access has run out and scheduled posts will not go out.`
    case 'expiring':
      return health.daysLeft === 1
        ? `Reconnect ${platform} today. Access ends tomorrow.`
        : `Reconnect ${platform} within ${health.daysLeft} days. Access ends then.`
    case 'ok':
      return null
  }
}

/** Connections a person needs to do something about, worst first. */
export function needsAttention(
  connections: readonly Connection[],
  now: Date,
): { connection: Connection; health: ConnectionHealth }[] {
  const rank = { 'needs-reconnect': 0, expired: 1, expiring: 2, ok: 3 } as const
  return connections
    .map((connection) => ({ connection, health: connectionHealth(connection, now) }))
    .filter((row) => row.health.kind !== 'ok')
    .sort((a, b) => rank[a.health.kind] - rank[b.health.kind])
}
