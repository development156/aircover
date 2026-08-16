import type { Connection, ConnectionStatus } from '@sahoda/shared'

import { ChannelLogo } from '@/components/connections/channel-logo'
import { DisconnectButton } from '@/components/connections/disconnect-button'
import { ReconnectButton } from '@/components/connections/reconnect-button'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { Badge, type Rung } from '@/components/ui/badge'
import { accountLabel } from '@/lib/connections/account-label'
import { connectionHealth, handleOf, platformStatusOf } from '@/lib/connections/health'
import { cn } from '@/lib/utils'

/**
 * Status chip, exhaustively pinned over the frozen enum — a new status becomes
 * a compile error here, not an unstyled chip (same rule as StatusBadge).
 *
 * Now a RUNG rather than a colour pair. It had to become one: `--ok` is black
 * and `--warn` and `--danger` are both the brand orange, so `bg-ok-bg text-ok`
 * and `bg-danger-bg text-danger` had stopped distinguishing anything. The rung
 * carries it in fill weight and glyph instead.
 *
 * Chosen by URGENCY, as everywhere: `error` and `expired` both need you now, so
 * both are rung 1 — a revoked token and a dead one are the same problem to the
 * person whose posts have stopped going out.
 */
const STATUS_STYLES = {
  active: { label: 'Active', rung: 'active' },
  expired: { label: 'Expired', rung: 'urgent' },
  revoked: { label: 'Revoked', rung: 'calm' },
  error: { label: 'Error', rung: 'urgent' },
} satisfies Record<ConnectionStatus, { label: string; rung: Rung }>

export interface ConnectionRowProps {
  connection: Connection
  /** Injected so the countdown is deterministic in tests. */
  now?: Date
}

/**
 * One connected account, with the three facts that decide whether it will still
 * be working next week.
 *
 * `status` is OUR record and can be stale — it only changes when a publish fails
 * or someone disconnects. `platformStatus` and `needsReconnection` are Zernio's
 * verdict, written at reconcile. `expires_at` is the hard deadline: 60 days, no
 * refresh, no warning from anyone (doc 13 §2.5). All three are shown, because a
 * row that says "Active" while the token dies on Thursday is the exact shape of a
 * customer discovering their posts stopped a week after they did.
 *
 * Server component; both buttons are client islands.
 */
export function ConnectionRow({ connection, now = new Date() }: ConnectionRowProps) {
  const style = STATUS_STYLES[connection.status]
  const label = accountLabel(connection.external_account)
  const handle = handleOf(connection)
  const platformStatus = platformStatusOf(connection)
  const health = connectionHealth(connection, now)
  const channel = CHANNEL_LABELS[connection.platform]

  return (
    <div className="surface-ring space-y-2 rounded-card bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          {/* The mark, with no container around it. */}
          <ChannelLogo channel={connection.platform} />
          <span className="text-[14px] font-[650]">{channel}</span>
          <span className="max-w-[28ch] truncate text-[13px] text-muted">
            {handle ? `@${handle.replace(/^@/, '')}` : label}
          </span>
          <Badge rung={style.rung} data-status={connection.status}>
            {style.label}
          </Badge>
          {/* Zernio's own word for the account, when it gave one. Never invented:
              absent means they said nothing, which is not the same as "healthy". */}
          {platformStatus && platformStatus.toLowerCase() !== connection.status ? (
            <span className="rounded-pill bg-s1 px-2 py-[2px] text-[12px] text-muted">
              {platformStatus}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {health.kind === 'ok' ? null : (
            <ReconnectButton platform={connection.platform} label={channel} />
          )}
          <DisconnectButton connectionId={connection.id} label={label} />
        </div>
      </div>

      <p
        className={cn(
          'text-[12.5px] tabular-nums',
          health.kind === 'ok' ? 'text-muted' : 'text-warn',
        )}
      >
        {health.kind === 'needs-reconnect'
          ? (health.reason ?? 'Needs reconnecting before it can post again.')
          : health.kind === 'expired'
            ? 'Access has run out — scheduled posts will not go out.'
            : health.kind === 'expiring'
              ? health.daysLeft === 1
                ? 'Access ends tomorrow.'
                : `Access ends in ${health.daysLeft} days.`
              : health.daysLeft === null
                ? 'No expiry recorded for this account.'
                : `Access good for ${health.daysLeft} more days.`}
      </p>
    </div>
  )
}
