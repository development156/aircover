import { Link2 } from 'lucide-react'
import type { ConnectionPlatform } from '@sahoda/shared'

import { ConnectionRow } from '@/components/connections/connection-row'
import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { Button } from '@/components/ui/button'
import { listConnections } from '@/lib/connections/read'

export const metadata = { title: 'Connections' }

/**
 * Connections — the HONEST version: read + disconnect are real (members hold
 * `conn_select`/`conn_delete`), CONNECTING is not. There is no INSERT policy,
 * no service-role client in apps/web, and the `upsert_connection` RPC is still
 * pending at wt-db (REQUESTS.md) — so the connect buttons are disabled with
 * the reason instead of pretending. Deliberately NO `connections.connect_x`
 * anchor on those disabled buttons: the tour step says to CONNECT, and a
 * disabled control cannot complete that sentence (registry ruling stands —
 * see lib/guide/anchors.ts).
 */

/** The two Alpha OAuth platforms; linkedin is a stretch goal, not promised. */
const CONNECTABLE: ConnectionPlatform[] = ['x', 'gbp']

export default async function ConnectionsPage() {
  const connections = await listConnections()

  return (
    <div className="space-y-grid">
      <PageTitle>Connections</PageTitle>

      {connections === null ? (
        <p className="rounded-input bg-warn-bg px-3 py-2.5 text-[13px] text-warn">
          Couldn&rsquo;t check your connections just now — reload to see what&rsquo;s already
          linked.
        </p>
      ) : connections.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No channels connected"
          body="Your connected accounts will be listed here with live status, and disconnecting always works from this screen."
        />
      ) : (
        <ul className="space-y-2" data-guide="connections.list">
          {connections.map((connection) => (
            <li key={connection.id}>
              <ConnectionRow connection={connection} />
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-3 rounded-card border border-line bg-bg p-4 shadow-card">
        <div>
          <h2 className="text-[15px] leading-5 font-bold">Connect a channel</h2>
          <p className="text-[13px] text-muted">
            Connecting isn&rsquo;t live yet — the secure token flow (OAuth mounts + server-side
            vault write) is still being wired. Nothing here will pretend otherwise.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {CONNECTABLE.map((platform) => (
            <Button key={platform} variant="secondary" size="sm" disabled>
              Connect {CHANNEL_LABELS[platform]}
            </Button>
          ))}
        </div>
      </section>
    </div>
  )
}
