import { Link2 } from 'lucide-react'
import type { ConnectionPlatform } from '@sahoda/shared'

import { ConnectButton } from '@/components/connections/connect-button'
import { ConnectionHealthBanner } from '@/components/connections/connection-health-banner'
import { ConnectionRow } from '@/components/connections/connection-row'
import { ConnectOutcomeNotice } from '@/components/connections/connect-outcome-notice'
import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { checkCountableLimit } from '@/lib/billing/entitlements'
import { listConnections, readConnectionSlots } from '@/lib/connections/read'
import { getActiveWorkspace } from '@/lib/workspaces'
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

/**
 * Listed and wired, but never yet proven to publish against the real platform.
 *
 * THE FOURTH, INFORMATIONAL STATE. The kit's connection enum is
 * connected | disconnected | error, and on these two `disconnected` reads as an
 * INVITATION the customer cannot accept — a live-looking "Connect X" that only
 * fails after they have already approved access on X's own screen.
 *
 * Every live connection row in this product is instagram or linkedin; x and gbp
 * exist in fixtures and in the adapter layer and have never completed a real
 * publish. Saying so on the card is the honest version, and it costs the
 * customer nothing to know it BEFORE the redirect rather than after.
 *
 * Delete an entry here the day that channel publishes live — this is a claim
 * about evidence, not about code.
 */
const UNPROVEN = new Set<ConnectionPlatform>(['x', 'gbp'])

/**
 * The plan sentence when this workspace has no room for another channel, else null.
 *
 * Read from the DATABASE, never from the query string — the same rule
 * `ConnectOutcomeNotice` follows when it refuses to render counts off the address
 * bar. The `?zernio=limit` notice says WHAT happened in fixed words; these are the
 * real numbers behind it.
 *
 * Null on every "could not tell" case. The return route fails closed regardless, so
 * nothing is admitted by this being null; what it avoids is telling someone their
 * plan is full when the truth is we could not read it.
 */
async function channelLimitNotice(): Promise<string | null> {
  const workspace = await getActiveWorkspace()
  if (!workspace) return null

  const slots = await readConnectionSlots(workspace.id)
  if (slots === null) return null

  const verdict = await checkCountableLimit(workspace.id, 'channels', slots.count)
  return verdict.kind === 'blocked' ? verdict.sentence : null
}

export default async function ConnectionsPage({
  searchParams,
}: {
  /**
   * Written by `/api/oauth/zernio/return`. `reason` is deliberately NOT read here —
   * it exists for the log reader; the notice's words come from `zernio` alone,
   * matched against an allowlist. Everything in this URL came through the user's
   * browser, which is the same reason the return route refuses to read `accountId`
   * off it.
   */
  searchParams: Promise<{ zernio?: string | string[] }>
}) {
  const [connections, { zernio }, channelLimit] = await Promise.all([
    listConnections(),
    searchParams,
    channelLimitNotice(),
  ])
  const railReady = zernioAvailable()
  const planFull = channelLimit !== null

  return (
    <div className="space-y-grid">
      <PageTitle>Connections</PageTitle>

      {/* Below the title and above everything else: what just happened comes before
          what is there now, and a partial connect has to be read before the list is
          mistaken for the whole story. */}
      <ConnectOutcomeNotice status={zernio} />

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

      <section className="surface-ring space-y-3 rounded-card bg-surface p-4">
        <div>
          <h2 className="text-[15px] leading-5 font-bold">Connect a channel</h2>
          <p className="text-[13px] text-muted">
            Each of these connects through our publishing partner, so you approve access once on the
            platform&rsquo;s own screen and nothing of yours is stored here.
          </p>
        </div>
        {/* The limit BEFORE the click. Without it the customer approves access on
            the platform's own screen, comes back, and only then learns their plan
            had no room — work we could have saved them for free. */}
        {planFull ? (
          <p className="rounded-input bg-s2 px-3 py-2.5 text-[13px] text-muted" role="status">
            {channelLimit}
          </p>
        ) : null}

        <div className="flex flex-wrap items-start gap-3">
          {CONNECTABLE.map((platform) => {
            const live = LIVE_VIA_ZERNIO.has(platform) && railReady && !planFull
            return (
              <ConnectButton
                key={platform}
                platform={platform}
                label={CHANNEL_LABELS[platform]}
                note={UNPROVEN.has(platform) ? 'Not verified live' : undefined}
                disabled={!live}
                disabledReason={
                  planFull
                    ? 'Your plan has no room for another channel.'
                    : LIVE_VIA_ZERNIO.has(platform)
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
