import type { Connection } from '@sahoda/shared'

import { DisconnectButton } from '@/components/connections/disconnect-button'
import { ReconnectButton } from '@/components/connections/reconnect-button'
import { Badge, type Rung } from '@/components/ui/badge'
import { accountLabel } from '@/lib/connections/account-label'
import { connectionHealth, handleOf } from '@/lib/connections/health'
import type { Channel } from '@sahoda/shared'

/**
 * ONE ROW PER ACCOUNT, BECAUSE ONE ACCOUNT IS ONE SLOT.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
 * The tile took a single `connection` and the page handed it one, built from
 * `new Map(rows.map((c) => [c.platform, c]))`. A Map keeps the last value written
 * for a key, so a workspace holding two Instagram accounts saw ONE of them. The
 * other was not collapsed behind a control and not summarised in a count — it was
 * absent, while still drawing a slot from the plan and still publishing posts.
 *
 * The database has always allowed this: `connections_ws_platform_account` is
 * unique on `(workspace_id, platform, external_account ->> 'id')`, and both OAuth
 * routes count ROWS against the plan. The screen was the only layer that thought a
 * platform could hold one account.
 *
 * ── EVERY ACCOUNT CARRIES ITS OWN STATUS AND ITS OWN CONTROL ─────────────────
 * A shared badge would have to answer "is Instagram connected" for two accounts
 * where one is live and the other expired, and there is no honest answer to that.
 * A shared Disconnect is worse: it would have to pick one, and picking silently is
 * how somebody removes the wrong account.
 */

function statusOf(connection: Connection, now: Date): { rung: Rung; label: string } {
  const health = connectionHealth(connection, now)
  if (connection.status === 'active' && health.kind === 'ok') {
    return { rung: 'active', label: 'Connected' }
  }
  // Everything else needs a person. A dead token and an expiring one are the
  // same problem to whoever's posts stop going out.
  return { rung: 'urgent', label: 'Needs you' }
}

/**
 * The name a person recognises for this account.
 *
 * The handle first, because that is what they see on the platform itself. A
 * connection that stored neither a handle nor a label falls back to a sentence
 * rather than to an empty string or a raw id: "Connected account" is vague, but
 * a bare `6a75caf7d0fe733d1afcc1f4` is worse, and a blank row is worst.
 */
export function displayNameFor(connection: Connection): string {
  const handle = handleOf(connection)
  if (handle) return `@${handle.replace(/^@/, '')}`
  return accountLabel(connection.external_account) ?? 'Connected account'
}

export function ChannelAccounts({
  channel,
  label,
  connections,
  now,
}: {
  channel: Channel
  /** The channel's short name, for the reconnect control's own sentence. */
  label: string
  connections: readonly Connection[]
  now: Date
}) {
  return (
    <ul className="space-y-2">
      {connections.map((connection) => {
        const status = statusOf(connection, now)
        const health = connectionHealth(connection, now)
        const name = displayNameFor(connection)

        return (
          <li
            key={connection.id}
            /* A hook per ACCOUNT, so a test can address one of two rather than
               asserting on whichever the query happened to return first. */
            data-account={connection.id}
            data-account-status={status.rung}
            className="rounded-input bg-s2 px-2.5 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="type-sm min-w-0 flex-1 truncate font-medium">{name}</p>
              {/* The expiry line. 60 days, no refresh, no warning from anyone, so
                  an account that says "Connected" without saying "for how much
                  longer" is the shape of a customer finding out a week after
                  their posts died. Per account, because two accounts connected
                  two months apart do not expire together. */}
              {health.kind === 'ok' && health.daysLeft !== null ? (
                <span className="type-sm num shrink-0 text-muted">{health.daysLeft}d left</span>
              ) : null}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5">
              <Badge rung={status.rung}>{status.label}</Badge>
              <span className="flex items-center gap-1">
                {health.kind !== 'ok' ? <ReconnectButton platform={channel} label={label} /> : null}
                {/* Labelled with the ACCOUNT, never the channel. "Disconnect
                    Instagram" beside two Instagram accounts names neither of
                    them, and the confirm step is the last thing a person reads
                    before a token goes away for good. */}
                <DisconnectButton connectionId={connection.id} label={name} />
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
