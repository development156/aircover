import type { Channel, Connection } from '@sahoda/shared'

import { ChannelLogo } from '@/components/connections/channel-logo'
import { ConnectButton } from '@/components/connections/connect-button'
import { DisconnectButton } from '@/components/connections/disconnect-button'
import { ReconnectButton } from '@/components/connections/reconnect-button'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { Badge, type Rung } from '@/components/ui/badge'
import { accountLabel } from '@/lib/connections/account-label'
import { connectionHealth, handleOf } from '@/lib/connections/health'

/**
 * ONE TILE PER CHANNEL — connected or not (reference `article.card--pad`).
 *
 * ── WHY THIS REPLACED TWO COMPONENTS ─────────────────────────────────────────
 * This page used to render connected accounts as full-width ROWS at the top and
 * unconnected ones as small cards inside a separate "Connect a channel" section
 * below. That is two designs for one idea. It also buried the answer to the
 * question people actually arrive with — "is Instagram working?" — because
 * finding a channel meant knowing first which of the two lists it was in.
 *
 * The reference uses a single tile in a single grid, and only the badge and the
 * button differ by state. A channel is a channel; whether it is connected is a
 * PROPERTY of it, not a different kind of thing.
 *
 * ── FOUR STATES, AND THE FOURTH IS THE HONEST ONE ────────────────────────────
 *   connected     rung 2, solid ink  — working
 *   needs you     rung 1, solid      — expired / revoked / errored / expiring
 *   informational rung 4, no glyph   — listed, never proven live (x, gbp)
 *   available     no badge           — connectable, nothing has happened yet
 *
 * The kit's enum is connected | disconnected | error. `disconnected` reads as an
 * INVITATION, which is wrong for a channel the customer cannot actually
 * complete — hence the fourth.
 */
export interface ChannelTileProps {
  channel: Channel
  /** The live row, when one exists. */
  connection?: Connection
  /** True when this channel has never completed a real publish. */
  unproven?: boolean
  /** Why connecting is unavailable right now, if it is. */
  disabledReason?: string
  disabled?: boolean
  now?: Date
}

function statusOf(
  connection: Connection | undefined,
  now: Date,
): { rung: Rung; label: string; glyph: boolean } | null {
  if (!connection) return null
  const health = connectionHealth(connection, now)
  if (connection.status === 'active' && health.kind === 'ok') {
    return { rung: 'active', label: 'Connected', glyph: true }
  }
  // Everything else needs a person. A dead token and an expiring one are the
  // same problem to whoever's posts stop going out.
  return { rung: 'urgent', label: 'Needs you', glyph: true }
}

export function ChannelTile({
  channel,
  connection,
  unproven,
  disabled,
  disabledReason,
  now = new Date(),
}: ChannelTileProps) {
  const status = statusOf(connection, now)
  const handle = connection ? handleOf(connection) : null
  const account = connection ? accountLabel(connection.external_account) : null
  const health = connection ? connectionHealth(connection, now) : null

  return (
    <article
      data-channel={channel}
      data-connected={connection ? 'true' : 'false'}
      className="surface-ring flex flex-col gap-3 rounded-card bg-surface p-4"
    >
      <div className="flex items-center gap-2">
        {/* The mark, uncontained — the tile's own ring is the only edge. */}
        <ChannelLogo channel={channel} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-[650]">{CHANNEL_LABELS[channel]}</p>
          <p className="truncate text-[11px] text-muted">
            {handle ? `@${handle.replace(/^@/, '')}` : (account ?? 'Not connected')}
          </p>
        </div>
      </div>

      <div className="flex min-h-[20px] items-center justify-between gap-2">
        {status ? (
          <Badge rung={status.rung}>{status.label}</Badge>
        ) : unproven ? (
          // `hideGlyph`: rung 4's glyph is a CHECK, and a tick beside "Not
          // verified live" claims the opposite of the words next to it.
          <Badge rung="calm" hideGlyph>
            Not verified live
          </Badge>
        ) : (
          <span className="text-[11px] text-muted">Available</span>
        )}
        {/* The expiry line. 60 days, no refresh, no warning from anyone — so a
            tile that says "Connected" without saying "for how much longer" is
            the shape of a customer finding out a week after their posts died. */}
        {health && health.kind === 'ok' && health.daysLeft !== null ? (
          <span className="text-[11px] text-muted tabular-nums">{health.daysLeft}d left</span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {connection ? (
          <>
            {health && health.kind !== 'ok' ? (
              <ReconnectButton platform={channel} label={CHANNEL_LABELS[channel]} />
            ) : null}
            <DisconnectButton
              connectionId={connection.id}
              label={account ?? CHANNEL_LABELS[channel]}
            />
          </>
        ) : (
          <ConnectButton
            platform={channel}
            label={CHANNEL_LABELS[channel]}
            disabled={disabled}
            disabledReason={disabledReason}
          />
        )}
      </div>
    </article>
  )
}
