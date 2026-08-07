import { AlertTriangle } from 'lucide-react'
import type { Connection } from '@sahoda/shared'

import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { healthMessage, needsAttention } from '@/lib/connections/health'

/**
 * The T-7 warning, and every other reason a connection needs a person.
 *
 * ── WHY THIS IS A RENDER AND NOT A NOTIFICATION JOB ──────────────────────────
 * Zernio tokens last exactly 60 days with no refresh and no expiry signal, so the
 * only fact available is `connections.expires_at`. Deriving the warning from that
 * column every time the page renders is idempotent by construction: it cannot fire
 * twice, it cannot fire for an account someone already reconnected, and it needs
 * no "already warned" table to stay correct. A job that sends and records would
 * have to solve deduplication and back-fill and could still be stale the moment
 * someone reconnects.
 *
 * What that costs, stated plainly: it only reaches someone who opens the app. An
 * emailed T-7 would reach someone who does not — that needs the notification rail,
 * and is noted in REQUESTS.md rather than faked here.
 */
export function ConnectionHealthBanner({
  connections,
  now = new Date(),
}: {
  connections: readonly Connection[]
  now?: Date
}) {
  const attention = needsAttention(connections, now)
  if (attention.length === 0) return null

  return (
    <div role="alert" className="space-y-1.5 rounded-card border border-warn bg-warn-bg p-3">
      <p className="type-eyebrow flex items-center gap-1.5 text-warn">
        <AlertTriangle size={13} aria-hidden />
        {attention.length === 1 ? 'A channel needs attention' : 'Channels need attention'}
      </p>
      <ul className="space-y-1">
        {attention.map(({ connection, health }) => (
          <li key={connection.id} className="text-[13px] text-warn">
            {healthMessage(CHANNEL_LABELS[connection.platform], health)}
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-warn opacity-80">
        Scheduled posts on a channel that has run out will not go out.
      </p>
    </div>
  )
}
