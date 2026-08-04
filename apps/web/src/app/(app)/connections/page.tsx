import { Link2 } from 'lucide-react'
import type { ConnectionPlatform } from '@sahoda/shared'

import { ConnectButton } from '@/components/connections/connect-button'
import { ConnectionHealthBanner } from '@/components/connections/connection-health-banner'
import { ConnectionRow } from '@/components/connections/connection-row'
import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { listConnections } from '@/lib/connections/read'
import { zernioAvailable } from '@/lib/zernio/server'

export const metadata = { title: 'Connections' }

/**
 * Connections — still the honest version, now with one real path through it.
 *
 * INSTAGRAM connects for real, via Zernio: the profile mapping is written before
 * the user leaves, the return route re-derives the workspace from the session and
 * ignores every query parameter Zernio appends, and the account lands through
 * `upsert_zernio_connection`. No token of ours is involved — Zernio holds the Meta
 * credential, which is why an instagram row has no `connection_secrets` sibling.
 *
 * X and GBP are still disabled and still say why. Their flow needs the vault write
 * and the OAuth mounts, which are a different piece of work; a button that opens a
 * flow it cannot finish is worse than one that explains itself.
 */

/**
 * All four connect for real now, all through Zernio.
 *
 * x, gbp and linkedin were disabled because their NATIVE flow needs the vault write
 * that is still unbuilt. Routing them through Zernio removes that dependency
 * entirely — Zernio holds the credential, exactly as it does for instagram — so the
 * buttons can finally do what they say.
 */
const CONNECTABLE: ConnectionPlatform[] = ['instagram', 'x', 'gbp', 'linkedin']
const LIVE_VIA_ZERNIO = new Set<ConnectionPlatform>(['instagram', 'x', 'gbp', 'linkedin'])

export default async function ConnectionsPage() {
  const connections = await listConnections()
  const railReady = zernioAvailable()

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
        <>
          {/* Above the list: someone scanning for "is anything wrong" should not have
              to read every row to find out. */}
          <ConnectionHealthBanner connections={connections} />
          <ul className="space-y-2" data-guide="connections.list">
            {connections.map((connection) => (
              <li key={connection.id}>
                <ConnectionRow connection={connection} />
              </li>
            ))}
          </ul>
        </>
      )}

      <section className="space-y-3 rounded-card border border-line bg-bg p-4 shadow-card">
        <div>
          <h2 className="text-[15px] leading-5 font-bold">Connect a channel</h2>
          <p className="text-[13px] text-muted">
            Each of these connects through our publishing partner, so you approve access once
            on the platform&rsquo;s own screen and nothing of yours is stored here.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          {CONNECTABLE.map((platform) => {
            const live = LIVE_VIA_ZERNIO.has(platform) && railReady
            return (
              <ConnectButton
                key={platform}
                platform={platform}
                label={CHANNEL_LABELS[platform]}
                disabled={!live}
                disabledReason={
                  LIVE_VIA_ZERNIO.has(platform)
                    ? railReady
                      ? undefined
                      : 'Publishing key isn’t set in this environment.'
                    : 'Secure token flow still being wired.'
                }
              />
            )
          })}
        </div>
      </section>
    </div>
  )
}
