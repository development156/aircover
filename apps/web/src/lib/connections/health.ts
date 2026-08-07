import type { Connection } from '@sahoda/shared'

/**
 * How a connection is actually doing, read off the row rather than assumed.
 *
 * ── WHY THIS IS DERIVED AND NOT STORED ───────────────────────────────────────
 * Zernio issues 60-day tokens with NO auto-refresh and NO proactive expiry signal
 * (doc 13 §2.5). Nothing tells us the day a token dies; the only fact we have is
 * `expires_at`, written when the account was reconciled. A warning computed from
 * that column at read time is idempotent by construction — it cannot fire twice,
 * cannot fire for a connection that has since been reconnected, and needs no
 * "have we already warned about this?" table to stay honest.
 *
 * The alternative — a job that sends a warning and records that it sent one — has
 * to solve deduplication, clock skew and back-fill, and can still be wrong the
 * moment someone reconnects. This cannot be wrong: it is a pure function of the
 * row the user is looking at.
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
  if (daysLeft <= 0) return { kind: 'expired', daysLeft: 0 }
  if (daysLeft <= EXPIRY_WARNING_DAYS) return { kind: 'expiring', daysLeft }
  return { kind: 'ok', daysLeft }
}

/** Sentence for the row, and for the workspace-wide banner. Verb-first, plain. */
export function healthMessage(platform: string, health: ConnectionHealth): string | null {
  switch (health.kind) {
    case 'needs-reconnect':
      return health.reason
        ? `Reconnect ${platform} — ${health.reason}.`
        : `Reconnect ${platform} to keep posting.`
    case 'expired':
      return `Reconnect ${platform} — its access has run out and scheduled posts will not go out.`
    case 'expiring':
      return health.daysLeft === 1
        ? `Reconnect ${platform} today — access ends tomorrow.`
        : `Reconnect ${platform} within ${health.daysLeft} days — access ends then.`
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
