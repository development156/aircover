import { Link2 } from 'lucide-react'
import type { ConnectionPlatform } from '@sahoda/shared'

import { ChannelTile } from '@/components/connections/channel-tile'
import { ConnectionHealthBanner } from '@/components/connections/connection-health-banner'
import { ConnectOutcomeNotice } from '@/components/connections/connect-outcome-notice'
import { EmptyState } from '@/components/empty-state'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { PageTitle } from '@/components/page-title'
import { checkCountableLimit } from '@/lib/billing/entitlements'
import { readConnections, readConnectionSlots } from '@/lib/connections/read'
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
 * Channel groups (reference `GROUPS`).
 *
 * The reference groups its ecosystem into sections and renders each as its own
 * 4-column grid. This product has four channels, and they genuinely divide:
 * three are feeds you post INTO, one is a listing customers find you THROUGH.
 * Grouping is not decoration here — "why is Google Business Profile in with
 * Instagram" is a real question, and the section heading answers it.
 *
 * A group with no channels renders nothing, exactly as the reference does.
 */
const GROUPS: ReadonlyArray<{ name: string; channels: ConnectionPlatform[] }> = [
  { name: 'Social', channels: ['instagram', 'linkedin', 'x'] },
  { name: 'Local listings', channels: ['gbp'] },
]

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
  // ONE read, three answers. This page used to take two — `listConnections()` for
  // the rows and `getActiveWorkspace()` to work out which of that read's two
  // nulls it was looking at — and the second was itself two meanings in one
  // value, so the "Create a workspace" branch fired on a failed workspace read
  // too. `readConnections` now returns the reason with the rows.
  const [connections, { zernio }, channelLimit] = await Promise.all([
    readConnections(),
    searchParams,
    channelLimitNotice(),
  ])
  const railReady = zernioAvailable()
  const planFull = channelLimit !== null

  // One lookup, so a channel appears exactly once whether or not it is linked.
  const rows = connections.status === 'ok' ? connections.connections : []
  const byChannel = new Map(rows.map((c) => [c.platform, c]))

  return (
    <div className="space-y-6">
      {/* The reference's `.page__hd`: title + sub on the left, tools right. */}
      <header className="flex flex-wrap items-start gap-3">
        <PageTitle sub="Connect your marketing ecosystem.">Connections</PageTitle>
      </header>

      {/* What just happened comes before what is there now. */}
      <ConnectOutcomeNotice status={zernio} />

      {connections.status === 'unreadable' ? (
        /* WE DID NOT FIND OUT. Not "no workspace" and not "no connections" —
           either would be a claim about the account drawn from a read that
           failed. This is the only branch on this page where reloading is the
           correct remedy, so it is the only one that offers it. */
        <p className="rounded-input bg-warn-bg px-3 py-2.5 text-[13px] text-warn">
          Couldn&rsquo;t check your connections just now &mdash; reload to see what&rsquo;s already
          linked.
        </p>
      ) : connections.status === 'no-workspace' ? (
        /* NO WORKSPACE IS NOT A FAILED READ. `listConnections()` returns null both
           when the read breaks AND when there is nothing to read, and this page
           used to render the failure copy for both — telling a brand-new account
           that Sahoda "couldn't check your connections" and offering NOTHING to
           press. MEASURED on a seeded account: 18 words, zero controls, and the
           one remedy on offer (reload) can never succeed.

           Run 9's rule: "read failed" and "no workspace yet" are different claims
           and only one of them is true here. /wallet and /home already say this
           properly; this is the same sentence in the same shape. */
        <EmptyState
          icon={Link2}
          title="Create a workspace to connect a channel"
          body="Channels belong to a workspace and you don't have one yet. Nothing failed — there is simply nothing to connect to until one exists."
          action={<CreateWorkspaceButton variant="primary" />}
        />
      ) : (
        <>
          {/* `.banner--alert` — the most expensive thing on this page is a
              broken connection, so it is stated at the top and never inferred
              from a colour on a tile further down. */}
          <ConnectionHealthBanner connections={rows} />

          {planFull ? (
            <p
              className="surface-ring rounded-card bg-s2 px-3 py-2.5 text-[13px] text-muted"
              role="status"
            >
              {channelLimit}
            </p>
          ) : null}

          {/* ONE GRID PER GROUP, one tile per channel. Connected and
              unconnected share the tile: which one you are looking at is a
              property of the channel, not a different kind of thing. */}
          {GROUPS.map((group) => {
            const channels = group.channels.filter((c) => CONNECTABLE.includes(c))
            if (channels.length === 0) return null
            const live = channels.filter((c) => byChannel.get(c)?.status === 'active').length

            return (
              <section
                key={group.name}
                className="space-y-3"
                data-guide={`connections.${group.name}`}
              >
                <div className="flex items-center gap-2">
                  <h2 className="text-[14px] font-semibold tracking-[-0.01em]">{group.name}</h2>
                  <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-s2 px-[5px] text-[11px] font-bold text-muted tabular-nums">
                    {live}/{channels.length}
                  </span>
                </div>
                <div className="grid gap-3 wide:grid-cols-3 max-wide:grid-cols-2 max-narrow:grid-cols-1">
                  {channels.map((channel) => (
                    <ChannelTile
                      key={channel}
                      channel={channel}
                      connection={byChannel.get(channel)}
                      unproven={UNPROVEN.has(channel)}
                      disabled={!(LIVE_VIA_ZERNIO.has(channel) && railReady && !planFull)}
                      disabledReason={
                        planFull
                          ? 'Your plan has no room for another channel.'
                          : LIVE_VIA_ZERNIO.has(channel)
                            ? railReady
                              ? undefined
                              : 'Publishing key isn\u2019t set in this environment.'
                            : 'Secure token flow still being wired.'
                      }
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
