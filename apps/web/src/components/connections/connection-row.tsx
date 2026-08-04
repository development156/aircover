import type { Connection, ConnectionStatus } from '@sahoda/shared'

import { DisconnectButton } from '@/components/connections/disconnect-button'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { accountLabel } from '@/lib/connections/account-label'
import { cn } from '@/lib/utils'

/**
 * Status chip, exhaustively pinned over the frozen enum — a new status becomes
 * a compile error here, not an unstyled chip (same rule as StatusBadge).
 */
const STATUS_STYLES = {
  active: { label: 'Active', className: 'bg-ok-bg text-ok' },
  expired: { label: 'Expired', className: 'bg-warn-bg text-warn' },
  revoked: { label: 'Revoked', className: 'bg-s2 text-faint' },
  error: { label: 'Error', className: 'bg-danger-bg text-danger' },
} satisfies Record<ConnectionStatus, { label: string; className: string }>

export interface ConnectionRowProps {
  connection: Connection
}

/** One connected account. Server component; disconnect is the client island. */
export function ConnectionRow({ connection }: ConnectionRowProps) {
  const style = STATUS_STYLES[connection.status]
  const label = accountLabel(connection.external_account)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-bg px-4 py-3 shadow-card">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[15px] font-bold">{CHANNEL_LABELS[connection.platform]}</span>
        <span className="max-w-[28ch] truncate text-[13px] text-muted">{label}</span>
        <span
          data-status={connection.status}
          className={cn('rounded-pill px-2 py-[2px] text-[12px] font-semibold', style.className)}
        >
          {style.label}
        </span>
      </div>
      <DisconnectButton connectionId={connection.id} label={label} />
    </div>
  )
}
